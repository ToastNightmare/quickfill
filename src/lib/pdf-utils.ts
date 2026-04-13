import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { EditorField } from "./types";
import { APP_CONFIG } from "./config";

/** Replace control characters (including newlines) with a space, keeps text WinAnsi-safe */
function sanitize(text: string): string {
  return text.replace(/[\x00-\x09\x0b-\x1f\x7f\n\r]/g, " ");
}

/**
 * Load a PDF and detect AcroForm fields with their positions.
 */
export async function detectAcroFormFields(pdfBytes: ArrayBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const result: {
    name: string;
    type: "text" | "checkbox";
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    value: string;
  }[] = [];

  for (const field of fields) {
    const widgets = field.acroField.getWidgets();
    for (const widget of widgets) {
      const rect = widget.getRectangle();
      const pageRef = widget.P();
      let pageIndex = 0;

      if (pageRef) {
        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].ref === pageRef) {
            pageIndex = i;
            break;
          }
        }
      }

      const page = pdfDoc.getPages()[pageIndex];
      const pageHeight = page.getHeight();

      const fieldType = field.constructor.name;
      let type: "text" | "checkbox" = "text";
      let value = "";

      if (fieldType === "PDFCheckBox") {
        type = "checkbox";
      } else if (fieldType === "PDFTextField") {
        type = "text";
        try {
          const tf = form.getTextField(field.getName());
          value = tf.getText() ?? "";
        } catch {
          /* empty */
        }
      }

      result.push({
        name: field.getName(),
        type,
        x: rect.x,
        y: pageHeight - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
        page: pageIndex,
        value,
      });
    }
  }

  return result;
}

/**
 * Fill a PDF with user-placed fields and return the modified PDF bytes.
 * If addWatermark is true, adds a small footer watermark to each page.
 */
export async function fillPdf(
  originalPdfBytes: ArrayBuffer,
  editorFields: EditorField[],
  pageScales: Map<number, number>,
  hasAcroForm: boolean,
  addWatermark = false
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes, {
    ignoreEncryption: true,
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const signatureFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const watermarkFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  if (hasAcroForm) {
    const form = pdfDoc.getForm();

    // Sanitize ALL existing field values so WinAnsi never sees control chars
    for (const af of form.getFields()) {
      if (af.constructor.name === "PDFTextField") {
        try {
          const tf = form.getTextField(af.getName());
          const existing = tf.getText() ?? "";
          if (existing) tf.setText(sanitize(existing));
        } catch { /* skip */ }
      }
    }

    // Set user-filled values (also sanitized)
    for (const field of editorFields) {
      try {
        if (field.type === "signature" && field.signatureDataUrl) {
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
          try {
            const tf = form.getTextField(field.id);
            tf.setText(sanitize(field.value ?? ""));
          } catch {
            await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
          }
        } else if (field.type === "checkbox") {
          try {
            const cb = form.getCheckBox(field.id);
            if (field.checked) cb.check();
            else cb.uncheck();
          } catch {
            await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
          }
        } else if (field.type === "grid") {
          // Grid fields always draw on page (not AcroForm)
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        }
      } catch {
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
      }
    }

    // Flatten, works because all values are now WinAnsi-safe
    form.flatten();
  } else {
    for (const field of editorFields) {
      await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
    }
  }

  if (addWatermark) {
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const { width } = page.getSize();
      const text = `Filled with QuickFill - ${APP_CONFIG.domain}`;
      const textWidth = watermarkFont.widthOfTextAtSize(text, 8);
      page.drawText(text, {
        x: width - textWidth - 12,
        y: 10,
        size: 8,
        font: watermarkFont,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
  }

  return pdfDoc.save();
}

/** Decode a base64 data URL to raw bytes */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function drawFieldOnPage(
  pdfDoc: PDFDocument,
  field: EditorField,
  pageScales: Map<number, number>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  signatureFont: Awaited<ReturnType<PDFDocument["embedFont"]>>
) {
  const page = pdfDoc.getPages()[field.page];
  if (!page) return;

  const scale = pageScales.get(field.page) ?? 1;
  const pdfX = field.x / scale;
  const pdfY = page.getHeight() - field.y / scale - field.height / scale;
  const pdfW = field.width / scale;
  const pdfH = field.height / scale;

  if (field.type === "signature" && field.signatureDataUrl) {
    try {
      const imgBytes = dataUrlToBytes(field.signatureDataUrl);
      if (imgBytes.length === 0) throw new Error("Empty signature data");
      const isJpeg = field.signatureDataUrl.startsWith("data:image/jpeg") || field.signatureDataUrl.startsWith("data:image/jpg");
      const img = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
      const imgDims = img.scale(1);
      const imgAspect = imgDims.width / imgDims.height;
      const fieldAspect = pdfW / pdfH;
      let drawW = pdfW - 4;
      let drawH = pdfH - 4;
      if (imgAspect > fieldAspect) {
        drawH = drawW / imgAspect;
      } else {
        drawW = drawH * imgAspect;
      }
      const drawX = pdfX + (pdfW - drawW) / 2;
      const drawY = pdfY + (pdfH - drawH) / 2;
      page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
    } catch {
      if (field.value) {
        page.drawText(sanitize(field.value), {
          x: pdfX + 2,
          y: pdfY + 4,
          size: (field.fontSize ?? 16) / scale,
          font: signatureFont,
          color: rgb(0, 0, 0),
        });
      }
    }
  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
    if (field.value) {
      const fontSize = (field.type === "signature" ? 16 : field.fontSize ?? 14) / scale;
      const activeFont = field.type === "signature" ? signatureFont : font;
      page.drawText(sanitize(field.value), {
        x: pdfX + 2,
        y: pdfY + pdfH - fontSize - 2,
        size: fontSize,
        font: activeFont,
        color: rgb(0, 0, 0),
      });
    }
  } else if (field.type === "checkbox" && field.checked) {
    const stamp = (field as { stamp?: string }).stamp ?? "tick";
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
  } else if (field.type === "grid") {
    // Grid field: render each character in its own slot
    const gridField = field as import("./types").GridField;
    const charCount = gridField.charCount ?? 11;
    const slotWidth = pdfW / charCount;
    const fontSize = pdfH * 0.6 / scale;
    const value = gridField.value || "";

    for (let i = 0; i < charCount; i++) {
      const char = value[i] || "";
      if (char) {
        const charX = pdfX + i * slotWidth + slotWidth * 0.1;
        const charY = pdfY + pdfH - fontSize - 2;
        page.drawText(sanitize(char), {
          x: charX,
          y: charY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }
}
