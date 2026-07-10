// Flattened Whiteout export helpers (server side).
//
// Pages that contain whiteout fields can be replaced with a client-rendered
// image that already has the whiteout burned in. That removes the original
// text operators from the page content, so covered text is no longer
// selectable or extractable in the downloaded PDF.
//
// This is QuickFill's "Flattened Whiteout" behaviour. It is not legal
// redaction and must never be described as such.

import { PDFDocument, PDFName } from "pdf-lib";
import type { EditorField } from "@/lib/types";

/** Max decoded bytes for a single flattened page image. */
export const FLATTENED_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Max combined decoded bytes across all flattened page images. */
export const FLATTENED_TOTAL_MAX_BYTES = 12 * 1024 * 1024;

/** Max number of flattened pages accepted per request. */
export const FLATTENED_PAGES_MAX_COUNT = 50;

export type FlattenedImageKind = "png" | "jpeg";

export interface FlattenedPageEntry {
  pageIndex: number;
  dataUrl: string;
  kind: FlattenedImageKind;
}

/** Pages (0-based) that contain at least one whiteout field. */
export function whiteoutPageSet(fields: EditorField[]): Set<number> {
  const pages = new Set<number>();
  for (const field of fields) {
    if (field.type === "whiteout") pages.add(field.page);
  }
  return pages;
}

/** Identify supported flattened image data URLs. */
export function flattenedImageKind(dataUrl: string): FlattenedImageKind | null {
  if (typeof dataUrl !== "string") return null;
  if (dataUrl.startsWith("data:image/png;base64,")) return "png";
  if (dataUrl.startsWith("data:image/jpeg;base64,")) return "jpeg";
  return null;
}

/** Approximate decoded byte size of a base64 data URL without decoding it. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  const base64Length = commaIndex >= 0 ? dataUrl.length - commaIndex - 1 : 0;
  return Math.floor((base64Length * 3) / 4);
}

/**
 * Parse and validate the flattenedPages form value.
 *
 * Expected JSON shape: Array of [pageIndex, dataUrl] tuples.
 * Invalid input never throws; anything that fails validation is dropped so
 * the export falls back to the existing vector whiteout behaviour.
 */
export function parseFlattenedPages(
  json: string | null,
  pageCount: number,
  whiteoutPages: Set<number>,
): FlattenedPageEntry[] {
  if (!json) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    console.warn("flattenedPages: invalid JSON, falling back to vector whiteout");
    return [];
  }

  if (!Array.isArray(raw)) {
    console.warn("flattenedPages: expected an array, falling back to vector whiteout");
    return [];
  }

  const entries: FlattenedPageEntry[] = [];
  const seenPages = new Set<number>();
  let totalBytes = 0;

  for (const item of raw) {
    if (entries.length >= FLATTENED_PAGES_MAX_COUNT) break;
    if (!Array.isArray(item) || item.length < 2) continue;

    const [pageIndexRaw, dataUrlRaw] = item as [unknown, unknown];
    if (typeof pageIndexRaw !== "number" || !Number.isInteger(pageIndexRaw)) continue;
    if (pageIndexRaw < 0 || pageIndexRaw >= pageCount) continue;
    if (seenPages.has(pageIndexRaw)) continue;
    // Only accept flattened images for pages that actually contain whiteout.
    if (!whiteoutPages.has(pageIndexRaw)) continue;

    if (typeof dataUrlRaw !== "string") continue;
    const kind = flattenedImageKind(dataUrlRaw);
    if (!kind) continue;

    const bytes = estimateDataUrlBytes(dataUrlRaw);
    if (bytes <= 0 || bytes > FLATTENED_IMAGE_MAX_BYTES) {
      console.warn(`flattenedPages: image for page ${pageIndexRaw} rejected by size guard`);
      continue;
    }
    if (totalBytes + bytes > FLATTENED_TOTAL_MAX_BYTES) {
      console.warn(`flattenedPages: total size guard hit at page ${pageIndexRaw}`);
      continue;
    }

    totalBytes += bytes;
    seenPages.add(pageIndexRaw);
    entries.push({ pageIndex: pageIndexRaw, dataUrl: dataUrlRaw, kind });
  }

  return entries;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return new Uint8Array(0);
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Replace the content of each flattened page with its burned-in image.
 *
 * The image is embedded first; only after a successful embed is the page's
 * original content stream replaced. Any failure leaves the page untouched so
 * the caller falls back to drawing the vector whiteout rectangle.
 *
 * Returns the set of page indexes that were successfully flattened.
 */
export async function applyFlattenedPages(
  pdfDoc: PDFDocument,
  entries: FlattenedPageEntry[],
): Promise<Set<number>> {
  const applied = new Set<number>();

  for (const entry of entries) {
    try {
      const page = pdfDoc.getPages()[entry.pageIndex];
      if (!page) continue;

      const rotation = ((page.getRotation().angle % 360) + 360) % 360;
      if (rotation !== 0) {
        console.warn(
          `flattenedPages: page ${entry.pageIndex} is rotated (${rotation}deg), falling back to vector whiteout`,
        );
        continue;
      }

      const imageBytes = dataUrlToBytes(entry.dataUrl);
      if (!imageBytes.length) continue;

      const image =
        entry.kind === "png" ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);

      // Swap in an empty content stream, dropping the original page content
      // (including its text operators), then draw the flattened image
      // full-bleed. User-added fields are drawn on top afterwards.
      const emptyStreamRef = pdfDoc.context.register(pdfDoc.context.stream(new Uint8Array()));
      page.node.set(PDFName.of("Contents"), emptyStreamRef);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: page.getHeight(),
      });

      applied.add(entry.pageIndex);
    } catch (err) {
      console.warn(
        `flattenedPages: embedding failed for page ${entry.pageIndex}, falling back to vector whiteout:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return applied;
}
