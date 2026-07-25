/**
 * @jest-environment jsdom
 */

import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import {
  MEDIA_PERSISTENCE_MAX_BYTES,
  MEDIA_PERSISTENCE_MAX_OVERLAYS,
  MEDIA_PERSISTENCE_MAX_RESOURCES,
  MEDIA_PERSISTENCE_WRITE_DELAY_MS,
  MediaPersistenceError,
  MediaPersistenceWriter,
  cleanupMediaPersistence,
  createMediaDocumentBinding,
  hashSanitizedMediaBytes,
  hydrateCurrentMediaSnapshot,
  localMediaResourceIdFromString,
  prepareCurrentMediaDocument,
  replaceCurrentMediaDocument,
  saveMediaSnapshotWithRetry,
  type MediaPersistenceResource,
  type MediaPersistenceSaveSnapshot,
} from "@/lib/media-persistence";
import { localMediaAssetIdFromString } from "@/lib/media-editor";
import { freezeMediaOverlay } from "@/lib/media-editor-history";
import type {
  LocalMediaResourceId,
  MediaDocumentBinding,
  MediaOverlayState,
} from "@/lib/media-types";
import * as persistence from "@/lib/persistence";
import {
  QUICKFILL_MEDIA_ASSET_STORE,
  QUICKFILL_MEDIA_BINDING_KEY,
  QUICKFILL_MEDIA_SESSION_STORE,
  QUICKFILL_PDF_KEY,
  QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
  QUICKFILL_PDF_STORE,
  QUICKFILL_PDF_TIMESTAMP_KEY,
  QUICKFILL_TIMESTAMP_STORE,
  type QuickFillMediaStoreName,
  type QuickFillTransactionFacade,
} from "@/lib/persistence";
import {
  pngChunk,
  pngFixture,
  pngWithExifOrientation,
  truncate,
} from "@/lib/__tests__/fixtures/media-raster-fixtures";

type MemoryStores = Map<QuickFillMediaStoreName, Map<IDBValidKey, unknown>>;

function createMemoryStores(): MemoryStores {
  return new Map([
    [QUICKFILL_PDF_STORE, new Map()],
    [QUICKFILL_TIMESTAMP_STORE, new Map()],
    [QUICKFILL_MEDIA_SESSION_STORE, new Map()],
    [QUICKFILL_MEDIA_ASSET_STORE, new Map()],
  ]);
}

function facadeFor(stores: MemoryStores): QuickFillTransactionFacade {
  const store = (name: QuickFillMediaStoreName) => {
    const value = stores.get(name);
    if (!value) throw new DOMException("Missing store", "NotFoundError");
    return value;
  };
  return {
    async get<T>(storeName, key) {
      return store(storeName).get(key) as T | undefined;
    },
    async getAll<T>(storeName) {
      return [...store(storeName).values()] as T[];
    },
    async getAllKeys(storeName) {
      return [...store(storeName).keys()];
    },
    async put(storeName, value, suppliedKey) {
      const record =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : null;
      const key =
        suppliedKey ??
        (storeName === QUICKFILL_MEDIA_SESSION_STORE
          ? (record?.key as IDBValidKey | undefined)
          : storeName === QUICKFILL_MEDIA_ASSET_STORE
            ? (record?.resourceId as IDBValidKey | undefined)
            : undefined);
      if (key === undefined) throw new DOMException("Missing key", "DataError");
      store(storeName).set(key, value);
    },
    async delete(storeName, key) {
      store(storeName).delete(key);
    },
    async clear(storeName) {
      store(storeName).clear();
    },
  };
}

function pdfBytes(marker = 1): ArrayBuffer {
  return Uint8Array.from([0x25, 0x50, 0x44, 0x46, marker]).buffer;
}

function overlay(
  assetId: string,
  resourceId: LocalMediaResourceId,
  xPts = 20,
): Readonly<MediaOverlayState> {
  return freezeMediaOverlay({
    assetId: localMediaAssetIdFromString(assetId),
    resourceId,
    placement: {
      pageIndex: 0,
      xPts,
      yPts: 30,
      widthPts: 100,
      heightPts: 100,
    },
    transform: {
      rotationDeg: 0,
      flipX: false,
      flipY: false,
    },
  });
}

async function pngResource(): Promise<Readonly<MediaPersistenceResource>> {
  const bytes = pngFixture();
  const resourceId = await hashSanitizedMediaBytes(bytes);
  const blob = new Blob([bytes], { type: "image/png" });
  return Object.freeze({
    resourceId,
    mimeType: "image/png" as const,
    width: 1,
    height: 1,
    byteLength: blob.size,
    blob,
  });
}

function syntheticSizedBlob(
  size: number,
  type: "image/png" | "image/jpeg" = "image/png",
): Blob {
  const blob = Object.create(Blob.prototype) as Blob;
  Object.defineProperties(blob, {
    size: { configurable: true, value: size },
    type: { configurable: true, value: type },
  });
  return blob;
}

function syntheticResource(
  index: number,
  blob: Blob,
): Readonly<MediaPersistenceResource> {
  return Object.freeze({
    resourceId: localMediaResourceIdFromString(
      `sha256-${index.toString(16).padStart(64, "0")}`,
    ),
    mimeType: "image/png" as const,
    width: 1,
    height: 1,
    byteLength: blob.size,
    blob,
  });
}

describe("sanitized media persistence", () => {
  const originalCrypto = globalThis.crypto;
  const originalBlob = globalThis.Blob;
  let stores: MemoryStores;
  let transactionSpy: jest.SpyInstance;

  beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
    Object.defineProperty(globalThis, "Blob", {
      configurable: true,
      value: NodeBlob,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
    Object.defineProperty(globalThis, "Blob", {
      configurable: true,
      value: originalBlob,
    });
  });

  beforeEach(() => {
    stores = createMemoryStores();
    transactionSpy = jest
      .spyOn(persistence, "runQuickFillMediaTransaction")
      .mockImplementation(async (_mode, operation) => {
        return operation(facadeFor(stores));
      });
  });

  afterEach(() => {
    transactionSpy.mockRestore();
    jest.useRealTimers();
  });

  async function readyDocument(
    bytes = pdfBytes(),
  ): Promise<Readonly<MediaDocumentBinding>> {
    return replaceCurrentMediaDocument(bytes);
  }

  it("round-trips schema-v1 geometry, transforms, and z-order without history or selection", async () => {
    const binding = await readyDocument();
    const resource = await pngResource();
    const snapshot: MediaPersistenceSaveSnapshot = Object.freeze({
      overlays: Object.freeze([
        overlay("media-first", resource.resourceId, 25),
        freezeMediaOverlay({
          ...overlay("media-second", resource.resourceId, 150),
          transform: {
            rotationDeg: 90,
            flipX: true,
            flipY: true,
          },
        }),
      ]),
      resources: Object.freeze([resource]),
    });

    await saveMediaSnapshotWithRetry(binding, 1, snapshot);
    const hydrated = await hydrateCurrentMediaSnapshot({
      binding,
      pageBounds: [{ widthPts: 600, heightPts: 800 }],
    });

    expect(hydrated.overlays).toEqual(snapshot.overlays);
    expect(hydrated.resources).toHaveLength(1);
    expect(hydrated.writeSequence).toBe(1);
    const manifest = stores
      .get(QUICKFILL_MEDIA_SESSION_STORE)
      ?.get("current_media") as Record<string, unknown>;
    expect(Object.keys(manifest).sort()).toEqual(
      [
        "documentBinding",
        "key",
        "overlays",
        "savedAtMs",
        "schemaVersion",
        "writeSequence",
      ].sort(),
    );
    const persistedOverlays = manifest.overlays as Record<string, unknown>[];
    expect(Object.keys(persistedOverlays[0]).sort()).toEqual(
      [
        "assetId",
        "resourceId",
        "pageIndex",
        "x",
        "y",
        "width",
        "height",
        "rotation",
        "flipX",
        "flipY",
      ].sort(),
    );
    expect(JSON.stringify(manifest)).not.toMatch(
      /selected|past|future|history|fileName|objectUrl/i,
    );
  });

  it("stores one sanitized binary for multiple logical aliases", async () => {
    const binding = await readyDocument();
    const resource = await pngResource();

    await saveMediaSnapshotWithRetry(
      binding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-alias-one", resource.resourceId),
          overlay("media-alias-two", resource.resourceId, 180),
        ]),
        resources: Object.freeze([resource]),
      }),
    );

    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(1);
    const hydrated = await hydrateCurrentMediaSnapshot({
      binding,
      pageBounds: [{ widthPts: 600, heightPts: 800 }],
    });
    expect(hydrated.overlays).toHaveLength(2);
    expect(hydrated.resources).toHaveLength(1);
  });

  it("rotates incarnation for byte-identical intentional replacement and clears old media", async () => {
    const bytes = pdfBytes(4);
    const firstBinding = await readyDocument(bytes);
    const resource = await pngResource();
    await saveMediaSnapshotWithRetry(
      firstBinding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-old", resource.resourceId),
        ]),
        resources: Object.freeze([resource]),
      }),
    );

    const secondBinding = await replaceCurrentMediaDocument(bytes);

    expect(secondBinding.pdfDigest).toBe(firstBinding.pdfDigest);
    expect(secondBinding.incarnation).not.toBe(firstBinding.incarnation);
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(0);
    const hydrated = await hydrateCurrentMediaSnapshot({
      binding: secondBinding,
      pageBounds: [{ widthPts: 600, heightPts: 800 }],
    });
    expect(hydrated.overlays).toEqual([]);
  });

  it("rotates a byte-identical incarnation when a newer core save occurred while media was inert", async () => {
    const bytes = pdfBytes(5);
    const firstBinding = await readyDocument(bytes);
    const resource = await pngResource();
    await saveMediaSnapshotWithRetry(
      firstBinding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-before-core-save", resource.resourceId),
        ]),
        resources: Object.freeze([resource]),
      }),
    );
    stores
      .get(QUICKFILL_TIMESTAMP_STORE)
      ?.set(QUICKFILL_PDF_REPLACEMENT_PENDING_KEY, true);

    const prepared = await prepareCurrentMediaDocument(bytes);

    expect(prepared.binding.pdfDigest).toBe(firstBinding.pdfDigest);
    expect(prepared.binding.incarnation).not.toBe(firstBinding.incarnation);
    expect(prepared.mediaState).toEqual({
      kind: "empty",
      writeSequence: 0,
    });
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(0);
  });

  it("rejects one overlay beyond the exact logical cap before writing", async () => {
    const binding = await readyDocument();
    const resource = await pngResource();
    const overlays = Array.from(
      { length: MEDIA_PERSISTENCE_MAX_OVERLAYS + 1 },
      (_, index) =>
        overlay(`media-cap-${index}`, resource.resourceId, index * 5),
    );
    const callsBefore = transactionSpy.mock.calls.length;

    await expect(
      saveMediaSnapshotWithRetry(
        binding,
        1,
        Object.freeze({
          overlays: Object.freeze(overlays),
          resources: Object.freeze([resource]),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(transactionSpy.mock.calls).toHaveLength(callsBefore);
  });

  it("accepts every exact cap boundary and rejects one-over limits before a transaction", async () => {
    const binding = await readyDocument();
    const exactResources = Array.from(
      { length: MEDIA_PERSISTENCE_MAX_RESOURCES },
      (_, index) => syntheticResource(index + 1, new Blob([Uint8Array.of(index)], {
        type: "image/png",
      })),
    );
    const exactOverlays = exactResources.map((resource, index) =>
      overlay(`media-resource-cap-${index}`, resource.resourceId, index * 8),
    );

    await expect(
      saveMediaSnapshotWithRetry(
        binding,
        1,
        Object.freeze({
          overlays: Object.freeze(exactOverlays),
          resources: Object.freeze(exactResources),
        }),
      ),
    ).resolves.toBeUndefined();
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(
      MEDIA_PERSISTENCE_MAX_RESOURCES,
    );

    const exactByteResource = syntheticResource(
      100,
      syntheticSizedBlob(MEDIA_PERSISTENCE_MAX_BYTES),
    );
    await expect(
      saveMediaSnapshotWithRetry(
        binding,
        2,
        Object.freeze({
          overlays: Object.freeze([
            overlay("media-byte-cap", exactByteResource.resourceId),
          ]),
          resources: Object.freeze([exactByteResource]),
        }),
      ),
    ).resolves.toBeUndefined();

    const callsBeforeByteOverflow = transactionSpy.mock.calls.length;
    const oversizedResource = syntheticResource(
      101,
      syntheticSizedBlob(MEDIA_PERSISTENCE_MAX_BYTES + 1),
    );
    await expect(
      saveMediaSnapshotWithRetry(
        binding,
        3,
        Object.freeze({
          overlays: Object.freeze([
            overlay("media-byte-overflow", oversizedResource.resourceId),
          ]),
          resources: Object.freeze([oversizedResource]),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(transactionSpy.mock.calls).toHaveLength(callsBeforeByteOverflow);

    const tooManyResources = Array.from(
      { length: MEDIA_PERSISTENCE_MAX_RESOURCES + 1 },
      (_, index) => syntheticResource(index + 200, new Blob([Uint8Array.of(index)], {
        type: "image/png",
      })),
    );
    await expect(
      saveMediaSnapshotWithRetry(
        binding,
        3,
        Object.freeze({
          overlays: Object.freeze(
            tooManyResources.slice(0, MEDIA_PERSISTENCE_MAX_OVERLAYS).map(
              (resource, index) =>
                overlay(`media-resource-overflow-${index}`, resource.resourceId),
            ),
          ),
          resources: Object.freeze(tooManyResources),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(transactionSpy.mock.calls).toHaveLength(callsBeforeByteOverflow);
  });

  it("fails hydration all-or-nothing and clears only media after a missing reference", async () => {
    const binding = await readyDocument();
    const resource = await pngResource();
    await saveMediaSnapshotWithRetry(
      binding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-missing", resource.resourceId),
        ]),
        resources: Object.freeze([resource]),
      }),
    );
    stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.clear();

    const hydrated = await hydrateCurrentMediaSnapshot({
      binding,
      pageBounds: [{ widthPts: 600, heightPts: 800 }],
    });

    expect(hydrated.recoveredFromInvalid).toBe(true);
    expect(hydrated.overlays).toEqual([]);
    expect(stores.get(QUICKFILL_PDF_STORE)?.has(QUICKFILL_PDF_KEY)).toBe(true);
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(0);
  });

  it("rejects corrupt bytes, MIME mismatch, and invalid page geometry without publishing a partial overlay", async () => {
    const binding = await readyDocument();
    const resource = await pngResource();
    await saveMediaSnapshotWithRetry(
      binding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-corrupt", resource.resourceId),
        ]),
        resources: Object.freeze([resource]),
      }),
    );
    const storedAsset = stores
      .get(QUICKFILL_MEDIA_ASSET_STORE)
      ?.get(resource.resourceId) as Record<string, unknown>;
    stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(resource.resourceId, {
      ...storedAsset,
      blob: new Blob([Uint8Array.of(1, 2, 3)], { type: "image/png" }),
      byteLength: 3,
    });

    const recovered = await hydrateCurrentMediaSnapshot({
      binding,
      pageBounds: [{ widthPts: 600, heightPts: 800 }],
    });
    expect(recovered.overlays).toEqual([]);
    expect(recovered.recoveredFromInvalid).toBe(true);

    const freshBinding = await replaceCurrentMediaDocument(pdfBytes(2));
    await expect(
      saveMediaSnapshotWithRetry(
        freshBinding,
        1,
        Object.freeze({
          overlays: Object.freeze([
            freezeMediaOverlay({
              ...overlay("media-invalid-page", resource.resourceId),
              placement: {
                pageIndex: 3,
                xPts: 0,
                yPts: 0,
                widthPts: 100,
                heightPts: 100,
              },
            }),
          ]),
          resources: Object.freeze([resource]),
        }),
      ),
    ).resolves.toBeUndefined();
    const invalidPageRecovery = await hydrateCurrentMediaSnapshot({
      binding: freshBinding,
      pageBounds: [{ widthPts: 600, heightPts: 800 }],
    });
    expect(invalidPageRecovery.overlays).toEqual([]);
  });

  it("recovers all-or-nothing from malformed schemas, bytes, MIME, metadata, dimensions, geometry, and transforms", async () => {
    const scenarios: Array<{
      readonly name: string;
      readonly mutate: (
        session: Record<string, unknown>,
        asset: Record<string, unknown>,
      ) => Promise<void> | void;
    }> = [
      {
        name: "truncated bytes",
        mutate: async (session, asset) => {
          const bytes = truncate(pngFixture(), 1);
          const resourceId = await hashSanitizedMediaBytes(bytes);
          const persistedOverlay = (
            session.overlays as Array<Record<string, unknown>>
          )[0];
          persistedOverlay.resourceId = resourceId;
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.clear();
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(resourceId, {
            ...asset,
            resourceId,
            byteLength: bytes.byteLength,
            blob: new Blob([bytes], { type: "image/png" }),
          });
        },
      },
      {
        name: "unsupported MIME",
        mutate: (_session, asset) => {
          const resourceId = asset.resourceId as IDBValidKey;
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(resourceId, {
            ...asset,
            mimeType: "image/webp",
            blob: new Blob([pngFixture()], { type: "image/webp" }),
          });
        },
      },
      {
        name: "MIME and signature mismatch",
        mutate: (_session, asset) => {
          const resourceId = asset.resourceId as IDBValidKey;
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(resourceId, {
            ...asset,
            mimeType: "image/jpeg",
            blob: new Blob([pngFixture()], { type: "image/jpeg" }),
          });
        },
      },
      {
        name: "metadata",
        mutate: async (session, asset) => {
          const bytes = pngFixture({
            beforeIdat: [pngChunk("tEXt", Uint8Array.from([107, 0, 118]))],
          });
          const resourceId = await hashSanitizedMediaBytes(bytes);
          (session.overlays as Array<Record<string, unknown>>)[0].resourceId =
            resourceId;
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.clear();
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(resourceId, {
            ...asset,
            resourceId,
            byteLength: bytes.byteLength,
            blob: new Blob([bytes], { type: "image/png" }),
          });
        },
      },
      {
        name: "non-default orientation",
        mutate: async (session, asset) => {
          const bytes = pngWithExifOrientation(6);
          const resourceId = await hashSanitizedMediaBytes(bytes);
          (session.overlays as Array<Record<string, unknown>>)[0].resourceId =
            resourceId;
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.clear();
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(resourceId, {
            ...asset,
            resourceId,
            byteLength: bytes.byteLength,
            blob: new Blob([bytes], { type: "image/png" }),
          });
        },
      },
      {
        name: "dimension mismatch",
        mutate: (_session, asset) => {
          const resourceId = asset.resourceId as IDBValidKey;
          stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(resourceId, {
            ...asset,
            width: 2,
          });
        },
      },
      {
        name: "malformed schema",
        mutate: (session) => {
          session.unexpected = true;
        },
      },
      {
        name: "invalid aspect ratio",
        mutate: (session) => {
          (session.overlays as Array<Record<string, unknown>>)[0].width = 90;
        },
      },
      {
        name: "out-of-bounds geometry",
        mutate: (session) => {
          (session.overlays as Array<Record<string, unknown>>)[0].x = -20;
        },
      },
      {
        name: "invalid transform",
        mutate: (session) => {
          (session.overlays as Array<Record<string, unknown>>)[0].rotation = 45;
        },
      },
      {
        name: "duplicate logical asset id",
        mutate: (session) => {
          const persistedOverlays = session.overlays as Array<
            Record<string, unknown>
          >;
          persistedOverlays.push({ ...persistedOverlays[0] });
        },
      },
    ];

    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      const binding = await readyDocument(pdfBytes(index + 20));
      const resource = await pngResource();
      await saveMediaSnapshotWithRetry(
        binding,
        1,
        Object.freeze({
          overlays: Object.freeze([
            overlay(`media-invalid-${index}`, resource.resourceId),
          ]),
          resources: Object.freeze([resource]),
        }),
      );
      const persistedSession = stores
        .get(QUICKFILL_MEDIA_SESSION_STORE)
        ?.get("current_media") as Record<string, unknown>;
      const session = {
        ...persistedSession,
        overlays: (
          persistedSession.overlays as Array<Record<string, unknown>>
        ).map((persistedOverlay) => ({ ...persistedOverlay })),
      };
      stores
        .get(QUICKFILL_MEDIA_SESSION_STORE)
        ?.set("current_media", session);
      const asset = stores
        .get(QUICKFILL_MEDIA_ASSET_STORE)
        ?.get(resource.resourceId) as Record<string, unknown>;
      await scenario.mutate(session, asset);

      const recovered = await hydrateCurrentMediaSnapshot({
        binding,
        pageBounds: [{ widthPts: 600, heightPts: 800 }],
      });
      expect({
        scenario: scenario.name,
        overlays: recovered.overlays,
        recovered: recovered.recoveredFromInvalid,
      }).toEqual({
        scenario: scenario.name,
        overlays: [],
        recovered: true,
      });
    }
  });

  it("rejects stale delayed hydration without clearing the newer durable snapshot", async () => {
    const binding = await readyDocument();
    const bytes = pngFixture();
    const resourceId = await hashSanitizedMediaBytes(bytes);
    const blob = new Blob([bytes], { type: "image/png" });
    const originalArrayBuffer = blob.arrayBuffer.bind(blob);
    let signalReadStarted: (() => void) | null = null;
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve;
    });
    let releaseRead: (() => void) | null = null;
    Object.defineProperty(blob, "arrayBuffer", {
      configurable: true,
      value: () =>
        new Promise<ArrayBuffer>((resolve) => {
          releaseRead = () => {
            void originalArrayBuffer().then(resolve);
          };
          signalReadStarted?.();
        }),
    });
    await saveMediaSnapshotWithRetry(
      binding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-stale-hydration", resourceId),
        ]),
        resources: Object.freeze([
          Object.freeze({
            resourceId,
            mimeType: "image/png" as const,
            width: 1,
            height: 1,
            byteLength: blob.size,
            blob,
          }),
        ]),
      }),
    );
    let current = true;
    const hydration = hydrateCurrentMediaSnapshot({
      binding,
      pageBounds: [{ widthPts: 600, heightPts: 800 }],
      isCurrent: () => current,
    });
    await readStarted;
    current = false;
    releaseRead?.();

    await expect(hydration).rejects.toMatchObject({ code: "stale" });
    expect(
      (
        stores
          .get(QUICKFILL_MEDIA_SESSION_STORE)
          ?.get("current_media") as { overlays: unknown[] }
      ).overlays,
    ).toHaveLength(1);
  });

  it("does not mutate invalid media when recovery cannot fingerprint it safely", async () => {
    const binding = await readyDocument(pdfBytes(45));
    const cyclicSession: Record<string, unknown> = {
      key: "current_media",
      schemaVersion: 1,
      documentBinding: binding,
      savedAtMs: Date.now(),
      writeSequence: 1,
      overlays: [],
    };
    (cyclicSession.overlays as unknown[]).push(cyclicSession);
    const sentinelResourceId = `sha256-${"d".repeat(64)}`;
    stores
      .get(QUICKFILL_MEDIA_SESSION_STORE)
      ?.set("current_media", cyclicSession);
    stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(sentinelResourceId, {
      resourceId: sentinelResourceId,
      sentinel: true,
    });

    await expect(
      hydrateCurrentMediaSnapshot({
        binding,
        pageBounds: [{ widthPts: 600, heightPts: 800 }],
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(
      stores
        .get(QUICKFILL_MEDIA_SESSION_STORE)
        ?.get("current_media"),
    ).toBe(cyclicSession);
    expect(
      stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.has(sentinelResourceId),
    ).toBe(true);
  });

  it("prevents an older binding or write sequence from overwriting newer state", async () => {
    const firstBinding = await readyDocument(pdfBytes(1));
    const resource = await pngResource();
    await saveMediaSnapshotWithRetry(
      firstBinding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-first", resource.resourceId),
        ]),
        resources: Object.freeze([resource]),
      }),
    );
    const secondBinding = await replaceCurrentMediaDocument(pdfBytes(2));

    await expect(
      saveMediaSnapshotWithRetry(
        firstBinding,
        2,
        Object.freeze({ overlays: Object.freeze([]), resources: Object.freeze([]) }),
      ),
    ).rejects.toMatchObject({ code: "stale" });
    await saveMediaSnapshotWithRetry(
      secondBinding,
      1,
      Object.freeze({ overlays: Object.freeze([]), resources: Object.freeze([]) }),
    );
    await expect(
      saveMediaSnapshotWithRetry(
        secondBinding,
        1,
        Object.freeze({ overlays: Object.freeze([]), resources: Object.freeze([]) }),
      ),
    ).rejects.toMatchObject({ code: "stale" });
  });

  it("coalesces pending edits to the newest immutable state", async () => {
    jest.useFakeTimers();
    const binding = await readyDocument();
    const resource = await pngResource();
    const writer = new MediaPersistenceWriter({
      binding,
      initialWriteSequence: 0,
      onFailure: (error) => {
        throw error;
      },
    });
    writer.schedule(
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-coalesced", resource.resourceId, 20),
        ]),
        resources: Object.freeze([resource]),
      }),
    );
    writer.schedule(
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-coalesced", resource.resourceId, 220),
        ]),
        resources: Object.freeze([resource]),
      }),
    );

    await jest.advanceTimersByTimeAsync(MEDIA_PERSISTENCE_WRITE_DELAY_MS);
    await Promise.resolve();

    const manifest = stores
      .get(QUICKFILL_MEDIA_SESSION_STORE)
      ?.get("current_media") as {
      overlays: Array<{ x: number }>;
      writeSequence: number;
    };
    expect(manifest.overlays[0].x).toBe(220);
    expect(manifest.writeSequence).toBe(1);
    writer.dispose();
  });

  it("cleans orphan state and retries quota once before surfacing media-only failure", async () => {
    const binding = await readyDocument();
    const resource = await pngResource();
    const orphanResourceId = `sha256-${"e".repeat(64)}`;
    stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(orphanResourceId, {
      schemaVersion: 1,
      resourceId: orphanResourceId,
      mimeType: "image/png",
      width: 1,
      height: 1,
      byteLength: resource.byteLength,
      blob: resource.blob,
    });
    let remainingQuotaFailures = 1;
    let assetPutAttempts = 0;
    let pdfTimestampReads = 0;
    transactionSpy.mockImplementation(async (_mode, operation) => {
      const base = facadeFor(stores);
      return operation({
        ...base,
        async get(storeName, key) {
          if (
            storeName === QUICKFILL_TIMESTAMP_STORE &&
            key === QUICKFILL_PDF_TIMESTAMP_KEY
          ) {
            pdfTimestampReads += 1;
          }
          return base.get(storeName, key);
        },
        async put(storeName, value, key) {
          if (storeName === QUICKFILL_MEDIA_ASSET_STORE) {
            assetPutAttempts += 1;
            if (remainingQuotaFailures > 0) {
              remainingQuotaFailures -= 1;
              throw new DOMException("simulated quota", "QuotaExceededError");
            }
          }
          return base.put(storeName, value, key);
        },
      });
    });
    const snapshot = Object.freeze({
      overlays: Object.freeze([
        overlay("media-quota-retry", resource.resourceId),
      ]),
      resources: Object.freeze([resource]),
    });

    await expect(
      saveMediaSnapshotWithRetry(binding, 1, snapshot),
    ).resolves.toBeUndefined();
    expect(assetPutAttempts).toBe(2);
    expect(pdfTimestampReads).toBe(1);
    expect(
      stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.has(orphanResourceId),
    ).toBe(false);

    const nextBinding = await readyDocument(pdfBytes(60));
    remainingQuotaFailures = Number.POSITIVE_INFINITY;
    assetPutAttempts = 0;
    await expect(
      saveMediaSnapshotWithRetry(nextBinding, 1, snapshot),
    ).rejects.toMatchObject({ code: "quota" });
    expect(assetPutAttempts).toBe(2);
  });

  it("removes orphan assets during feature-on cleanup without touching the current PDF", async () => {
    const binding = await readyDocument();
    const resource = await pngResource();
    await saveMediaSnapshotWithRetry(
      binding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-kept", resource.resourceId),
        ]),
        resources: Object.freeze([resource]),
      }),
    );
    stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(
      `sha256-${"f".repeat(64)}`,
      {
        schemaVersion: 1,
        resourceId: `sha256-${"f".repeat(64)}`,
        mimeType: "image/png",
        width: 1,
        height: 1,
        byteLength: resource.byteLength,
        blob: resource.blob,
      },
    );

    await cleanupMediaPersistence();

    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(1);
    expect(stores.get(QUICKFILL_PDF_STORE)?.has(QUICKFILL_PDF_KEY)).toBe(true);
    expect(
      stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.get(QUICKFILL_MEDIA_BINDING_KEY),
    ).toEqual(binding);
    expect(
      stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.has(QUICKFILL_PDF_TIMESTAMP_KEY),
    ).toBe(true);
  });

  it("preserves recent core data when media expires, but clears all state when core data is missing", async () => {
    const resource = await pngResource();
    const expiredBinding = await readyDocument(pdfBytes(70));
    await saveMediaSnapshotWithRetry(
      expiredBinding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-expired", resource.resourceId),
        ]),
        resources: Object.freeze([resource]),
      }),
    );
    const persistedExpiredSession = stores
      .get(QUICKFILL_MEDIA_SESSION_STORE)
      ?.get("current_media") as Record<string, unknown>;
    stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.set("current_media", {
      ...persistedExpiredSession,
      savedAtMs: Date.now() - persistence.QUICKFILL_MAX_SESSION_AGE_MS - 1,
    });
    const currentPdf = stores
      .get(QUICKFILL_PDF_STORE)
      ?.get(QUICKFILL_PDF_KEY);
    const currentPdfTimestamp = stores
      .get(QUICKFILL_TIMESTAMP_STORE)
      ?.get(QUICKFILL_PDF_TIMESTAMP_KEY);

    await cleanupMediaPersistence();
    expect(
      stores.get(QUICKFILL_PDF_STORE)?.get(QUICKFILL_PDF_KEY),
    ).toBe(currentPdf);
    expect(
      stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.get(QUICKFILL_PDF_TIMESTAMP_KEY),
    ).toBe(currentPdfTimestamp);
    expect(
      stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.has(QUICKFILL_MEDIA_BINDING_KEY),
    ).toBe(false);
    expect(stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.size).toBe(0);
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(0);

    const missingCoreBinding = await readyDocument(pdfBytes(71));
    stores
      .get(QUICKFILL_PDF_STORE)
      ?.delete(QUICKFILL_PDF_KEY);
    await cleanupMediaPersistence();
    expect(stores.get(QUICKFILL_TIMESTAMP_STORE)?.size).toBe(0);
    expect(stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.size).toBe(0);
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(0);
    expect(expiredBinding.pdfDigest).toMatch(/^pdf-sha256-v1-/);
    expect(missingCoreBinding.pdfDigest).toMatch(/^pdf-sha256-v1-/);
  });

  it("preserves recent core data when media bindings mismatch or media is corrupt", async () => {
    const resource = await pngResource();
    const mismatchedBinding = await readyDocument(pdfBytes(72));
    await saveMediaSnapshotWithRetry(
      mismatchedBinding,
      1,
      Object.freeze({
        overlays: Object.freeze([
          overlay("media-mismatched", resource.resourceId),
        ]),
        resources: Object.freeze([resource]),
      }),
    );
    const differentBinding = await createMediaDocumentBinding(pdfBytes(73));
    const mismatchedSession = stores
      .get(QUICKFILL_MEDIA_SESSION_STORE)
      ?.get("current_media") as Record<string, unknown>;
    stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.set("current_media", {
      ...mismatchedSession,
      documentBinding: differentBinding,
    });
    const mismatchedPdf = stores
      .get(QUICKFILL_PDF_STORE)
      ?.get(QUICKFILL_PDF_KEY);
    const mismatchedTimestamp = stores
      .get(QUICKFILL_TIMESTAMP_STORE)
      ?.get(QUICKFILL_PDF_TIMESTAMP_KEY);

    await cleanupMediaPersistence();
    expect(
      stores.get(QUICKFILL_PDF_STORE)?.get(QUICKFILL_PDF_KEY),
    ).toBe(mismatchedPdf);
    expect(
      stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.get(QUICKFILL_PDF_TIMESTAMP_KEY),
    ).toBe(mismatchedTimestamp);
    expect(
      stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.has(QUICKFILL_MEDIA_BINDING_KEY),
    ).toBe(false);
    expect(stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.size).toBe(0);
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(0);

    const corruptBinding = await readyDocument(pdfBytes(72));
    const corruptPdf = stores
      .get(QUICKFILL_PDF_STORE)
      ?.get(QUICKFILL_PDF_KEY);
    stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.set("current_media", {
      key: "current_media",
      malformed: true,
    });
    stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.set(resource.resourceId, {
      malformed: true,
      resourceId: resource.resourceId,
    });
    await cleanupMediaPersistence();
    expect(
      stores.get(QUICKFILL_PDF_STORE)?.get(QUICKFILL_PDF_KEY),
    ).toBe(corruptPdf);
    expect(
      stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.has(QUICKFILL_PDF_TIMESTAMP_KEY),
    ).toBe(true);
    expect(
      stores
        .get(QUICKFILL_TIMESTAMP_STORE)
        ?.has(QUICKFILL_MEDIA_BINDING_KEY),
    ).toBe(false);
    expect(stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.size).toBe(0);
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(0);
    expect(corruptBinding.pdfDigest).toMatch(/^pdf-sha256-v1-/);
    expect(mismatchedBinding.pdfDigest).toMatch(/^pdf-sha256-v1-/);
  });

  it("reports Web Crypto unavailability as media-only failure", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
    });
    try {
      await expect(createMediaDocumentBinding(pdfBytes())).rejects.toBeInstanceOf(
        MediaPersistenceError,
      );
      expect(stores.get(QUICKFILL_PDF_STORE)?.size).toBe(0);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: webcrypto,
      });
    }
  });
});
