// PDFs are processed in memory only and never persisted to disk or database

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, degrees, PDFName } from "pdf-lib";
import type { EditorField } from "@/lib/types";
import { APP_CONFIG } from "@/lib/config";
import { applyBorderWatermark } from "@/lib/watermark";
import { checkRateLimit } from "@/lib/rate-limit";

/** Replace control characters (including newlines) with a space */
function sanitize(text: string): string {
  return text.replace(/[\x00-\x09\x0b-\x1f\x7f\n\r]/g, " ");
}

/** Check if a string has characters outside WinAnsi range */
function hasNonWinAnsi(text: string): boolean {
  return /[^\x00-\xff]/.test(text) || /[\x00-\x09\x0b-\x1f\x7f]/.test(text);
}

/** Decode a base64 data URL to raw bytes */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return new Uint8Array(0);
  const binary = Buffer.from(base64, "base64");
  return new Uint8Array(binary);
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const identifier = forwarded?.split(",")[0] || realIp || "anonymous";
    const { success, remaining } = await checkRateLimit(identifier);
    if (!success) {
      return NextResponse.json({ error: "Too many requests, try again in a minute" }, { status: 429 });
    }

    const formData = await request.formData();

    const pdfFile = formData.get("pdf") as File | null;
    if (!pdfFile) return NextResponse.json({ error: "Missing pdf file" }, { status: 400 });

    // Check file size limit (15MB max)
    const MAX_SIZE = 15 * 1024 * 1024; // 15MB in bytes
    if (pdfFile.size > MAX_SIZE) {
      return NextResponse.json({ error: "PDF too large (max 15MB)" }, { status: 413 });
    }

    const fieldsJson = formData.get("fields") as string | null;
    const pageScalesJson = formData.get("pageScales") as string | null;
    const viewportDimsJson = formData.get("viewportDims") as string | null;
    const hasAcroForm = formData.get("hasAcroForm") === "true";
    const isPro = formData.get("isPro") === "true";

    if (!fieldsJson || !pageScalesJson) {
      return NextResponse.json({ error: "Missing fields or pageScales" }, { status: 400 });
    }

    const editorFields: EditorField[] = JSON.parse(fieldsJson);
    const pageScaleEntries: [number, number][] = JSON.parse(pageScalesJson);
    const pageScales = new Map(pageScaleEntries);
    
    // Parse viewport dimensions if provided (for coordinate transformation)
    let viewportDims: Map<number, { width: number; height: number }> | null = null;
    if (viewportDimsJson) {
      try {
        const viewportEntries: [number, { width: number; height: number }][] = JSON.parse(viewportDimsJson);
        viewportDims = new Map(viewportEntries);
      } catch {
        viewportDims = null;
      }
    }

    const pdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const signatureFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    if (hasAcroForm) {
      const form = pdfDoc.getForm();

      // Sanitize all existing AcroForm text field values, prevents WinAnsi crash on flatten
      for (const af of form.getFields()) {
        if (af.constructor.name === "PDFTextField") {
          try {
            const tf = form.getTextField(af.getName());
            const raw = tf.getText() ?? "";
            if (raw) tf.setText(sanitize(raw));
          } catch { /* skip unreadable fields */ }
        }
      }

      // Set user-filled values
      for (const field of editorFields) {
        try {
          if (field.type === "whiteout") {
            // Whiteout fields are drawn directly on the page
            await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
          } else if (field.type === "signature" && field.signatureDataUrl) {
            const widget = findWidget(pdfDoc, form, field.id);
            if (widget) {
              const page = pdfDoc.getPages()[widget.pageIndex];
              if (page) await drawSignatureImage(pdfDoc, page, field.signatureDataUrl,
                widget.x, widget.y, widget.width, widget.height, field.value, signatureFont, 14);
            } else {
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
            }
          } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
            try {
              form.getTextField(field.id).setText(sanitize(field.value ?? ""));
            } catch {
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
            }
          } else if (field.type === "checkbox") {
            try {
              const cb = form.getCheckBox(field.id);
              if (field.checked) cb.check(); else cb.uncheck();
            } catch {
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
            }
          } else if (field.type === "comb") {
            // Comb fields are always user-placed, draw directly
            await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
          }
        } catch {
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
        }
      }

      // Try to flatten the form - if it fails (e.g., fields without valid /AP/N appearance dicts),
      // fall back to making fields read-only
      try {
        form.flatten({ updateFieldAppearances: false });
      } catch (flattenErr) {
        console.warn("form.flatten() failed, making fields read-only:", flattenErr instanceof Error ? flattenErr.message : flattenErr);
        // Layer 2: Set all remaining fields to read-only to prevent tampering
        for (const field of form.getFields()) {
          try {
            field.enableReadOnly();
          } catch {
            // Skip fields that cannot be made read-only
          }
        }
      }

      // Layer 3: Remove AcroForm dictionary entirely to make PDF completely static
      // This prevents any form interaction even if read-only fails
      try {
        pdfDoc.catalog.delete(PDFName.of("AcroForm"));
      } catch {
        // AcroForm removal not critical - read-only fields are still protected
      }
    } else {
      for (const field of editorFields) {
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont, viewportDims);
      }
    }

    // Apply border watermark for free/guest users (skip for Pro)
    const pages = pdfDoc.getPages();
    const watermarkFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    applyBorderWatermark(pages, watermarkFont, isPro);

    const resultBytes = await pdfDoc.save();
    return new NextResponse(Buffer.from(resultBytes), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("fill-pdf error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type PDFPage = ReturnType<PDFDocument["getPages"]>[number];
type PDFFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;
type PDFForm = ReturnType<PDFDocument["getForm"]>;

function findWidget(pdfDoc: PDFDocument, form: PDFForm, fieldName: string) {
  try {
    const af = form.getFields().find((f) => f.getName() === fieldName);
    if (!af) return null;
    const widgets = af.acroField.getWidgets();
    if (widgets.length === 0) return null;
    const widget = widgets[0];
    const rect = widget.getRectangle();
    const pageRef = widget.P();
    let pageIndex = 0;
    if (pageRef) {
      const pages = pdfDoc.getPages();
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].ref === pageRef) { pageIndex = i; break; }
      }
    }
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, pageIndex };
  } catch { return null; }
}

function drawMultilineText(page: PDFPage, text: string, x: number, startY: number, fontSize: number, activeFont: PDFFont) {
  const safeLine = sanitize(text);
  if (!safeLine) return;
  page.drawText(safeLine, { x, y: startY, size: fontSize, font: activeFont, color: rgb(0, 0, 0) });
}

async function drawSignatureImage(pdfDoc: PDFDocument, page: PDFPage, signatureDataUrl: string,
  pdfX: number, pdfY: number, pdfW: number, pdfH: number,
  fallbackText: string, signatureFont: PDFFont, fontSize: number) {
  try {
    const imgBytes = dataUrlToBytes(signatureDataUrl);
    if (imgBytes.length === 0) throw new Error("Empty signature data");
    const isJpeg = signatureDataUrl.startsWith("data:image/jpeg") || signatureDataUrl.startsWith("data:image/jpg");
    const img = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
    const imgDims = img.scale(1);
    const imgAspect = imgDims.width / imgDims.height;
    const fieldAspect = pdfW / pdfH;
    let drawW = pdfW - 4;
    let drawH = pdfH - 4;
    if (imgAspect > fieldAspect) { drawH = drawW / imgAspect; } else { drawW = drawH * imgAspect; }
    const drawX = pdfX + (pdfW - drawW) / 2;
    const drawY = pdfY + (pdfH - drawH) / 2;
    page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
  } catch {
    if (fallbackText) {
      page.drawText(sanitize(fallbackText), { x: pdfX + 2, y: pdfY + 4, size: fontSize, font: signatureFont, color: rgb(0, 0, 0) });
    }
  }
}

function drawCheckmark(page: PDFPage, pdfX: number, pdfY: number, pdfW: number, pdfH: number, stamp: string) {
  const cx = pdfX + pdfW / 2;
  const cy = pdfY + pdfH / 2;
  const r = Math.min(pdfW, pdfH) * 0.35;
  const lw = Math.max(1, r * 0.18);
  const dark = rgb(0.07, 0.09, 0.15);
  if (stamp === "tick") {
    page.drawLine({ start: { x: cx - r * 0.55, y: cy - r * 0.05 }, end: { x: cx - r * 0.1, y: cy - r * 0.5 }, thickness: lw, color: dark });
    page.drawLine({ start: { x: cx - r * 0.1, y: cy - r * 0.5 }, end: { x: cx + r * 0.6, y: cy + r * 0.5 }, thickness: lw, color: dark });
  } else if (stamp === "cross") {
    page.drawLine({ start: { x: cx - r * 0.6, y: cy - r * 0.6 }, end: { x: cx + r * 0.6, y: cy + r * 0.6 }, thickness: lw, color: dark });
    page.drawLine({ start: { x: cx + r * 0.6, y: cy - r * 0.6 }, end: { x: cx - r * 0.6, y: cy + r * 0.6 }, thickness: lw, color: dark });
  }
}

async function drawFieldOnPage(pdfDoc: PDFDocument, field: EditorField, _pageScales: Map<number, number>, font: PDFFont, signatureFont: PDFFont, viewportDims: Map<number, { width: number; height: number }> | null = null) {
  const page = pdfDoc.getPages()[field.page];
  if (!page) return;

  // Field coordinates are stored in pdf.js viewport-at-scale-1 space
  // For PDFs with content transforms (like IronPdf templates with 0.24 scale + Y-flip),
  // the viewport dimensions differ from the MediaBox dimensions.
  // We need to scale field coordinates to match the MediaBox coordinate system.
  
  let pdfX = field.x;
  let pdfY = field.y;
  let pdfW = field.width;
  let pdfH = field.height;

  // If viewport dimensions provided, compute scale factor to convert from viewport space to MediaBox space
  if (viewportDims && viewportDims.has(field.page)) {
    const viewport = viewportDims.get(field.page)!;
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    
    // Compute scale factors (for simple PDFs without transforms, these will be 1.0)
    const scaleX = pageWidth / viewport.width;
    const scaleY = pageHeight / viewport.height;
    
    // Apply scale to field coordinates
    pdfX = field.x * scaleX;
    pdfY = field.y * scaleY;
    pdfW = field.width * scaleX;
    pdfH = field.height * scaleY;
  }

  // Flip Y axis (PDF origin is bottom-left, viewport origin is top-left)
  const finalPdfY = page.getHeight() - pdfY - pdfH;

  // Debug logging for coordinate calculation
  console.log(`[drawFieldOnPage] field.id=${field.id} field.x=${field.x} field.y=${field.y} pdfX=${pdfX} pdfY=${finalPdfY} pageHeight=${page.getHeight()}`);

  if (field.type === "whiteout") {
    // Draw a filled rectangle with the sampled background color
    const whiteoutField = field as import("@/lib/types").WhiteoutField;
    // Parse hex color to RGB (0-1 range for pdf-lib)
    let r = 1, g = 1, b = 1;
    const hex = whiteoutField.fillColor.replace("#", "");
    if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    }
    page.drawRectangle({
      x: pdfX,
      y: finalPdfY,
      width: pdfW,
      height: pdfH,
      color: rgb(r, g, b),
    });
  } else if (field.type === "signature" && field.signatureDataUrl) {
    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, finalPdfY, pdfW, pdfH, field.value, signatureFont, field.fontSize ?? 16);
  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
    if (field.value) {
      const fontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;
      const activeFont = field.type === "signature" ? signatureFont : font;
      drawMultilineText(page, field.value, pdfX + 2, finalPdfY + pdfH - fontSize - 2, fontSize, activeFont);
    }
  } else if (field.type === "checkbox" && field.checked) {
    const stamp = (field as { stamp?: string }).stamp ?? "tick";
    drawCheckmark(page, pdfX, finalPdfY, pdfW, pdfH, stamp);
  } else if (field.type === "comb") {
    const combField = field as import("@/lib/types").CombField;
    const value = combField.value ?? "";
    if (!value) return;

    const fontSize = (combField as unknown as { fontSize?: number }).fontSize ?? 14;
    const charCount = combField.charCount || 1;
    // Coordinates are already in PDF points - no scaling needed
    const offsetX = combField.offsetX ?? 0;
    const charOffsetX = combField.charOffsetX ?? 0;

    // Calculate starting position with offset
    const startX = pdfX + offsetX;

    // Use non-uniform cell positions/widths if available, otherwise uniform spacing
    const cellPositions = combField.cellPositions;
    const cellWidths = combField.cellWidths;
    const uniformCellWidth = combField.cellWidth ?? (field.width * (viewportDims && viewportDims.has(field.page) ? (page.getWidth() / viewportDims.get(field.page)!.width) : 1));

    // Draw each character centered in its cell
    for (let i = 0; i < value.length && i < charCount; i++) {
      const char = value[i];
      // Skip space characters (gaps between groups)
      if (char === " ") continue;

      let cellCenterX: number;
      let cellW: number;

      if (cellPositions && cellPositions[i] !== undefined) {
        // Non-uniform: cellPositions are relative to field X (already scaled to PDF points)
        cellCenterX = startX + cellPositions[i] * (viewportDims && viewportDims.has(field.page) ? (page.getWidth() / viewportDims.get(field.page)!.width) : 1);
        cellW = (cellWidths && cellWidths[i] !== undefined) ? cellWidths[i] * (viewportDims && viewportDims.has(field.page) ? (page.getWidth() / viewportDims.get(field.page)!.width) : 1) : uniformCellWidth;
      } else {
        // Uniform spacing
        cellW = uniformCellWidth;
        cellCenterX = startX + (i + 0.5) * cellW;
      }

      // Measure character width for centering
      const charWidth = font.widthOfTextAtSize(char, fontSize);
      const charX = cellCenterX - charWidth / 2 + charOffsetX * (viewportDims && viewportDims.has(field.page) ? (page.getWidth() / viewportDims.get(field.page)!.width) : 1);

      // Vertically center the character
      const charY = finalPdfY + (pdfH - fontSize) / 2;

      page.drawText(char, {
        x: charX,
        y: charY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
  }
}
