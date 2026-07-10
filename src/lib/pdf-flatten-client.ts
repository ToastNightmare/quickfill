// Flattened Whiteout export helpers (client side).
//
// For each page that contains whiteout fields, render the original PDF page
// to a canvas with pdf.js, burn the whiteout rectangles directly into that
// canvas, and hand back the resulting image. The server embeds the image as
// the page background, so covered original text never reaches the download.
//
// Everything here fails open: if rendering is not possible the caller sends
// no flattened image and the export keeps the current vector whiteout.

import type { EditorField } from "@/lib/types";

/** Preferred oversampling for flattened pages (balances quality vs payload). */
export const FLATTEN_RENDER_SCALE = 2;

/** Cap on the longest canvas side to bound memory and payload size. */
export const FLATTEN_MAX_DIMENSION_PX = 3000;

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
 * the fill-pdf request. Pages that cannot be safely flattened (rotated
 * pages, canvas failures, size-guard hits) are skipped so the server keeps
 * the existing vector whiteout for them.
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

      const rotation = (((page.rotate ?? 0) % 360) + 360) % 360;
      if (rotation !== 0) {
        console.warn(`flatten whiteout: skipping rotated page ${pageIndex} (${rotation}deg)`);
        continue;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = flattenScaleFor(baseViewport.width, baseViewport.height);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      // White base so transparent PDF backgrounds export as paper white.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      // Burn the whiteout into the pixels before anything leaves the client.
      const pixelScale = baseViewport.width > 0 ? canvas.width / baseViewport.width : scale;
      burnWhiteoutIntoCanvas(ctx, fields, pageIndex, pixelScale);

      const dataUrl = canvas.toDataURL("image/png");
      const bytes = estimateDataUrlBytes(dataUrl);
      if (bytes <= 0) continue;
      if (totalBytes + bytes > FLATTEN_MAX_TOTAL_BYTES) {
        console.warn(`flatten whiteout: payload size guard hit at page ${pageIndex}, keeping vector whiteout`);
        continue;
      }

      totalBytes += bytes;
      entries.push([pageIndex, dataUrl]);
    } catch (err) {
      console.warn(
        `flatten whiteout: failed to render page ${pageIndex}, keeping vector whiteout:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return entries;
}
