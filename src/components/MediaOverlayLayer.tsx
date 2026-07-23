"use client";

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FlipHorizontal2,
  FlipVertical2,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useOptionalMediaEditor } from "@/components/MediaEditorProvider";
import {
  keepMediaPlacementWithinPage,
  pageDeltaFromViewportDelta,
  resizeMediaPlacementFromCenter,
  type MediaPageBounds,
} from "@/lib/media-editor";
import {
  applyAffineMatrix,
  resolveMediaTransform,
} from "@/lib/media-transform";
import type {
  AffineMatrix,
  MediaOverlayState,
  MediaPlacement,
} from "@/lib/media-types";

interface MediaOverlayLayerProps {
  readonly currentPage: number;
  readonly renderedPageSize: Readonly<{ width: number; height: number }> | null;
  readonly pageBounds: Readonly<MediaPageBounds> | null;
  readonly interactionEnabled: boolean;
  readonly hidden?: boolean;
}

type PointerOperation = {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startPlacement: Readonly<MediaPlacement>;
};

type ResizeOperation = PointerOperation & {
  readonly startDistance: number;
  readonly centerClientX: number;
  readonly centerClientY: number;
};

function ControlButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-media-control
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-border text-text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

function MediaOverlayItem({
  overlay,
  pageToViewport,
  pageBounds,
  interactionEnabled,
}: {
  readonly overlay: Readonly<MediaOverlayState>;
  readonly pageToViewport: AffineMatrix;
  readonly pageBounds: Readonly<MediaPageBounds>;
  readonly interactionEnabled: boolean;
}) {
  const media = useOptionalMediaEditor();
  const asset = media?.getAsset(overlay.assetId) ?? null;
  const [draftPlacement, setDraftPlacement] = useState(overlay.placement);
  const draftPlacementRef = useRef<Readonly<MediaPlacement>>(overlay.placement);
  const moveRef = useRef<PointerOperation | null>(null);
  const resizeRef = useRef<ResizeOperation | null>(null);
  const failedObjectUrlRef = useRef<string | null>(null);
  const isSelected = media?.selectedAssetId === overlay.assetId;

  const resolved = useMemo(
    () => resolveMediaTransform(draftPlacement, overlay.transform, pageToViewport),
    [draftPlacement, overlay.transform, pageToViewport],
  );

  if (!media || !asset || !resolved.localToViewport || !resolved.viewportCorners) {
    return null;
  }

  const matrix = resolved.localToViewport;
  const viewportCorners = resolved.viewportCorners;
  const boundingTop = Math.min(...viewportCorners.map((corner) => corner.y));
  const boundingBottom = Math.max(...viewportCorners.map((corner) => corner.y));
  const renderedPageWidth = pageBounds.widthPts * pageToViewport[0];
  const renderedPageHeight = pageBounds.heightPts * pageToViewport[3];
  const toolbarTop =
    boundingTop >= 52
      ? boundingTop - 44
      : Math.min(boundingBottom + 8, Math.max(4, renderedPageHeight - 84));
  const resizeCorner = viewportCorners[2];

  const finishMove = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const operation = moveRef.current;
    if (!operation || operation.pointerId !== event.pointerId) return;
    moveRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (commit) {
      media.commitPlacement(overlay.assetId, draftPlacementRef.current);
    } else {
      draftPlacementRef.current = operation.startPlacement;
      setDraftPlacement(operation.startPlacement);
    }
  };

  const finishResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    commit: boolean,
  ) => {
    const operation = resizeRef.current;
    if (!operation || operation.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (commit) {
      media.commitPlacement(overlay.assetId, draftPlacementRef.current);
    } else {
      draftPlacementRef.current = operation.startPlacement;
      setDraftPlacement(operation.startPlacement);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={interactionEnabled ? 0 : -1}
        aria-label={`Media ${asset.descriptor.fileName}`}
        aria-pressed={isSelected}
        data-testid="media-overlay"
        data-media-file-name={asset.descriptor.fileName}
        data-media-rotation={overlay.transform.rotationDeg}
        data-media-flip-x={overlay.transform.flipX}
        data-media-flip-y={overlay.transform.flipY}
        onFocus={() => media.selectAsset(overlay.assetId)}
        onClick={(event) => {
          event.stopPropagation();
          if (interactionEnabled) media.selectAsset(overlay.assetId);
        }}
        onKeyDown={(event) => {
          if (!interactionEnabled) return;
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            event.stopPropagation();
            media.deleteAsset(overlay.assetId);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            media.selectAsset(null);
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) media.redo();
            else media.undo();
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
            event.preventDefault();
            event.stopPropagation();
            media.redo();
          }
        }}
        onPointerDown={(event) => {
          if (!interactionEnabled || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          media.selectAsset(overlay.assetId);
          event.currentTarget.setPointerCapture(event.pointerId);
          moveRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startPlacement: draftPlacement,
          };
        }}
        onPointerMove={(event) => {
          const operation = moveRef.current;
          if (!operation || operation.pointerId !== event.pointerId) return;
          event.preventDefault();
          const delta = pageDeltaFromViewportDelta(
            pageToViewport,
            event.clientX - operation.startClientX,
            event.clientY - operation.startClientY,
          );
          const nextPlacement = keepMediaPlacementWithinPage(
            {
              ...operation.startPlacement,
              xPts: operation.startPlacement.xPts + delta.xPts,
              yPts: operation.startPlacement.yPts + delta.yPts,
            },
            overlay.transform,
            pageBounds,
          );
          draftPlacementRef.current = nextPlacement;
          setDraftPlacement(nextPlacement);
        }}
        onPointerUp={(event) => finishMove(event, true)}
        onPointerCancel={(event) => finishMove(event, false)}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: draftPlacement.widthPts,
          height: draftPlacement.heightPts,
          transform: `matrix(${matrix.join(",")})`,
          transformOrigin: "0 0",
          touchAction: "none",
          cursor: interactionEnabled ? "move" : "default",
          pointerEvents: interactionEnabled ? "auto" : "none",
          zIndex: 30,
          outline: isSelected ? "2px solid #2563eb" : "1px solid rgba(37,99,235,0.35)",
          outlineOffset: isSelected ? 2 : 0,
          background: "rgba(255,255,255,0.01)",
        }}
      >
        {/* This URL is created only from PR #121's sanitized Blob. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URLs cannot use the Next image optimizer */}
        <img
          src={asset.objectUrl}
          alt=""
          draggable={false}
          data-testid="sanitized-media-image"
          onError={() => {
            if (failedObjectUrlRef.current === asset.objectUrl) return;
            failedObjectUrlRef.current = asset.objectUrl;
            media.failClosedAsset(overlay.assetId);
          }}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "fill",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />
      </div>

      {isSelected && interactionEnabled && (
        <>
          <div
            role="toolbar"
            aria-label="Selected media controls"
            data-testid="media-controls"
            data-media-control
            className="pointer-events-auto absolute z-40 flex flex-wrap items-center justify-center gap-1 rounded-xl border border-border bg-white/95 p-1 shadow-lg backdrop-blur"
            style={{
              left: "50%",
              top: Math.max(4, toolbarTop),
              transform: "translateX(-50%)",
              maxWidth: "calc(100% - 8px)",
            }}
          >
            <ControlButton
              label="Undo media change"
              disabled={!media.canUndo}
              onClick={media.undo}
            >
              <Undo2 className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              label="Redo media change"
              disabled={!media.canRedo}
              onClick={media.redo}
            >
              <Redo2 className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              label="Rotate media left"
              onClick={() => media.rotateSelected(-90)}
            >
              <RotateCcw className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              label="Rotate media right"
              onClick={() => media.rotateSelected(90)}
            >
              <RotateCw className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              label="Flip media horizontally"
              onClick={() => media.flipSelected("horizontal")}
            >
              <FlipHorizontal2 className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              label="Flip media vertically"
              onClick={() => media.flipSelected("vertical")}
            >
              <FlipVertical2 className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              label="Delete media"
              danger
              onClick={() => media.deleteAsset(overlay.assetId)}
            >
              <Trash2 className="h-4 w-4" />
            </ControlButton>
          </div>

          <button
            type="button"
            aria-label="Resize media proportionally"
            title="Resize media proportionally"
            data-testid="media-resize-handle"
            data-media-control
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              const pageRect = event.currentTarget.parentElement?.getBoundingClientRect();
              const centerViewport = applyAffineMatrix(
                pageToViewport,
                resolved.centerPagePts,
              );
              const centerClientX = (pageRect?.left ?? 0) + centerViewport.x;
              const centerClientY = (pageRect?.top ?? 0) + centerViewport.y;
              const startDistance = Math.hypot(
                event.clientX - centerClientX,
                event.clientY - centerClientY,
              );
              if (startDistance <= 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              resizeRef.current = {
                pointerId: event.pointerId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startPlacement: draftPlacement,
                startDistance,
                centerClientX,
                centerClientY,
              };
            }}
            onPointerMove={(event) => {
              const operation = resizeRef.current;
              if (!operation || operation.pointerId !== event.pointerId) return;
              event.preventDefault();
              const nextDistance = Math.hypot(
                event.clientX - operation.centerClientX,
                event.clientY - operation.centerClientY,
              );
              const nextPlacement = resizeMediaPlacementFromCenter(
                operation.startPlacement,
                overlay.transform,
                nextDistance / operation.startDistance,
                pageBounds,
              );
              draftPlacementRef.current = nextPlacement;
              setDraftPlacement(nextPlacement);
            }}
            onPointerUp={(event) => finishResize(event, true)}
            onPointerCancel={(event) => finishResize(event, false)}
            className="pointer-events-auto absolute z-40 h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-blue-600 bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            style={{
              left: Math.min(Math.max(resizeCorner.x, 4), renderedPageWidth - 4),
              top: Math.min(Math.max(resizeCorner.y, 4), renderedPageHeight - 4),
            }}
          />
        </>
      )}
    </>
  );
}

export function MediaOverlayLayer({
  currentPage,
  renderedPageSize,
  pageBounds,
  interactionEnabled,
  hidden,
}: MediaOverlayLayerProps) {
  const media = useOptionalMediaEditor();
  if (!media || hidden || !renderedPageSize || !pageBounds) return null;
  if (
    renderedPageSize.width <= 0 ||
    renderedPageSize.height <= 0 ||
    pageBounds.widthPts <= 0 ||
    pageBounds.heightPts <= 0
  ) {
    return null;
  }
  // Scale-1 and rendered PDF.js viewports share the same intrinsic page
  // rotation. Their exact canvas-size ratios are therefore the affine map
  // from QuickFill page points into this rendered viewport.
  const pageToViewport = Object.freeze([
    renderedPageSize.width / pageBounds.widthPts,
    0,
    0,
    renderedPageSize.height / pageBounds.heightPts,
    0,
    0,
  ]) as AffineMatrix;
  const pageOverlays = media.overlays.filter(
    (overlay) => overlay.placement.pageIndex === currentPage,
  );
  if (pageOverlays.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      data-testid="media-overlay-layer"
      aria-label="Local media overlays"
    >
      {pageOverlays.map((overlay) => (
        <MediaOverlayItem
          key={[
            overlay.assetId,
            overlay.placement.xPts,
            overlay.placement.yPts,
            overlay.placement.widthPts,
            overlay.placement.heightPts,
            overlay.transform.rotationDeg,
            overlay.transform.flipX,
            overlay.transform.flipY,
          ].join(":")}
          overlay={overlay}
          pageToViewport={pageToViewport}
          pageBounds={pageBounds}
          interactionEnabled={interactionEnabled}
        />
      ))}
    </div>
  );
}
