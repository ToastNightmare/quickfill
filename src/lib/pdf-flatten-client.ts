// Flattened Whiteout export helpers (client side).
//
// For each page that contains whiteout fields, render the original PDF page
// to a canvas with pdf.js, burn the whiteout rectangles directly into that
// canvas, and hand back the resulting image. The server embeds the image as
// the page background, so covered original text never reaches the download.
//
// The server verifies that every whiteout page arrived and was applied before
// it returns a download. A client-side failure therefore becomes a visible,
// fail-closed response instead of a vector-only whiteout.

import type { EditorField } from "@/lib/types";

export const WHITEOUT_REDACTION_ERROR_CODE = "whiteout_redaction_failed";
export const WHITEOUT_REDACTION_ERROR_MESSAGE =
  "We couldn't securely remove the whited-out areas. Please try again, or contact support.";

/** Preferred oversampling for flattened pages (balances quality vs payload). */
export const FLATTEN_RENDER_SCALE = 2;

/** Lowest normal-page render scale attempted before the server fails closed. */
export const FLATTEN_MIN_RENDER_SCALE = 1;

/** Cap on the longest canvas side to bound memory and payload size. */
export const FLATTEN_MAX_DIMENSION_PX = 3000;

/** Client-side cap aligned with the server's per-image guard. */
export const FLATTEN_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Client-side cap on combined flattened image payload. */
export const FLATTEN_MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/** Pages (0-based, sorted) that contain at least one whiteout field. */
export function whiteoutPageIndexes(fields: EditorField[]): number[] {
  const pages = new Set<number>();
  for (const field of fields) {
    if (field.type === "whiteout") pages.add(field.page);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

/** Render scale that keeps the longest side under the pixel cap. */
export function flattenScaleFor(width: number, height: number): number {
  const longestSide = Math.max(width, height);
  if (longestSide <= 0) return FLATTEN_RENDER_SCALE;
  return Math.min(FLATTEN_RENDER_SCALE, FLATTEN_MAX_DIMENSION_PX / longestSide);
}

/** Descending render scales used when a PNG exceeds an image or payload budget. */
export function flattenScaleAttemptsFor(width: number, height: number): number[] {
  const initialScale = flattenScaleFor(width, height);
  const minimumScale = Math.min(FLATTEN_MIN_RENDER_SCALE, initialScale);
  const attempts: number[] = [];
  let scale = initialScale;

  while (scale > minimumScale) {
    attempts.push(scale);
    const nextScale = Math.max(minimumScale, scale * 0.75);
    if (nextScale === scale) break;
    scale = nextScale;
  }

  if (attempts.length === 0 || attempts[attempts.length - 1] !== minimumScale) {
    attempts.push(minimumScale);
  }
  return attempts;
}

/** Approximate decoded byte size of a base64 data URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  const base64Length = commaIndex >= 0 ? dataUrl.length - commaIndex - 1 : 0;
  return Math.floor((base64Length * 3) / 4);
}

interface FillRectContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Burn every whiteout rectangle for one page into a rendered canvas.
 *
 * Field coordinates are stored in PDF point space with a top-left origin
 * (the pdf.js scale-1 viewport), so mapping to canvas pixels is a plain
 * multiply by the pixel scale used for the render.
 */
export function burnWhiteoutIntoCanvas(
  ctx: FillRectContext,
  fields: EditorField[],
  pageIndex: number,
  pixelScale: number,
): number {
  let burned = 0;
  for (const field of fields) {
    if (field.type !== "whiteout" || field.page !== pageIndex) continue;
    ctx.fillStyle = field.fillColor || "#ffffff";
    ctx.fillRect(
      field.x * pixelScale,
      field.y * pixelScale,
      field.width * pixelScale,
      field.height * pixelScale,
    );
    burned++;
  }
  return burned;
}

// Minimal structural types for the pdf.js objects we use, so this module
// does not import pdf.js types directly.
interface PdfjsViewport {
  width: number;
  height: number;
}

interface PdfjsPage {
  rotate?: number;
  getViewport(params: { scale: number }): PdfjsViewport;
  render(params: unknown): { promise: Promise<unknown> };
}

interface PdfjsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfjsPage>;
}

/**
 * Render each whiteout page with pdf.js and burn the whiteout in.
 *
 * Returns [pageIndex, pngDataUrl] tuples ready to be JSON-serialised into
 * the fill-pdf request. pdf.js applies each page's rotation to getViewport,
 * so both the raster and whiteout coordinates are already in display space.
 * Missing entries are rejected authoritatively by the server.
 */
export async function renderFlattenedWhiteoutPages(
  pdf: PdfjsDocument,
  fields: EditorField[],
): Promise<[number, string][]> {
  const entries: [number, string][] = [];
  let totalBytes = 0;

  for (const pageIndex of whiteoutPageIndexes(fields)) {
    try {
      if (pageIndex < 0 || pageIndex >= pdf.numPages) continue;
      const page = await pdf.getPage(pageIndex + 1);

      const baseViewport = page.getViewport({ scale: 1 });
      const remainingTotalBytes = FLATTEN_MAX_TOTAL_BYTES - totalBytes;
      const pageBudgetBytes = Math.min(FLATTEN_MAX_IMAGE_BYTES, remainingTotalBytes);
      let flattenedEntry: [number, string] | null = null;

      for (const scale of flattenScaleAttemptsFor(baseViewport.width, baseViewport.height)) {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context is unavailable");

        // White base so transparent PDF backgrounds export as paper white.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        // Burn the whiteout into the display-oriented pixels before anything
        // leaves the client.
        const pixelScale = baseViewport.width > 0 ? canvas.width / baseViewport.width : scale;
        burnWhiteoutIntoCanvas(ctx, fields, pageIndex, pixelScale);

        const dataUrl = canvas.toDataURL("image/png");
        const bytes = estimateDataUrlBytes(dataUrl);
        if (bytes > 0 && bytes <= pageBudgetBytes) {
          flattenedEntry = [pageIndex, dataUrl];
          totalBytes += bytes;
          break;
        }
      }

      if (flattenedEntry) {
        entries.push(flattenedEntry);
      } else {
        console.warn(
          `flatten whiteout: page ${pageIndex} did not fit the secure image budget at minimum scale`,
        );
      }
    } catch (err) {
      console.warn(
        `flatten whiteout: failed to render page ${pageIndex}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return entries;
}
