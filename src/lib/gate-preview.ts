// Locked download-gate page previews (client only).
//
// Renders a single page of the user's document offscreen with pdf.js and
// composites their placed fields on top, mirroring the finished output the
// editor shows (no selection outlines, handles, or placeholder chrome).
// Used by the download preview gate to let users inspect every page of a
// multi-page document before unlocking the clean download.
//
// This module never calls /api/fill-pdf and never produces the clean
// unlocked PDF. The output is a raster preview only; the gate overlays its
// own watermark.

import { loadPdfjsClient } from "@/lib/pdfjs-client";
import { clampSignatureOpacity, clampSignatureRotation } from "@/lib/signature-transform";
import { MASK_ERASE_FILL, isMaskErasable } from "@/lib/eraser-mask";
import type {
  CheckboxField,
  CombField,
  EditorField,
  LineField,
  SignatureField,
  WhiteoutField,
} from "@/lib/types";

export const GATE_PREVIEW_MAX_WIDTH = 1000;

const TEXT_COLOR = "#1a1a2e";
const CHECKBOX_DEFAULT_COLOR = "#121726";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Total page count of a PDF, or null when it cannot be read. */
export async function getPdfPageCount(pdfBytes: ArrayBuffer): Promise<number | null> {
  try {
    const pdfjs = await loadPdfjsClient();
    const pdf = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;
    return pdf.numPages;
  } catch {
    return null;
  }
}

function drawCheckbox(ctx: CanvasRenderingContext2D, field: CheckboxField, x: number, y: number, w: number, h: number) {
  const stamp = field.stamp ?? (field.checked ? "tick" : "none");
  const color = field.color ?? CHECKBOX_DEFAULT_COLOR;

  if (stamp === "none") {
    // Only an explicitly chosen "none" stamp draws the empty box (matching
    // the desktop editor). Unchecked AcroForm checkboxes with no stamp stay
    // untouched so the form's own printed box is all the user sees.
    if (field.stamp !== "none") return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    return;
  }

  const size = Math.min(w, h) * 0.88;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.6, size * 0.12);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stamp === "tick") {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.55);
    ctx.lineTo(x + w * 0.42, y + h * 0.78);
    ctx.lineTo(x + w * 0.82, y + h * 0.24);
    ctx.stroke();
    return;
  }
  // Cross stamp
  ctx.beginPath();
  ctx.moveTo(x + w * 0.24, y + h * 0.24);
  ctx.lineTo(x + w * 0.76, y + h * 0.76);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.76, y + h * 0.24);
  ctx.lineTo(x + w * 0.24, y + h * 0.76);
  ctx.stroke();
}

function drawComb(ctx: CanvasRenderingContext2D, field: CombField, scale: number, x: number, y: number, h: number) {
  const charCount = field.charCount ?? 9;
  const slotWidth = (field.cellWidth ?? field.width / charCount) * scale;
  const value = field.value || "";
  const offsetX = (field.offsetX ?? 0) * scale;
  const charOffsetX = (field.charOffsetX ?? 0) * scale;

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `${h * 0.6}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < charCount; i++) {
    const char = value[i];
    if (!char || char === " ") continue;
    const cellCenterX =
      field.cellPositions?.[i] !== undefined
        ? field.cellPositions[i] * scale
        : i * slotWidth + slotWidth / 2;
    ctx.fillText(char, x + cellCenterX + offsetX + charOffsetX, y + h / 2);
  }
}

async function drawSignature(
  ctx: CanvasRenderingContext2D,
  field: SignatureField,
  x: number,
  y: number,
  w: number,
  h: number
) {
  // Unsigned fields render placeholder chrome in the editor; the finished
  // preview simply omits them.
  if (!field.signatureDataUrl) return;
  const img = await loadImage(field.signatureDataUrl);
  if (!img || !img.naturalWidth || !img.naturalHeight) return;

  const pad = 4;
  const fit = Math.min((w - pad) / img.naturalWidth, (h - pad) / img.naturalHeight);
  if (!Number.isFinite(fit) || fit <= 0) return;
  const drawW = img.naturalWidth * fit;
  const drawH = img.naturalHeight * fit;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((clampSignatureRotation(field.rotation) * Math.PI) / 180);
  if (field.flipH) ctx.scale(-1, 1);
  ctx.globalAlpha = clampSignatureOpacity(field.opacity);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawTextValue(
  ctx: CanvasRenderingContext2D,
  value: string,
  fontSize: number,
  scale: number,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `${fontSize * scale}px Arial`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(value, x + 2 * scale, y + h / 2);
  ctx.restore();
}

async function drawField(ctx: CanvasRenderingContext2D, field: EditorField, scale: number): Promise<void> {
  const x = field.x * scale;
  const y = field.y * scale;
  const w = field.width * scale;
  const h = field.height * scale;

  switch (field.type) {
    case "whiteout": {
      const whiteout = field as WhiteoutField;
      ctx.fillStyle = whiteout.fillColor || "#ffffff";
      ctx.fillRect(x, y, w, h);
      return;
    }
    case "line": {
      const line = field as LineField;
      const isHorizontal = line.orientation !== "vertical";
      ctx.strokeStyle = line.color ?? "#000000";
      ctx.lineWidth = Math.max(1, line.strokeWidth * scale);
      ctx.lineCap = "round";
      ctx.beginPath();
      if (isHorizontal) {
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
      } else {
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y + h);
      }
      ctx.stroke();
      return;
    }
    case "checkbox":
      drawCheckbox(ctx, field as CheckboxField, x, y, w, h);
      return;
    case "comb":
      drawComb(ctx, field as CombField, scale, x, y, h);
      return;
    case "signature":
      await drawSignature(ctx, field as SignatureField, x, y, w, h);
      return;
    case "text":
    case "date": {
      const value = field.value;
      if (!value || value.trim() === "") return;
      drawTextValue(ctx, value, field.fontSize ?? 14, scale, x, y, w, h);
      return;
    }
    default:
      return;
  }
}

/**
 * Draw one field onto the page canvas, honouring eraser masks. Masked
 * fields render into their own transparent layer first so destination-out
 * erasing removes only the field's pixels, never the page underneath
 * (matching the Konva group-cache behaviour in the editor).
 */
async function compositeField(
  ctx: CanvasRenderingContext2D,
  field: EditorField,
  scale: number,
  pageWidth: number,
  pageHeight: number
): Promise<void> {
  const masks = field.eraseMasks;
  if (!masks?.length || !isMaskErasable(field)) {
    await drawField(ctx, field, scale);
    return;
  }

  const layer = document.createElement("canvas");
  layer.width = pageWidth;
  layer.height = pageHeight;
  const layerCtx = layer.getContext("2d");
  if (!layerCtx) {
    await drawField(ctx, field, scale);
    return;
  }

  await drawField(layerCtx, field, scale);
  layerCtx.globalCompositeOperation = "destination-out";
  layerCtx.fillStyle = MASK_ERASE_FILL;
  for (const mask of masks) {
    layerCtx.fillRect(mask.x * scale, mask.y * scale, mask.width * scale, mask.height * scale);
  }
  ctx.drawImage(layer, 0, 0);
}

/**
 * Best-effort locked preview of one document page (0-based index) with the
 * user's finished fields composited on top.
 *
 * Field coordinates are top-left origin viewport points at scale 1, the
 * same space the editor overlay uses. Both the editor canvas and this
 * renderer call pdf.js getViewport without a rotation override, so the
 * page's own /Rotate is applied identically in both places and field
 * placement matches the editor for 0/90/180/270 degree pages alike.
 * Any failure returns null and the gate keeps its loading placeholder.
 */
export async function renderGatePagePreview(
  pdfBytes: ArrayBuffer,
  fields: EditorField[],
  pageIndex: number
): Promise<string | null> {
  try {
    const pdfjs = await loadPdfjsClient();
    const pdf = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;
    if (pageIndex < 0 || pageIndex >= pdf.numPages) return null;

    const page = await pdf.getPage(pageIndex + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    if (!baseViewport.width || !baseViewport.height) return null;

    const scale = Math.min(2, GATE_PREVIEW_MAX_WIDTH / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    await page.render({
      canvasContext: ctx,
      viewport,
    } as Parameters<typeof page.render>[0]).promise;

    // Array order is z-order, same as the editor's Konva children.
    for (const field of fields) {
      if (field.page !== pageIndex) continue;
      try {
        await compositeField(ctx, field, scale, canvas.width, canvas.height);
      } catch {
        // Skip a field rather than lose the whole preview.
      }
    }

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
