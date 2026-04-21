export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import type { EditorField } from "@/lib/types";
import { APP_CONFIG } from "@/lib/config";
import { applyBorderWatermark } from "@/lib/watermark";

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
    const formData = await request.formData();

    const pdfFile = formData.get("pdf") as File | null;
    if (!pdfFile) return NextResponse.json({ error: "Missing pdf file" }, { status: 400 });

    const fieldsJson = formData.get("fields") as string | null;
    const pageScalesJson = formData.get("pageScales") as string | null;
    const hasAcroForm = formData.get("hasAcroForm") === "true";
    const isPro = formData.get("isPro") === "true";

    if (!fieldsJson || !pageScalesJson) {
      return NextResponse.json({ error: "Missing fields or pageScales" }, { status: 400 });
    }

    const editorFields: EditorField[] = JSON.parse(fieldsJson);
    const pageScaleEntries: [number, number][] = JSON.parse(pageScalesJson);
    const pageScales = new Map(pageScaleEntries);

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
            await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
          } else if (field.type === "signature" && field.signatureDataUrl) {
            const widget = findWidget(pdfDoc, form, field.id);
            if (widget) {
              const page = pdfDoc.getPages()[widget.pageIndex];
              if (page) await drawSignatureImage(pdfDoc, page, field.signatureDataUrl,
                widget.x, widget.y, widget.width, widget.height, field.value, signatureFont, 14);
            } else {
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
            }
          } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
            try {
              form.getTextField(field.id).setText(sanitize(field.value ?? ""));
            } catch {
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
            }
          } else if (field.type === "checkbox") {
            try {
              const cb = form.getCheckBox(field.id);
              if (field.checked) cb.check(); else cb.uncheck();
            } catch {
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
            }
          }
        } catch {
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        }
      }

      // Try to flatten the form - if it fails (e.g., fields without valid /AP/N appearance dicts),
      // skip flattening. The PDF will still have drawn fields, just with editable form fields remaining.
      try {
        form.flatten({ updateFieldAppearances: false });
      } catch (flattenErr) {
        console.warn("form.flatten() failed, skipping flatten:", flattenErr instanceof Error ? flattenErr.message : flattenErr);
        // PDF is still valid with form fields intact - user values are already set
      }
    } else {
      for (const field of editorFields) {
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
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

async function drawFieldOnPage(pdfDoc: PDFDocument, field: EditorField, pageScales: Map<number, number>, font: PDFFont, signatureFont: PDFFont) {
  const page = pdfDoc.getPages()[field.page];
  if (!page) return;
  const scale = pageScales.get(field.page) ?? 1;
  const pdfX = field.x / scale;
  const pdfY = page.getHeight() - field.y / scale - field.height / scale;
  const pdfW = field.width / scale;
  const pdfH = field.height / scale;
  
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
      y: pdfY,
      width: pdfW,
      height: pdfH,
      color: rgb(r, g, b),
    });
  } else if (field.type === "signature" && field.signatureDataUrl) {
    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, pdfY, pdfW, pdfH, field.value, signatureFont, (field.fontSize ?? 16) / scale);
  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
    if (field.value) {
      const fontSize = (field.type === "signature" ? 16 : field.fontSize ?? 14) / scale;
      const activeFont = field.type === "signature" ? signatureFont : font;
      drawMultilineText(page, field.value, pdfX + 2, pdfY + pdfH - fontSize - 2, fontSize, activeFont);
    }
  } else if (field.type === "checkbox" && field.checked) {
    const stamp = (field as { stamp?: string }).stamp ?? "tick";
    drawCheckmark(page, pdfX, pdfY, pdfW, pdfH, stamp);
  }
}
