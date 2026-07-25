"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LocalMediaAssetRegistry,
  createCenteredMediaPlacement,
  createMediaAssetDescriptor,
  keepMediaPlacementWithinPage,
  localMediaAssetIdFromString,
  MEDIA_FILE_INPUT_ACCEPT,
  runtimeMediaResourceIdFromString,
  type LocalMediaAssetRecord,
  type MediaPageBounds,
} from "@/lib/media-editor";
import {
  createMediaEditorHistoryState,
  freezeMediaOverlay,
  mediaEditorHistoryReducer,
} from "@/lib/media-editor-history";
import {
  MediaInspectionError,
} from "@/lib/media-inspection";
import {
  MediaSanitizationError,
  RasterSanitizationCoordinator,
} from "@/lib/media-sanitize";
import {
  MediaPersistenceWriter,
  hashSanitizedMediaBytes,
  hydrateCurrentMediaSnapshot,
  type MediaPersistenceResource,
  type MediaPersistenceSaveSnapshot,
} from "@/lib/media-persistence";
import { normalizeMediaRotation } from "@/lib/media-transform";
import type {
  LocalMediaAssetId,
  LocalMediaResourceId,
  MediaDocumentPersistenceSession,
  MediaOverlayState,
  MediaPlacement,
} from "@/lib/media-types";

interface MediaEditorProviderProps {
  readonly children: ReactNode;
  readonly currentPage: number;
  readonly getPageBounds: (
    pageIndex: number,
  ) => Readonly<MediaPageBounds> | null;
  readonly onMessage: (message: string, duration?: number) => void;
  readonly persistenceSession?: Readonly<MediaDocumentPersistenceSession>;
  readonly loadDocumentPageBounds?: () => Promise<
    readonly Readonly<MediaPageBounds>[]
  >;
}

interface MediaEditorBoundaryProps extends MediaEditorProviderProps {
  readonly enabled: boolean;
  readonly documentRevision: number;
}

export interface MediaEditorContextValue {
  readonly overlays: readonly Readonly<MediaOverlayState>[];
  readonly selectedAssetId: LocalMediaAssetId | null;
  readonly inputId: string;
  readonly isProcessing: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly openFilePicker: () => void;
  readonly getAsset: (assetId: LocalMediaAssetId) => Readonly<LocalMediaAssetRecord> | null;
  readonly selectAsset: (assetId: LocalMediaAssetId | null) => void;
  readonly commitPlacement: (
    assetId: LocalMediaAssetId,
    placement: Readonly<MediaPlacement>,
  ) => void;
  readonly rotateSelected: (deltaDegrees: number) => void;
  readonly flipSelected: (axis: "horizontal" | "vertical") => void;
  readonly deleteAsset: (assetId: LocalMediaAssetId) => void;
  readonly failClosedAsset: (assetId: LocalMediaAssetId) => void;
  readonly undo: () => void;
  readonly redo: () => void;
}

const MediaEditorContext = createContext<MediaEditorContextValue | null>(null);

function mediaErrorMessage(error: unknown): string | null {
  if (error instanceof MediaInspectionError) {
    switch (error.code) {
      case "animated-source":
        return "Animated WebP files aren’t supported. Choose a static JPEG, PNG, or WebP.";
      case "source-too-large":
        return "This image is too large to add safely. Choose one under 12 MB.";
      case "source-dimensions-exceeded":
      case "source-complexity-exceeded":
        return "This image has too many pixels or is too complex to add safely.";
      case "unsupported-format":
      case "unsupported-encoding":
        return "Choose a JPEG, PNG, or static WebP image.";
      case "empty-source":
      case "malformed-source":
        return "This image is empty or malformed. Choose a different file.";
    }
  }
  if (error instanceof MediaSanitizationError) {
    if (
      error.code === "aborted" ||
      error.code === "stale-generation" ||
      error.code === "coordinator-disposed"
    ) {
      return null;
    }
    if (error.code === "timed-out") {
      return "This image took too long to process and wasn’t added.";
    }
    if (error.code === "source-type-mismatch") {
      return "This image’s file type doesn’t match its contents.";
    }
    return "QuickFill couldn’t safely sanitize this image, so it wasn’t added.";
  }
  return "QuickFill couldn’t safely add this image.";
}

function createAssetId(sequence: number): LocalMediaAssetId {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().toLowerCase()
      : `${Date.now().toString(36)}-${sequence.toString(36)}`;
  return localMediaAssetIdFromString(`media-${randomPart}`);
}

async function waitForRenderedPageBounds(
  getPageBounds: (pageIndex: number) => Readonly<MediaPageBounds> | null,
  getCurrentPage: () => number,
  isCurrent: () => boolean,
): Promise<Readonly<{
  pageIndex: number;
  bounds: Readonly<MediaPageBounds>;
}> | null> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (!isCurrent()) return null;
    const pageIndex = getCurrentPage();
    const bounds = getPageBounds(pageIndex);
    if (bounds && getCurrentPage() === pageIndex) {
      return Object.freeze({ pageIndex, bounds });
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  return null;
}

const IN_MEMORY_MEDIA_SESSION = Object.freeze({
  status: "unavailable" as const,
});

const LOCAL_MEDIA_STORAGE_WARNING =
  "Media couldn’t be saved in this browser. Your PDF and regular fields are still available.";

function mediaSnapshotSignature(
  overlays: readonly Readonly<MediaOverlayState>[],
): string {
  return JSON.stringify(
    overlays.map((overlay) => ({
      assetId: overlay.assetId,
      resourceId: overlay.resourceId,
      pageIndex: overlay.placement.pageIndex,
      x: overlay.placement.xPts,
      y: overlay.placement.yPts,
      width: overlay.placement.widthPts,
      height: overlay.placement.heightPts,
      rotation: overlay.transform.rotationDeg,
      flipX: overlay.transform.flipX,
      flipY: overlay.transform.flipY,
    })),
  );
}

function persistenceSnapshot(
  overlays: readonly Readonly<MediaOverlayState>[],
  registry: LocalMediaAssetRegistry,
): Readonly<MediaPersistenceSaveSnapshot> {
  const resources = new Map<string, Readonly<MediaPersistenceResource>>();
  for (const overlay of overlays) {
    const asset = registry.get(overlay.assetId);
    if (
      !asset ||
      asset.descriptor.resourceId !== overlay.resourceId
    ) {
      throw new Error("media registry snapshot is inconsistent");
    }
    if (!resources.has(overlay.resourceId)) {
      const resource = registry.getResource(overlay.resourceId);
      if (!resource) {
        throw new Error("media resource snapshot is inconsistent");
      }
      resources.set(
        overlay.resourceId,
        Object.freeze({
          resourceId: resource.resourceId,
          mimeType: resource.mimeType,
          width: resource.intrinsicWidthPx,
          height: resource.intrinsicHeightPx,
          byteLength: resource.byteLength,
          blob: resource.blob,
        }),
      );
    }
  }
  return Object.freeze({
    overlays: Object.freeze([...overlays]),
    resources: Object.freeze([...resources.values()]),
  });
}

function EnabledMediaEditorProvider({
  children,
  currentPage,
  getPageBounds,
  onMessage,
  persistenceSession = IN_MEMORY_MEDIA_SESSION,
  loadDocumentPageBounds,
}: MediaEditorProviderProps) {
  const [history, dispatch] = useReducer(
    mediaEditorHistoryReducer,
    undefined,
    createMediaEditorHistoryState,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [hydrationStatus, setHydrationStatus] = useState<"loading" | "ready">(
    persistenceSession.status === "loading" ||
      (persistenceSession.status === "ready" &&
        persistenceSession.mediaState.kind === "hydrate")
      ? "loading"
      : "ready",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const registryRef = useRef<LocalMediaAssetRegistry | null>(null);
  const coordinatorRef = useRef<RasterSanitizationCoordinator | null>(null);
  const writerRef = useRef<MediaPersistenceWriter | null>(null);
  const mountedRef = useRef(false);
  const selectionGenerationRef = useRef(0);
  const hydrationGenerationRef = useRef(0);
  const assetSequenceRef = useRef(0);
  const historyRef = useRef(history);
  const currentPageRef = useRef(currentPage);
  const lastDurableSignatureRef = useRef<string | null>(null);
  const storageWarningShownRef = useRef(false);
  const persistenceDisabledRef = useRef(false);
  const inputId = useId();

  historyRef.current = history;
  currentPageRef.current = currentPage;

  useEffect(() => {
    const registry = new LocalMediaAssetRegistry();
    const coordinator = new RasterSanitizationCoordinator();
    registryRef.current = registry;
    coordinatorRef.current = coordinator;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      selectionGenerationRef.current += 1;
      hydrationGenerationRef.current += 1;
      writerRef.current?.dispose();
      writerRef.current = null;
      coordinator.dispose();
      registry.clear();
      if (registryRef.current === registry) registryRef.current = null;
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
    };
  }, []);

  const warnStorageOnce = useCallback(() => {
    if (storageWarningShownRef.current) return;
    storageWarningShownRef.current = true;
    onMessage(LOCAL_MEDIA_STORAGE_WARNING, 5000);
  }, [onMessage]);

  const openFilePicker = useCallback(() => {
    if (hydrationStatus !== "ready") return;
    inputRef.current?.click();
  }, [hydrationStatus]);

  useEffect(() => {
    hydrationGenerationRef.current += 1;
    const generation = hydrationGenerationRef.current;
    const registry = registryRef.current;
    writerRef.current?.dispose();
    writerRef.current = null;
    lastDurableSignatureRef.current = null;
    persistenceDisabledRef.current = false;

    const isCurrent = () =>
      mountedRef.current &&
      hydrationGenerationRef.current === generation &&
      registryRef.current === registry;

    if (!registry) return;
    registry.clear();
    if (persistenceSession.status === "loading") {
      setHydrationStatus("loading");
      return () => {
        if (hydrationGenerationRef.current === generation) {
          hydrationGenerationRef.current += 1;
        }
      };
    }
    if (persistenceSession.status === "unavailable") {
      persistenceDisabledRef.current = true;
      dispatch({ type: "HYDRATE", overlays: Object.freeze([]) });
      setHydrationStatus("ready");
      if (loadDocumentPageBounds) warnStorageOnce();
      return () => {
        if (hydrationGenerationRef.current === generation) {
          hydrationGenerationRef.current += 1;
        }
      };
    }
    if (persistenceSession.mediaState.kind === "empty") {
      dispatch({ type: "HYDRATE", overlays: Object.freeze([]) });
      lastDurableSignatureRef.current = mediaSnapshotSignature([]);
      writerRef.current = new MediaPersistenceWriter({
        binding: persistenceSession.binding,
        initialWriteSequence: persistenceSession.mediaState.writeSequence,
        onFailure: () => {
          persistenceDisabledRef.current = true;
          warnStorageOnce();
        },
      });
      setHydrationStatus("ready");
      return () => {
        if (hydrationGenerationRef.current === generation) {
          hydrationGenerationRef.current += 1;
        }
        writerRef.current?.dispose();
        writerRef.current = null;
      };
    }

    setHydrationStatus("loading");
    void (async () => {
      try {
        if (!loadDocumentPageBounds) {
          throw new Error("media page bounds loader is unavailable");
        }
        const pageBounds = await loadDocumentPageBounds();
        if (!isCurrent()) return;
        const snapshot = await hydrateCurrentMediaSnapshot({
          binding: persistenceSession.binding,
          pageBounds,
          isCurrent,
        });
        if (!isCurrent()) return;
        const resources = new Map(
          snapshot.resources.map((resource) => [
            resource.resourceId,
            resource,
          ]),
        );
        try {
          for (const overlay of snapshot.overlays) {
            const resource = resources.get(overlay.resourceId);
            if (!resource) {
              throw new Error("hydrated media resource is unavailable");
            }
            registry.add(
              createMediaAssetDescriptor({
                id: overlay.assetId,
                resourceId: resource.resourceId,
                sourceFileName:
                  resource.mimeType === "image/jpeg"
                    ? "restored-media.jpg"
                    : "restored-media.png",
                mimeType: resource.mimeType,
                width: resource.width,
                height: resource.height,
              }),
              resource.blob,
            );
          }
        } catch (error) {
          registry.clear();
          throw error;
        }
        if (!isCurrent()) {
          registry.clear();
          return;
        }
        dispatch({ type: "HYDRATE", overlays: snapshot.overlays });
        lastDurableSignatureRef.current = mediaSnapshotSignature(
          snapshot.overlays,
        );
        writerRef.current = new MediaPersistenceWriter({
          binding: persistenceSession.binding,
          initialWriteSequence: snapshot.writeSequence,
          onFailure: () => {
            persistenceDisabledRef.current = true;
            warnStorageOnce();
          },
        });
        if (snapshot.recoveredFromInvalid) warnStorageOnce();
        setHydrationStatus("ready");
      } catch {
        if (!isCurrent()) return;
        registry.clear();
        persistenceDisabledRef.current = true;
        dispatch({ type: "HYDRATE", overlays: Object.freeze([]) });
        setHydrationStatus("ready");
        warnStorageOnce();
      }
    })();

    return () => {
      if (hydrationGenerationRef.current === generation) {
        hydrationGenerationRef.current += 1;
      }
      writerRef.current?.dispose();
      writerRef.current = null;
    };
  }, [
    loadDocumentPageBounds,
    persistenceSession,
    warnStorageOnce,
  ]);

  const getAsset = useCallback((assetId: LocalMediaAssetId) => {
    return registryRef.current?.get(assetId) ?? null;
  }, []);

  const selectAsset = useCallback((assetId: LocalMediaAssetId | null) => {
    dispatch({ type: "SELECT", assetId });
  }, []);

  const deleteAsset = useCallback((assetId: LocalMediaAssetId) => {
    registryRef.current?.release(assetId);
    dispatch({ type: "DELETE", assetId });
  }, []);

  const failClosedAsset = useCallback((assetId: LocalMediaAssetId) => {
    registryRef.current?.release(assetId);
    dispatch({ type: "DELETE", assetId });
    onMessage("This sanitized image couldn’t be rendered and was removed.");
  }, [onMessage]);

  const commitPlacement = useCallback((
    assetId: LocalMediaAssetId,
    placement: Readonly<MediaPlacement>,
  ) => {
    const overlay = historyRef.current.present.find(
      (candidate) => candidate.assetId === assetId,
    );
    if (!overlay || placement.pageIndex !== overlay.placement.pageIndex) return;
    const bounds = getPageBounds(overlay.placement.pageIndex);
    if (!bounds || currentPageRef.current !== overlay.placement.pageIndex) return;
    const normalizedPlacement = keepMediaPlacementWithinPage(
      placement,
      overlay.transform,
      bounds,
    );
    dispatch({
      type: "COMMIT",
      overlay: freezeMediaOverlay({
        ...overlay,
        placement: normalizedPlacement,
      }),
    });
  }, [getPageBounds]);

  const rotateSelected = useCallback((deltaDegrees: number) => {
    if (!Number.isFinite(deltaDegrees)) return;
    const selectedId = historyRef.current.selectedAssetId;
    const overlay = historyRef.current.present.find(
      (candidate) => candidate.assetId === selectedId,
    );
    if (!overlay) return;
    const bounds = getPageBounds(overlay.placement.pageIndex);
    if (!bounds || currentPageRef.current !== overlay.placement.pageIndex) return;
    const transform = Object.freeze({
      ...overlay.transform,
      rotationDeg: normalizeMediaRotation(
        overlay.transform.rotationDeg + deltaDegrees,
      ),
    });
    dispatch({
      type: "COMMIT",
      overlay: freezeMediaOverlay({
        ...overlay,
        placement: keepMediaPlacementWithinPage(
          overlay.placement,
          transform,
          bounds,
        ),
        transform,
      }),
    });
  }, [getPageBounds]);

  const flipSelected = useCallback((axis: "horizontal" | "vertical") => {
    const selectedId = historyRef.current.selectedAssetId;
    const overlay = historyRef.current.present.find(
      (candidate) => candidate.assetId === selectedId,
    );
    if (!overlay) return;
    dispatch({
      type: "COMMIT",
      overlay: freezeMediaOverlay({
        ...overlay,
        transform: {
          ...overlay.transform,
          flipX:
            axis === "horizontal"
              ? !overlay.transform.flipX
              : overlay.transform.flipX,
          flipY:
            axis === "vertical"
              ? !overlay.transform.flipY
              : overlay.transform.flipY,
        },
      }),
    });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const registry = registryRef.current;
    const coordinator = coordinatorRef.current;
    if (
      !registry ||
      !coordinator ||
      !mountedRef.current ||
      hydrationStatus !== "ready"
    ) {
      return;
    }
    if (registry.size >= registry.capacity) {
      onMessage(
        `You can add up to ${registry.capacity} media items in one editing session.`,
      );
      return;
    }

    selectionGenerationRef.current += 1;
    const generation = selectionGenerationRef.current;
    setIsProcessing(true);
    try {
      // The PR #121 coordinator performs the one permitted source inspection
      // and sanitization pass. No caller reads or previews source bytes.
      const sanitized = await coordinator.sanitize(file);
      if (
        !mountedRef.current ||
        selectionGenerationRef.current !== generation ||
        registryRef.current !== registry
      ) {
        return;
      }
      const isCurrentSelection = () => (
        mountedRef.current &&
        selectionGenerationRef.current === generation &&
        registryRef.current === registry
      );
      const pageSnapshot = await waitForRenderedPageBounds(
        getPageBounds,
        () => currentPageRef.current,
        isCurrentSelection,
      );
      if (!isCurrentSelection()) return;
      if (!pageSnapshot) {
        onMessage("Wait for the PDF page to finish rendering, then add the image again.");
        return;
      }

      assetSequenceRef.current += 1;
      const assetId = createAssetId(assetSequenceRef.current);
      let resourceId: LocalMediaResourceId;
      try {
        resourceId = await hashSanitizedMediaBytes(sanitized.bytes);
      } catch {
        if (!isCurrentSelection()) return;
        persistenceDisabledRef.current = true;
        writerRef.current?.dispose();
        writerRef.current = null;
        resourceId = runtimeMediaResourceIdFromString(
          `ephemeral-${assetId}`,
        );
        if (loadDocumentPageBounds) warnStorageOnce();
      }
      if (!isCurrentSelection()) return;
      if (
        !registry.getResource(resourceId) &&
        (registry.resourceCount >= registry.resourceCapacity ||
          registry.totalBytes + sanitized.blob.size > registry.byteCapacity)
      ) {
        onMessage(
          "This document has reached its local media storage limit.",
          5000,
        );
        return;
      }
      const descriptor = createMediaAssetDescriptor({
        id: assetId,
        resourceId,
        sourceFileName: file.name,
        mimeType: sanitized.mimeType,
        width: sanitized.width,
        height: sanitized.height,
      });
      const placement = createCenteredMediaPlacement(
        descriptor,
        pageSnapshot.pageIndex,
        pageSnapshot.bounds,
      );
      registry.add(descriptor, sanitized.blob);
      dispatch({
        type: "ADD",
        overlay: freezeMediaOverlay({
          assetId: descriptor.id,
          resourceId: descriptor.resourceId,
          placement,
          transform: {
            rotationDeg: 0,
            flipX: false,
            flipY: false,
          },
        }),
      });
      onMessage("Media added locally. It won’t appear in this PDF’s download yet.", 4500);
    } catch (error) {
      if (!mountedRef.current || selectionGenerationRef.current !== generation) return;
      const message = mediaErrorMessage(error);
      if (message) onMessage(message, 5000);
    } finally {
      if (mountedRef.current && selectionGenerationRef.current === generation) {
        setIsProcessing(false);
      }
    }
  }, [
    getPageBounds,
    hydrationStatus,
    loadDocumentPageBounds,
    onMessage,
    warnStorageOnce,
  ]);

  const handleFileInputChange = useCallback((
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (file) void handleFile(file);
  }, [handleFile]);

  useEffect(() => {
    if (
      hydrationStatus !== "ready" ||
      persistenceDisabledRef.current ||
      !writerRef.current
    ) {
      return;
    }
    const signature = mediaSnapshotSignature(history.present);
    if (lastDurableSignatureRef.current === signature) return;
    const registry = registryRef.current;
    if (!registry) return;
    try {
      const snapshot = persistenceSnapshot(history.present, registry);
      lastDurableSignatureRef.current = signature;
      writerRef.current.schedule(snapshot);
    } catch {
      persistenceDisabledRef.current = true;
      writerRef.current.dispose();
      writerRef.current = null;
      warnStorageOnce();
    }
  }, [history.present, hydrationStatus, warnStorageOnce]);

  const value = useMemo<MediaEditorContextValue>(() => ({
    overlays: history.present,
    selectedAssetId: history.selectedAssetId,
    inputId,
    isProcessing: isProcessing || hydrationStatus === "loading",
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    openFilePicker,
    getAsset,
    selectAsset,
    commitPlacement,
    rotateSelected,
    flipSelected,
    deleteAsset,
    failClosedAsset,
    undo: () => dispatch({ type: "UNDO" }),
    redo: () => dispatch({ type: "REDO" }),
  }), [
    history,
    hydrationStatus,
    inputId,
    isProcessing,
    openFilePicker,
    getAsset,
    selectAsset,
    commitPlacement,
    rotateSelected,
    flipSelected,
    deleteAsset,
    failClosedAsset,
  ]);

  return (
    <MediaEditorContext.Provider value={value}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={MEDIA_FILE_INPUT_ACCEPT}
        className="sr-only"
        aria-label="Choose a JPEG, PNG, or static WebP to add to the PDF"
        data-testid="add-media-input"
        disabled={hydrationStatus !== "ready"}
        onChange={handleFileInputChange}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {hydrationStatus === "loading"
          ? "Restoring media saved in this browser"
          : isProcessing
            ? "Sanitizing selected media locally"
            : ""}
      </span>
      {children}
    </MediaEditorContext.Provider>
  );
}

export function MediaEditorBoundary({
  enabled,
  documentRevision,
  ...providerProps
}: MediaEditorBoundaryProps) {
  if (!enabled) return <>{providerProps.children}</>;
  return (
    <EnabledMediaEditorProvider
      key={documentRevision}
      {...providerProps}
    />
  );
}

export function useOptionalMediaEditor(): MediaEditorContextValue | null {
  return useContext(MediaEditorContext);
}
