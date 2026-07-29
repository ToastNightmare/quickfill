import type { EditorField } from "./types";
import { isAddMediaEnabled } from "./add-media-rollout";

export const QUICKFILL_DB_NAME = "quickfill_db";
export const QUICKFILL_CORE_DB_VERSION = 2;
export const QUICKFILL_MEDIA_DB_VERSION = 3;
export const QUICKFILL_PDF_STORE = "pdfs";
export const QUICKFILL_TIMESTAMP_STORE = "current_pdf_timestamp";
export const QUICKFILL_MEDIA_SESSION_STORE = "media_sessions";
export const QUICKFILL_MEDIA_ASSET_STORE = "media_assets";
export const QUICKFILL_PDF_KEY = "current_pdf";
export const QUICKFILL_PDF_TIMESTAMP_KEY = "current_pdf_timestamp";
export const QUICKFILL_PDF_REPLACEMENT_PENDING_KEY =
  "current_pdf_replacement_pending";
export const QUICKFILL_MEDIA_BINDING_KEY = "current_media_binding";

const FIELDS_KEY = "quickfill_fields";
const PAGE_KEY = "quickfill_page";
const FILENAME_KEY = "quickfill_filename";
const ZOOM_KEY = "quickfill_zoom";

// 7 days in milliseconds
export const QUICKFILL_MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DATABASE_OPEN_TIMEOUT_MS = 4_000;

type QuickFillCoreStoreName =
  | typeof QUICKFILL_PDF_STORE
  | typeof QUICKFILL_TIMESTAMP_STORE;

export type QuickFillMediaStoreName =
  | QuickFillCoreStoreName
  | typeof QUICKFILL_MEDIA_SESSION_STORE
  | typeof QUICKFILL_MEDIA_ASSET_STORE;

export interface QuickFillTransactionFacade {
  get<T>(
    storeName: QuickFillMediaStoreName,
    key: IDBValidKey,
  ): Promise<T | undefined>;
  getAll<T>(storeName: QuickFillMediaStoreName): Promise<T[]>;
  getAllKeys(storeName: QuickFillMediaStoreName): Promise<IDBValidKey[]>;
  put(
    storeName: QuickFillMediaStoreName,
    value: unknown,
    key?: IDBValidKey,
  ): Promise<void>;
  delete(
    storeName: QuickFillMediaStoreName,
    key: IDBValidKey,
  ): Promise<void>;
  clear(storeName: QuickFillMediaStoreName): Promise<void>;
}

function ensureCoreStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(QUICKFILL_PDF_STORE)) {
    db.createObjectStore(QUICKFILL_PDF_STORE);
  }
  if (!db.objectStoreNames.contains(QUICKFILL_TIMESTAMP_STORE)) {
    db.createObjectStore(QUICKFILL_TIMESTAMP_STORE);
  }
}

function ensureMediaStores(db: IDBDatabase): void {
  ensureCoreStores(db);
  if (!db.objectStoreNames.contains(QUICKFILL_MEDIA_SESSION_STORE)) {
    db.createObjectStore(QUICKFILL_MEDIA_SESSION_STORE, { keyPath: "key" });
  }
  if (!db.objectStoreNames.contains(QUICKFILL_MEDIA_ASSET_STORE)) {
    db.createObjectStore(QUICKFILL_MEDIA_ASSET_STORE, {
      keyPath: "resourceId",
    });
  }
}

function openRequest(
  version: number | undefined,
  includeMediaStores: boolean,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const indexedDbApi = globalThis.indexedDB;
    if (!indexedDbApi || typeof indexedDbApi.open !== "function") {
      reject(new DOMException("IndexedDB is unavailable", "NotSupportedError"));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request =
        version === undefined
          ? indexedDbApi.open(QUICKFILL_DB_NAME)
          : indexedDbApi.open(QUICKFILL_DB_NAME, version);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    };
    const timeoutId = setTimeout(() => {
      finishReject(
        new DOMException("IndexedDB open timed out", "AbortError"),
      );
    }, DATABASE_OPEN_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      try {
        if (includeMediaStores) ensureMediaStores(request.result);
        else ensureCoreStores(request.result);
      } catch (error) {
        try {
          request.transaction?.abort();
        } catch {
          // The upgrade request will still reject or time out.
        }
        finishReject(error);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      finishReject(
        request.error ?? new DOMException("IndexedDB open failed", "AbortError"),
      );
    };
    request.onblocked = () => {
      finishReject(
        new DOMException("IndexedDB open was blocked", "AbortError"),
      );
    };
  });
}

async function openDatabase(includeMediaStores: boolean): Promise<IDBDatabase> {
  const targetVersion = includeMediaStores
    ? QUICKFILL_MEDIA_DB_VERSION
    : QUICKFILL_CORE_DB_VERSION;
  let db = await openRequest(undefined, false);
  if (db.version < targetVersion) {
    db.close();
    db = await openRequest(targetVersion, includeMediaStores);
  }

  const requiredStores = includeMediaStores
    ? [
        QUICKFILL_PDF_STORE,
        QUICKFILL_TIMESTAMP_STORE,
        QUICKFILL_MEDIA_SESSION_STORE,
        QUICKFILL_MEDIA_ASSET_STORE,
      ]
    : [QUICKFILL_PDF_STORE, QUICKFILL_TIMESTAMP_STORE];
  if (requiredStores.some((storeName) => !db.objectStoreNames.contains(storeName))) {
    db.close();
    throw new DOMException(
      "QuickFill IndexedDB schema is unavailable",
      "InvalidStateError",
    );
  }
  return db;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new DOMException("IndexedDB request failed", "AbortError"),
      );
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new DOMException("IndexedDB transaction failed", "AbortError"),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new DOMException("IndexedDB transaction aborted", "AbortError"),
      );
  });
}

function createTransactionFacade(
  transaction: IDBTransaction,
): QuickFillTransactionFacade {
  const objectStore = (storeName: QuickFillMediaStoreName) =>
    transaction.objectStore(storeName);
  return Object.freeze({
    async get<T>(storeName: QuickFillMediaStoreName, key: IDBValidKey) {
      return requestResult(objectStore(storeName).get(key)) as Promise<
        T | undefined
      >;
    },
    async getAll<T>(storeName: QuickFillMediaStoreName) {
      return requestResult(objectStore(storeName).getAll()) as Promise<T[]>;
    },
    async getAllKeys(storeName: QuickFillMediaStoreName) {
      return requestResult(objectStore(storeName).getAllKeys());
    },
    async put(
      storeName: QuickFillMediaStoreName,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request =
        key === undefined
          ? objectStore(storeName).put(value)
          : objectStore(storeName).put(value, key);
      await requestResult(request);
    },
    async delete(storeName: QuickFillMediaStoreName, key: IDBValidKey) {
      await requestResult(objectStore(storeName).delete(key));
    },
    async clear(storeName: QuickFillMediaStoreName) {
      await requestResult(objectStore(storeName).clear());
    },
  });
}

let databaseOperationTail: Promise<void> = Promise.resolve();

function serializeDatabaseOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = databaseOperationTail.then(operation, operation);
  databaseOperationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function runTransaction<T>(
  includeMediaStores: boolean,
  storeNames: readonly QuickFillMediaStoreName[],
  mode: IDBTransactionMode,
  operation: (facade: QuickFillTransactionFacade) => Promise<T>,
): Promise<T> {
  return serializeDatabaseOperation(async () => {
    const db = await openDatabase(includeMediaStores);
    let transaction: IDBTransaction | null = null;
    let completion: Promise<void> | null = null;
    try {
      transaction = db.transaction([...storeNames], mode);
      completion = transactionCompletion(transaction);
      const result = await operation(createTransactionFacade(transaction));
      await completion;
      return result;
    } catch (error) {
      if (transaction) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be complete or aborted.
        }
      }
      await completion?.catch(() => undefined);
      throw error;
    } finally {
      db.close();
    }
  });
}

export function runQuickFillMediaTransaction<T>(
  mode: IDBTransactionMode,
  operation: (facade: QuickFillTransactionFacade) => Promise<T>,
): Promise<T> {
  return runTransaction(
    true,
    [
      QUICKFILL_PDF_STORE,
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_MEDIA_SESSION_STORE,
      QUICKFILL_MEDIA_ASSET_STORE,
    ],
    mode,
    operation,
  );
}

function runCoreTransaction<T>(
  mode: IDBTransactionMode,
  operation: (facade: QuickFillTransactionFacade) => Promise<T>,
): Promise<T> {
  return runTransaction(
    false,
    [QUICKFILL_PDF_STORE, QUICKFILL_TIMESTAMP_STORE],
    mode,
    operation,
  );
}

export interface SavePdfOptions {
  /**
   * Explicit fallback control. When omitted, an exact feature-on build clears
   * media atomically with the core PDF save. `true` removes only the binding
   * through the core stores when the media stores are unavailable.
   */
  readonly invalidateMediaBinding?: boolean;
}

async function savePdfCore(
  arrayBuffer: ArrayBuffer,
  options: SavePdfOptions,
): Promise<void> {
  await runCoreTransaction("readwrite", async (transaction) => {
    await transaction.put(
      QUICKFILL_PDF_STORE,
      arrayBuffer,
      QUICKFILL_PDF_KEY,
    );
    await transaction.put(
      QUICKFILL_TIMESTAMP_STORE,
      Date.now(),
      QUICKFILL_PDF_TIMESTAMP_KEY,
    );
    await transaction.put(
      QUICKFILL_TIMESTAMP_STORE,
      true,
      QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
    );
    if (options.invalidateMediaBinding) {
      await transaction.delete(
        QUICKFILL_TIMESTAMP_STORE,
        QUICKFILL_MEDIA_BINDING_KEY,
      );
    }
  });
}

async function savePdfAndClearMedia(arrayBuffer: ArrayBuffer): Promise<void> {
  await runQuickFillMediaTransaction("readwrite", async (transaction) => {
    await transaction.put(
      QUICKFILL_PDF_STORE,
      arrayBuffer,
      QUICKFILL_PDF_KEY,
    );
    await transaction.put(
      QUICKFILL_TIMESTAMP_STORE,
      Date.now(),
      QUICKFILL_PDF_TIMESTAMP_KEY,
    );
    await transaction.delete(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
    );
    await transaction.delete(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_MEDIA_BINDING_KEY,
    );
    await transaction.clear(QUICKFILL_MEDIA_SESSION_STORE);
    await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
  });
}

export async function savePdfToIndexedDB(
  arrayBuffer: ArrayBuffer,
  options: SavePdfOptions = {},
): Promise<boolean> {
  const clearMedia =
    options.invalidateMediaBinding === undefined && isAddMediaEnabled();
  try {
    if (clearMedia) {
      await savePdfAndClearMedia(arrayBuffer);
    } else {
      await savePdfCore(arrayBuffer, options);
    }
    return true;
  } catch (err) {
    if (clearMedia) {
      try {
        await savePdfCore(arrayBuffer, { invalidateMediaBinding: true });
        return true;
      } catch {
        // Report the original feature-on failure without exposing local data.
      }
    }
    console.warn("Failed to save PDF to IndexedDB:", err);
    return false;
  }
}

export async function loadPdfFromIndexedDB(): Promise<ArrayBuffer | null> {
  try {
    const result = await runCoreTransaction("readonly", (transaction) => {
      return transaction.get<ArrayBuffer>(
        QUICKFILL_PDF_STORE,
        QUICKFILL_PDF_KEY,
      );
    });
    return result ?? null;
  } catch (err) {
    console.warn("Failed to load PDF from IndexedDB:", err);
    return null;
  }
}

async function clearPdfCore(invalidateMediaBinding: boolean): Promise<void> {
  await runCoreTransaction("readwrite", async (transaction) => {
    await transaction.delete(QUICKFILL_PDF_STORE, QUICKFILL_PDF_KEY);
    await transaction.delete(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_PDF_TIMESTAMP_KEY,
    );
    await transaction.delete(
      QUICKFILL_TIMESTAMP_STORE,
      QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
    );
    if (invalidateMediaBinding) {
      await transaction.delete(
        QUICKFILL_TIMESTAMP_STORE,
        QUICKFILL_MEDIA_BINDING_KEY,
      );
    }
  });
}

export async function clearPdfFromIndexedDB(
  options: Readonly<{ invalidateMediaBinding?: boolean }> = {},
): Promise<void> {
  try {
    await clearPdfCore(options.invalidateMediaBinding === true);
  } catch (err) {
    console.warn("Failed to clear PDF from IndexedDB:", err);
  }
}

export function saveFieldsToLocalStorage(fields: EditorField[]): boolean {
  try {
    localStorage.setItem(FIELDS_KEY, JSON.stringify(fields));
    return true;
  } catch (err) {
    console.warn("Failed to save fields to localStorage:", err);
    return false;
  }
}

export function loadFieldsFromLocalStorage(): EditorField[] {
  try {
    const raw = localStorage.getItem(FIELDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (f: Record<string, unknown>) =>
        f &&
        typeof f === "object" &&
        typeof f.id === "string" &&
        typeof f.type === "string" &&
        typeof f.x === "number" &&
        typeof f.y === "number" &&
        typeof f.width === "number" &&
        typeof f.height === "number"
    );
    return valid as EditorField[];
  } catch (err) {
    console.warn("Failed to load fields from localStorage:", err);
    return [];
  }
}

export function savePageToLocalStorage(page: number): void {
  try {
    localStorage.setItem(PAGE_KEY, String(page));
  } catch {
    // silent
  }
}

export function loadPageFromLocalStorage(): number {
  try {
    const raw = localStorage.getItem(PAGE_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveFileNameToLocalStorage(name: string): void {
  try {
    localStorage.setItem(FILENAME_KEY, name);
  } catch {
    // silent
  }
}

export function loadFileNameFromLocalStorage(): string {
  try {
    return localStorage.getItem(FILENAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveZoomToLocalStorage(zoom: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    // silent
  }
}

export function loadZoomFromLocalStorage(): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY);
    return raw ? parseInt(raw, 10) || 100 : 100;
  } catch {
    return 100;
  }
}

export async function clearEditorState(
  options: Readonly<{ includeMedia?: boolean }> = {},
): Promise<void> {
  const includeMedia = options.includeMedia ?? isAddMediaEnabled();
  if (includeMedia) {
    try {
      await runQuickFillMediaTransaction("readwrite", async (transaction) => {
        await transaction.delete(QUICKFILL_PDF_STORE, QUICKFILL_PDF_KEY);
        await transaction.delete(
          QUICKFILL_TIMESTAMP_STORE,
          QUICKFILL_PDF_TIMESTAMP_KEY,
        );
        await transaction.delete(
          QUICKFILL_TIMESTAMP_STORE,
          QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
        );
        await transaction.delete(
          QUICKFILL_TIMESTAMP_STORE,
          QUICKFILL_MEDIA_BINDING_KEY,
        );
        await transaction.clear(QUICKFILL_MEDIA_SESSION_STORE);
        await transaction.clear(QUICKFILL_MEDIA_ASSET_STORE);
      });
    } catch (err) {
      console.warn("Failed to clear media from IndexedDB:", err);
      try {
        await clearPdfCore(true);
      } catch (fallbackError) {
        console.warn("Failed to clear PDF from IndexedDB:", fallbackError);
      }
    }
  } else {
    await clearPdfFromIndexedDB({ invalidateMediaBinding: false });
  }
  try {
    localStorage.removeItem(FIELDS_KEY);
    localStorage.removeItem(PAGE_KEY);
    localStorage.removeItem(FILENAME_KEY);
    localStorage.removeItem(ZOOM_KEY);
  } catch {
    // silent
  }
}

/**
 * Cleanup IndexedDB: delete PDFs older than 7 days.
 * Runs non-blocking, fire and forget.
 */
export async function cleanupOldIndexedDBSessions(): Promise<void> {
  try {
    await runCoreTransaction("readwrite", async (transaction) => {
      const storedTimestamp = await transaction.get<unknown>(
        QUICKFILL_TIMESTAMP_STORE,
        QUICKFILL_PDF_TIMESTAMP_KEY,
      );
      if (
        typeof storedTimestamp === "number" &&
        Number.isFinite(storedTimestamp) &&
        Date.now() - storedTimestamp > QUICKFILL_MAX_SESSION_AGE_MS
      ) {
        await transaction.delete(QUICKFILL_PDF_STORE, QUICKFILL_PDF_KEY);
        await transaction.delete(
          QUICKFILL_TIMESTAMP_STORE,
          QUICKFILL_PDF_TIMESTAMP_KEY,
        );
        await transaction.delete(
          QUICKFILL_TIMESTAMP_STORE,
          QUICKFILL_PDF_REPLACEMENT_PENDING_KEY,
        );
        console.log("Cleaned up old PDF from IndexedDB (older than 7 days)");
      }
    });
  } catch (err) {
    console.warn("Failed to cleanup IndexedDB:", err);
  }
}
