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
          tf.setText(field.value);
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
    try {
      form.flatten();
    } catch {
      /* some forms can't be flattened */
    }
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
      const pngBytes = dataUrlToBytes(field.signatureDataUrl);
      if (pngBytes.length === 0) throw new Error("Empty signature data");
      const pngImage = await pdfDoc.embedPng(pngBytes);
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
        page.drawText(field.value, {
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
      page.drawText(field.value, {
        x: pdfX + 2,
        y: pdfY + 4,
        size: fontSize,
        font: activeFont,
        color: rgb(0, 0, 0),
      });
    }
  } else if (field.type === "checkbox" && field.checked) {
    const stamp = (field as { stamp?: string }).stamp ?? "tick";
    const mark = stamp === "cross" ? "\u2715" : "\u2713";
    const size = Math.min(field.width, field.height) / scale;
    page.drawText(mark, {
      x: pdfX + (pdfW - size * 0.6) / 2,
      y: pdfY + (pdfH - size * 0.8) / 2,
      size: size * 0.85,
      font,
      color: rgb(0.07, 0.09, 0.15),
    });
  }
}
