export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { EditorField } from "@/lib/types";
import { APP_CONFIG } from "@/lib/config";

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
  const rid = Math.random().toString(36).slice(2, 8).toUpperCase();
  const log = (...args: unknown[]) => console.log(`[fill-pdf:${rid}]`, ...args);

  try {
    log("ENTRY");
    const formData = await request.formData();

    const pdfFile = formData.get("pdf") as File | null;
    if (!pdfFile) return NextResponse.json({ error: "Missing pdf file" }, { status: 400 });

    const fieldsJson = formData.get("fields") as string | null;
    const pageScalesJson = formData.get("pageScales") as string | null;
    const hasAcroForm = formData.get("hasAcroForm") === "true";
    const addWatermark = formData.get("addWatermark") === "true";

    if (!fieldsJson || !pageScalesJson) {
      return NextResponse.json({ error: "Missing fields or pageScales" }, { status: 400 });
    }

    log("hasAcroForm:", hasAcroForm, "pdfSize:", pdfFile.size);

    const editorFields: EditorField[] = JSON.parse(fieldsJson);
    const pageScaleEntries: [number, number][] = JSON.parse(pageScalesJson);
    const pageScales = new Map(pageScaleEntries);

    const pdfBytes = await pdfFile.arrayBuffer();

    log("PHASE: PDF load");
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    log("PDF loaded, pages:", pdfDoc.getPageCount());

    log("PHASE: embed fonts");
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const signatureFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    log("fonts embedded");

    if (hasAcroForm) {
      const form = pdfDoc.getForm();
      const acroFields = form.getFields();
      log("PHASE: field enumeration, count:", acroFields.length);

      // Step 1: Sanitize ALL existing field values
      for (const af of acroFields) {
        const fieldType = af.constructor.name;
        const name = af.getName();
        if (fieldType === "PDFTextField") {
          try {
            const tf = form.getTextField(name);
            const raw = tf.getText() ?? "";
            const safe = sanitize(raw);
            const hadBad = hasNonWinAnsi(raw);
            log(`FIELD existing | name="${name}" rawLen=${raw.length} safeLen=${safe.length} hadBadChars=${hadBad} rawHex=${Buffer.from(raw).toString("hex").slice(0, 40)}`);
            if (raw) tf.setText(safe);
            log(`FIELD setText done | name="${name}"`);
          } catch (e) {
            log(`FIELD existing FAILED | name="${name}" err=${e instanceof Error ? e.message : e}`);
          }
        } else {
          log(`FIELD skip non-text | name="${name}" type=${fieldType}`);
        }
      }

      // Step 2: Set user-filled values
      log("PHASE: user field values, count:", editorFields.length);
      for (const field of editorFields) {
        try {
          if (field.type === "signature" && field.signatureDataUrl) {
            log(`USER FIELD signature | id="${field.id}"`);
            const widget = findWidget(pdfDoc, form, field.id);
            if (widget) {
              const page = pdfDoc.getPages()[widget.pageIndex];
              if (page) {
                await drawSignatureImage(pdfDoc, page, field.signatureDataUrl,
                  widget.x, widget.y, widget.width, widget.height,
                  field.value, signatureFont, 14);
              }
            } else {
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
            }
          } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
            const raw = field.value ?? "";
            const safe = sanitize(raw);
            log(`USER FIELD text | id="${field.id}" rawLen=${raw.length} safeLen=${safe.length} hadBadChars=${hasNonWinAnsi(raw)}`);
            try {
              const tf = form.getTextField(field.id);
              tf.setText(safe);
              log(`USER FIELD setText done | id="${field.id}"`);
            } catch {
              log(`USER FIELD not in AcroForm, drawing directly | id="${field.id}"`);
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
            }
          } else if (field.type === "checkbox") {
            log(`USER FIELD checkbox | id="${field.id}" checked=${field.checked}`);
            try {
              const cb = form.getCheckBox(field.id);
              if (field.checked) cb.check(); else cb.uncheck();
            } catch {
              await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
            }
          }
        } catch (e) {
          log(`USER FIELD error | id="${field.id}" err=${e instanceof Error ? e.message : e}`);
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        }
      }

      log("PHASE: before flatten");
      try {
        form.flatten({ updateFieldAppearances: false });
        log("PHASE: flatten done");
      } catch (e) {
        log("PHASE: flatten THREW:", e instanceof Error ? e.message : e);
        throw e;
      }
    } else {
      log("PHASE: non-AcroForm draw");
      for (const field of editorFields) {
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
      }
    }

    if (addWatermark) {
      log("PHASE: watermark");
      const watermarkFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        const { width } = page.getSize();
        const text = `Filled with QuickFill - ${APP_CONFIG.domain.trim()}`;
        const textWidth = watermarkFont.widthOfTextAtSize(text, 8);
        page.drawText(text, { x: width - textWidth - 12, y: 10, size: 8, font: watermarkFont, color: rgb(0.6, 0.6, 0.6) });
      }
    }

    log("PHASE: before save");
    let resultBytes: Uint8Array;
    try {
      resultBytes = await pdfDoc.save();
      log("PHASE: save done, size:", resultBytes.length);
    } catch (e) {
      log("PHASE: save THREW:", e instanceof Error ? e.message : e);
      throw e;
    }

    return new NextResponse(Buffer.from(resultBytes), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("ERROR:", message);
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
  if (field.type === "signature" && field.signatureDataUrl) {
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
