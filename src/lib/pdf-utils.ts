import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { EditorField } from "./types";
import { APP_CONFIG } from "./config";

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
  const signatureFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  if (hasAcroForm) {
    const form = pdfDoc.getForm();
    for (const field of editorFields) {
      try {
        if (field.type === "signature" && field.signatureDataUrl) {
          // Always draw signature images directly (not via AcroForm)
          await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
        } else if (field.type === "text" || field.type === "date" || field.type === "signature") {
          const tf = form.getTextField(field.id);
          // Sanitize: replace newlines + control chars — WinAnsi can't encode them
          const safeValue = (field.value ?? "").replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ").replace(/\n/g, " ");
          tf.setText(safeValue);
        } else if (field.type === "checkbox") {
          const cb = form.getCheckBox(field.id);
          if (field.checked) cb.check();
          else cb.uncheck();
        }
      } catch {
        // Field doesn't exist in AcroForm  -  draw it directly
        await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
      }
    }
    // NOTE: form.flatten() is intentionally skipped.
    // pdf-lib re-encodes all field appearance streams through WinAnsi during flatten,
    // which crashes on any field containing newlines or non-Latin characters.
    // Skipping flatten leaves the form interactive (fields remain editable after download)
    // which is acceptable — values are set and the PDF downloads cleanly.
    // True flattening requires a server-side renderer (future improvement).
  } else {
    for (const field of editorFields) {
      await drawFieldOnPage(pdfDoc, field, pageScales, font, signatureFont);
    }
  }

  // Add watermark for free-tier users
  if (addWatermark) {
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const { width } = page.getSize();
      const text = `Filled with QuickFill - ${APP_CONFIG.domain}`;
      const textWidth = font.widthOfTextAtSize(text, 8);
      page.drawText(text, {
        x: width - textWidth - 12,
        y: 10,
        size: 8,
        font,
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
    // Embed signature as PNG image
    try {
      const imgBytes = dataUrlToBytes(field.signatureDataUrl);
      if (imgBytes.length === 0) throw new Error("Empty signature data");
      const isJpeg = field.signatureDataUrl.startsWith("data:image/jpeg") || field.signatureDataUrl.startsWith("data:image/jpg");
      const imgImage = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
      const pngImage = imgImage;
      const imgDims = pngImage.scale(1);
      // Fit image within field bounds while maintaining aspect ratio
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
      page.drawImage(pngImage, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });
    } catch {
      // Fall back to text if image embedding fails
      if (field.value) {
        const safeValue = field.value.replace(/[\x00-\x1f\x7f]/g, " ");
        page.drawText(safeValue, {
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
      // Split on newlines and draw each line — pdf-lib can't handle \n in drawText
      const lines = field.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      const lineHeight = fontSize * 1.2;
      // Draw from top of field downward
      const startY = pdfY + pdfH - fontSize - 2;
      lines.forEach((line, i) => {
        // Strip any remaining control characters
        const safeLine = line.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "");
        if (!safeLine) return;
        page.drawText(safeLine, {
          x: pdfX + 2,
          y: startY - i * lineHeight,
          size: fontSize,
          font: activeFont,
          color: rgb(0, 0, 0),
        });
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
      // Checkmark: two lines forming a tick — bottom-left pivot, up-right arm
      page.drawLine({ start: { x: cx - r * 0.55, y: cy - r * 0.05 }, end: { x: cx - r * 0.1, y: cy - r * 0.5 }, thickness: lw, color: dark });
      page.drawLine({ start: { x: cx - r * 0.1, y: cy - r * 0.5 }, end: { x: cx + r * 0.6, y: cy + r * 0.5 }, thickness: lw, color: dark });
    } else if (stamp === "cross") {
      // X: two diagonal lines
      page.drawLine({ start: { x: cx - r * 0.6, y: cy - r * 0.6 }, end: { x: cx + r * 0.6, y: cy + r * 0.6 }, thickness: lw, color: dark });
      page.drawLine({ start: { x: cx + r * 0.6, y: cy - r * 0.6 }, end: { x: cx - r * 0.6, y: cy + r * 0.6 }, thickness: lw, color: dark });
    }
    // stamp === "none": leave blank (unchecked visual)
  }
}
