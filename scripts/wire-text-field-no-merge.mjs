import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceRequired(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) {
    throw new Error(`Missing text no-merge anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function patchPdfViewer() {
  const path = "src/components/PdfViewer.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  const autoExpandBlock = `                onChange={(e) => {
                  const newValue = e.target.value;
                  onFieldUpdate(editField.id, { value: newValue } as Partial<EditorField>);

                  // Auto-expand field width if text overflows
                  const fontSize = ((editField as { fontSize?: number }).fontSize ?? 14) * effectiveScale;
                  const padding = (isEditSnapped ? 2 : 4) * 2;
                  // Measure text width using canvas
                  const canvas = document.createElement("canvas");
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    ctx.font = `${fontSize}px Arial, sans-serif`;
                    const textWidth = ctx.measureText(newValue).width + padding + 8;
                    const currentWidth = editField.width * effectiveScale;
                    if (textWidth > currentWidth) {
                      // Expand field to fit text, in PDF point space
                      onFieldUpdate(editField.id, {
                        value: newValue,
                        width: Math.ceil(textWidth / effectiveScale),
                      } as Partial<EditorField>);
                    }
                  }
                }}`;

  const fixedBlock = `                onChange={(e) => {
                  onFieldUpdate(editField.id, { value: e.target.value } as Partial<EditorField>);
                }}`;

  text = replaceRequired(text, autoExpandBlock, fixedBlock, "remove text auto-expand");
  writeIfChanged(path, text);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = normalize(readFileSync(path, "utf8"));

  const helperAnchor = `function drawMultilineText(page: PDFPage, text: string, x: number, startY: number, fontSize: number, activeFont: PDFFont) {
  const safeLine = sanitize(text);
  if (!safeLine) return;
  page.drawText(safeLine, { x, y: startY, size: fontSize, font: activeFont, color: rgb(0, 0, 0) });
}

async function drawSignatureImage`;

  const helperReplacement = `function drawMultilineText(page: PDFPage, text: string, x: number, startY: number, fontSize: number, activeFont: PDFFont) {
  const safeLine = sanitize(text);
  if (!safeLine) return;
  page.drawText(safeLine, { x, y: startY, size: fontSize, font: activeFont, color: rgb(0, 0, 0) });
}

function fitTextToField(activeFont: PDFFont, text: string, preferredSize: number, maxWidth: number) {
  const safeText = sanitize(text);
  const allowedWidth = Math.max(1, maxWidth);
  const minSize = 6;
  let fontSize = preferredSize;

  while (fontSize > minSize && activeFont.widthOfTextAtSize(safeText, fontSize) > allowedWidth) {
    fontSize -= 0.5;
  }

  if (activeFont.widthOfTextAtSize(safeText, fontSize) <= allowedWidth) {
    return { text: safeText, fontSize };
  }

  let clipped = safeText;
  while (clipped.length > 0 && activeFont.widthOfTextAtSize(clipped + "...", fontSize) > allowedWidth) {
    clipped = clipped.slice(0, -1);
  }

  return { text: clipped ? clipped + "..." : "", fontSize };
}

async function drawSignatureImage`;

  text = replaceRequired(text, helperAnchor, helperReplacement, "insert text fitting helper");

  const drawTextBlock = `    if (field.value) {
      const fontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;
      const activeFont = field.type === "signature" ? signatureFont : font;
      // Vertically center text in the field box (matching editor's verticalAlign: "middle")
      const textY = finalPdfY + (pdfH - fontSize) / 2;
      page.drawText(sanitize(field.value), {
        x: pdfX + 2,
        y: textY,
        size: fontSize,
        font: activeFont,
        color: rgb(0, 0, 0),
      });
    }`;

  const fittedDrawTextBlock = `    if (field.value) {
      const preferredFontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;
      const activeFont = field.type === "signature" ? signatureFont : font;
      const fitted = fitTextToField(activeFont, field.value, preferredFontSize, pdfW - 4);
      if (fitted.text) {
        // Vertically center text in the field box after fitting.
        const textY = finalPdfY + (pdfH - fitted.fontSize) / 2;
        page.drawText(fitted.text, {
          x: pdfX + 2,
          y: textY,
          size: fitted.fontSize,
          font: activeFont,
          color: rgb(0, 0, 0),
        });
      }
    }`;

  text = replaceRequired(text, drawTextBlock, fittedDrawTextBlock, "fit exported text to field");
  writeIfChanged(path, text);
}

patchPdfViewer();
patchFillPdfRoute();
