import type { EditorField } from "./types";

const DB_NAME = "quickfill_db";
const STORE_NAME = "pdfs";
const PDF_KEY = "current_pdf";

const FIELDS_KEY = "quickfill_fields";
const PAGE_KEY = "quickfill_page";
const FILENAME_KEY = "quickfill_filename";
const ZOOM_KEY = "quickfill_zoom";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePdfToIndexedDB(arrayBuffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(arrayBuffer, PDF_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("Failed to save PDF to IndexedDB:", err);
  }
}

export async function loadPdfFromIndexedDB(): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(PDF_KEY);
    const result = await new Promise<ArrayBuffer | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch (err) {
    console.warn("Failed to load PDF from IndexedDB:", err);
    return null;
  }
}

export async function clearPdfFromIndexedDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(PDF_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("Failed to clear PDF from IndexedDB:", err);
  }
}

export function saveFieldsToLocalStorage(fields: EditorField[]): void {
  try {
    localStorage.setItem(FIELDS_KEY, JSON.stringify(fields));
  } catch (err) {
    console.warn("Failed to save fields to localStorage:", err);
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

export async function clearEditorState(): Promise<void> {
  await clearPdfFromIndexedDB();
  try {
    localStorage.removeItem(FIELDS_KEY);
    localStorage.removeItem(PAGE_KEY);
    localStorage.removeItem(FILENAME_KEY);
    localStorage.removeItem(ZOOM_KEY);
  } catch {
    // silent
  }
}
