import { webcrypto } from "node:crypto";
import {
  persistPdfForEditorMediaSession,
  prepareCurrentMediaDocument,
} from "@/lib/media-persistence";
import * as persistence from "@/lib/persistence";
import {
  QUICKFILL_MEDIA_ASSET_STORE,
  QUICKFILL_MEDIA_SESSION_STORE,
  QUICKFILL_PDF_KEY,
  QUICKFILL_PDF_STORE,
  QUICKFILL_TIMESTAMP_STORE,
  type QuickFillMediaStoreName,
  type QuickFillTransactionFacade,
} from "@/lib/persistence";

function mediaFacade(
  stores: Map<QuickFillMediaStoreName, Map<IDBValidKey, unknown>>,
): QuickFillTransactionFacade {
  const store = (name: QuickFillMediaStoreName) => {
    const result = stores.get(name);
    if (!result) throw new DOMException("missing store", "NotFoundError");
    return result;
  };
  return {
    async get<T>(name, key) {
      return store(name).get(key) as T | undefined;
    },
    async getAll<T>(name) {
      return [...store(name).values()] as T[];
    },
    async getAllKeys(name) {
      return [...store(name).keys()];
    },
    async put(name, value, suppliedKey) {
      const record = value as Record<string, unknown>;
      const key =
        suppliedKey ??
        (name === QUICKFILL_MEDIA_SESSION_STORE
          ? (record.key as IDBValidKey)
          : name === QUICKFILL_MEDIA_ASSET_STORE
            ? (record.resourceId as IDBValidKey)
            : undefined);
      if (key === undefined) throw new DOMException("missing key", "DataError");
      store(name).set(key, value);
    },
    async delete(name, key) {
      store(name).delete(key);
    },
    async clear(name) {
      store(name).clear();
    },
  };
}

describe("editor media persistence orchestration", () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });

  it("uses only existing core PDF persistence while the exact flag is off", async () => {
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    const savePdf = jest
      .spyOn(persistence, "savePdfToIndexedDB")
      .mockResolvedValue(undefined);
    const mediaTransaction = jest
      .spyOn(persistence, "runQuickFillMediaTransaction")
      .mockRejectedValue(new Error("media path must stay unreachable"));

    await expect(
      persistPdfForEditorMediaSession(bytes, false),
    ).resolves.toEqual({ status: "unavailable" });
    expect(savePdf).toHaveBeenCalledWith(bytes);
    expect(mediaTransaction).not.toHaveBeenCalled();
  });

  it("atomically saves the PDF and returns a durable binding while enabled", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
    const stores = new Map<QuickFillMediaStoreName, Map<IDBValidKey, unknown>>([
      [QUICKFILL_PDF_STORE, new Map()],
      [QUICKFILL_TIMESTAMP_STORE, new Map()],
      [QUICKFILL_MEDIA_SESSION_STORE, new Map()],
      [QUICKFILL_MEDIA_ASSET_STORE, new Map()],
    ]);
    jest
      .spyOn(persistence, "runQuickFillMediaTransaction")
      .mockImplementation(async (_mode, operation) =>
        operation(mediaFacade(stores)),
      );
    const savePdf = jest.spyOn(persistence, "savePdfToIndexedDB");
    const bytes = Uint8Array.from([4, 5, 6]).buffer;

    const session = await persistPdfForEditorMediaSession(bytes, true);

    expect(session.status).toBe("ready");
    expect(session).toEqual(
      expect.objectContaining({
        mediaState: { kind: "empty", writeSequence: 0 },
      }),
    );
    expect(stores.get(QUICKFILL_PDF_STORE)?.get(QUICKFILL_PDF_KEY)).toBe(
      bytes,
    );
    expect(stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.size).toBe(1);
    expect(savePdf).not.toHaveBeenCalled();
  });

  it("distinguishes a known-empty current document from a snapshot requiring hydration", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
    const stores = new Map<QuickFillMediaStoreName, Map<IDBValidKey, unknown>>([
      [QUICKFILL_PDF_STORE, new Map()],
      [QUICKFILL_TIMESTAMP_STORE, new Map()],
      [QUICKFILL_MEDIA_SESSION_STORE, new Map()],
      [QUICKFILL_MEDIA_ASSET_STORE, new Map()],
    ]);
    jest
      .spyOn(persistence, "runQuickFillMediaTransaction")
      .mockImplementation(async (_mode, operation) =>
        operation(mediaFacade(stores)),
      );
    const bytes = Uint8Array.from([11, 12, 13]).buffer;
    const replacement = await persistPdfForEditorMediaSession(bytes, true);
    if (replacement.status !== "ready") {
      throw new Error("Expected a ready replacement session");
    }

    await expect(prepareCurrentMediaDocument(bytes)).resolves.toEqual({
      status: "ready",
      binding: replacement.binding,
      mediaState: { kind: "empty", writeSequence: 0 },
    });

    const persisted = stores
      .get(QUICKFILL_MEDIA_SESSION_STORE)
      ?.get("current_media") as Record<string, unknown>;
    stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.set("current_media", {
      ...persisted,
      writeSequence: 7,
      overlays: [
        {
          assetId: "media-restored",
          resourceId: `sha256-${"3".repeat(64)}`,
          pageIndex: 0,
          x: 10,
          y: 20,
          width: 100,
          height: 100,
          rotation: 0,
          flipX: false,
          flipY: false,
        },
      ],
    });
    await expect(prepareCurrentMediaDocument(bytes)).resolves.toEqual({
      status: "ready",
      binding: replacement.binding,
      mediaState: { kind: "hydrate" },
    });

    stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.set("current_media", {
      malformed: true,
    });
    await expect(prepareCurrentMediaDocument(bytes)).resolves.toEqual({
      status: "ready",
      binding: replacement.binding,
      mediaState: { kind: "hydrate" },
    });
  });

  it("rejects a stale document generation after hashing and before any database mutation", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
    const mediaTransaction = jest.spyOn(
      persistence,
      "runQuickFillMediaTransaction",
    );
    const coreSave = jest.spyOn(persistence, "savePdfToIndexedDB");
    const bytes = Uint8Array.from([14, 15, 16]).buffer;

    await expect(
      persistPdfForEditorMediaSession(bytes, true, () => false),
    ).rejects.toMatchObject({ code: "stale" });
    await expect(
      prepareCurrentMediaDocument(bytes, () => false),
    ).rejects.toMatchObject({ code: "stale" });
    expect(mediaTransaction).not.toHaveBeenCalled();
    expect(coreSave).not.toHaveBeenCalled();
  });

  it("keeps the PDF usable and invalidates old media when Web Crypto is unavailable", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      },
    });
    const stores = new Map<QuickFillMediaStoreName, Map<IDBValidKey, unknown>>([
      [QUICKFILL_PDF_STORE, new Map()],
      [QUICKFILL_TIMESTAMP_STORE, new Map()],
      [QUICKFILL_MEDIA_SESSION_STORE, new Map([["current_media", { stale: true }]])],
      [QUICKFILL_MEDIA_ASSET_STORE, new Map([["stale", { stale: true }]])],
    ]);
    jest
      .spyOn(persistence, "runQuickFillMediaTransaction")
      .mockImplementation(async (_mode, operation) =>
        operation(mediaFacade(stores)),
      );
    const bytes = Uint8Array.from([7, 8, 9]).buffer;

    await expect(
      persistPdfForEditorMediaSession(bytes, true),
    ).resolves.toEqual({ status: "unavailable" });
    expect(stores.get(QUICKFILL_PDF_STORE)?.get(QUICKFILL_PDF_KEY)).toBe(
      bytes,
    );
    expect(stores.get(QUICKFILL_MEDIA_SESSION_STORE)?.size).toBe(0);
    expect(stores.get(QUICKFILL_MEDIA_ASSET_STORE)?.size).toBe(0);
  });

  it("falls back to core save with a binding invalidation marker after media storage failure", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      },
    });
    jest
      .spyOn(persistence, "runQuickFillMediaTransaction")
      .mockRejectedValue(new DOMException("storage blocked", "AbortError"));
    const savePdf = jest
      .spyOn(persistence, "savePdfToIndexedDB")
      .mockResolvedValue(undefined);
    const bytes = Uint8Array.from([10]).buffer;

    await expect(
      persistPdfForEditorMediaSession(bytes, true),
    ).resolves.toEqual({ status: "unavailable" });
    expect(savePdf).toHaveBeenCalledWith(bytes, {
      invalidateMediaBinding: true,
    });
  });
});
