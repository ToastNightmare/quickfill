import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceOptional(text, search, replacement) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) return text;
  return text.replace(search, replacement);
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

  // Earlier mobile reliability patches may already remove this auto-grow block.
  // When it is still present, remove it so text fields do not expand into neighbours.
  const autoExpandPattern = /                onChange=\{\(e\) => \{\n                  const newValue = e\.target\.value;\n                  onFieldUpdate\(editField\.id, \{ value: newValue \} as Partial<EditorField>\);\n\n                  \/\/ Auto-expand field width if text overflows[\s\S]*?                \}\}/;
  const fixedBlock = [
    "                onChange={(e) => {",
    "                  onFieldUpdate(editField.id, { value: e.target.value } as Partial<EditorField>);",
    "                }}",
  ].join("\n");

  if (!text.includes(fixedBlock)) {
    text = text.replace(autoExpandPattern, fixedBlock);
  }

  writeIfChanged(path, text);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = normalize(readFileSync(path, "utf8"));

  const routeHelperAnchor = `function fitTextFontSize(activeFont: PDFFont, text: string, maxWidth: number, requestedFontSize: number) {
  const minFontSize = 4;
  const safeWidth = Math.max(4, maxWidth);
  let size = Math.max(minFontSize, requestedFontSize);
  while (size > minFontSize && activeFont.widthOfTextAtSize(text, size) > safeWidth) {
    size -= 0.5;
  }
  return Math.max(minFontSize, Number(size.toFixed(2)));
}`;

  const routeHelperReplacement = `function fitTextFontSize(activeFont: PDFFont, text: string, maxWidth: number, requestedFontSize: number) {
  const minFontSize = 4;
  const safeWidth = Math.max(4, maxWidth);
  let size = Math.max(minFontSize, requestedFontSize);
  while (size > minFontSize && activeFont.widthOfTextAtSize(text, size) > safeWidth) {
    size -= 0.5;
  }
  return Math.max(minFontSize, Number(size.toFixed(2)));
}

function fitTextToField(activeFont: PDFFont, text: string, maxWidth: number, requestedFontSize: number) {
  const safeText = sanitize(text);
  const fontSize = fitTextFontSize(activeFont, safeText, maxWidth, requestedFontSize);
  if (activeFont.widthOfTextAtSize(safeText, fontSize) <= Math.max(4, maxWidth)) {
    return { text: safeText, fontSize };
  }

  let clipped = safeText;
  while (clipped.length > 0 && activeFont.widthOfTextAtSize(clipped + "...", fontSize) > Math.max(4, maxWidth)) {
    clipped = clipped.slice(0, -1);
  }
  return { text: clipped ? clipped + "..." : "", fontSize };
}`;

  text = replaceOptional(text, routeHelperAnchor, routeHelperReplacement);

  const routeDrawAnchor = `      const fontSize = fitTextFontSize(activeFont, safeValue, pdfW - 4, requestedFontSize);
      // Vertically center text in the field box (matching editor's verticalAlign: "middle")
      const textY = finalPdfY + (pdfH - fontSize) / 2;
      page.drawText(safeValue, {
        x: pdfX + 2,
        y: textY,
        size: fontSize,`;

  const routeDrawReplacement = `      const fittedText = fitTextToField(activeFont, safeValue, pdfW - 4, requestedFontSize);
      const fontSize = fittedText.fontSize;
      // Vertically center text in the field box (matching editor's verticalAlign: "middle")
      const textY = finalPdfY + (pdfH - fontSize) / 2;
      page.drawText(fittedText.text, {
        x: pdfX + 2,
        y: textY,
        size: fontSize,`;

  text = replaceRequired(text, routeDrawAnchor, routeDrawReplacement, "clip exported text to field");
  writeIfChanged(path, text);
}

function patchPdfUtils() {
  const path = "src/lib/pdf-utils.ts";
  let text = normalize(readFileSync(path, "utf8"));

  const helperAnchor = `function fitTextFontSize(
  activeFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  maxWidth: number,
  requestedFontSize: number
) {
  const minFontSize = 4;
  const safeWidth = Math.max(4, maxWidth);
  let size = Math.max(minFontSize, requestedFontSize);
  while (size > minFontSize && activeFont.widthOfTextAtSize(text, size) > safeWidth) {
    size -= 0.5;
  }
  return Math.max(minFontSize, Number(size.toFixed(2)));
}`;

  const helperReplacement = `function fitTextFontSize(
  activeFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  maxWidth: number,
  requestedFontSize: number
) {
  const minFontSize = 4;
  const safeWidth = Math.max(4, maxWidth);
  let size = Math.max(minFontSize, requestedFontSize);
  while (size > minFontSize && activeFont.widthOfTextAtSize(text, size) > safeWidth) {
    size -= 0.5;
  }
  return Math.max(minFontSize, Number(size.toFixed(2)));
}

function fitTextToField(
  activeFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  maxWidth: number,
  requestedFontSize: number
) {
  const safeText = sanitize(text);
  const fontSize = fitTextFontSize(activeFont, safeText, maxWidth, requestedFontSize);
  if (activeFont.widthOfTextAtSize(safeText, fontSize) <= Math.max(4, maxWidth)) {
    return { text: safeText, fontSize };
  }

  let clipped = safeText;
  while (clipped.length > 0 && activeFont.widthOfTextAtSize(clipped + "...", fontSize) > Math.max(4, maxWidth)) {
    clipped = clipped.slice(0, -1);
  }
  return { text: clipped ? clipped + "..." : "", fontSize };
}`;

  text = replaceOptional(text, helperAnchor, helperReplacement);

  const drawAnchor = `      const fontSize = fitTextFontSize(activeFont, safeValue, pdfW - 4, requestedFontSize);
      page.drawText(safeValue, {
        x: pdfX + 2,
        y: pdfY + pdfH - fontSize - 2,
        size: fontSize,`;

  const drawReplacement = `      const fittedText = fitTextToField(activeFont, safeValue, pdfW - 4, requestedFontSize);
      const fontSize = fittedText.fontSize;
      page.drawText(fittedText.text, {
        x: pdfX + 2,
        y: pdfY + pdfH - fontSize - 2,
        size: fontSize,`;

  text = replaceOptional(text, drawAnchor, drawReplacement);
  writeIfChanged(path, text);
}

patchPdfViewer();
patchFillPdfRoute();
patchPdfUtils();
