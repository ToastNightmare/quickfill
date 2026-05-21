import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) {
    throw new Error(`Missing mobile editor reliability anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function replacePattern(text, pattern, replacement, label) {
  if (text.includes(replacement)) return text;
  const next = text.replace(pattern, replacement);
  if (next === text) {
    throw new Error(`Missing mobile editor reliability anchor (${label})`);
  }
  return next;
}

function patchEditorPage() {
  const path = "src/app/editor/page.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `      // Build FormData and send to server-side fill API\n      const fd = new FormData();\n      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");\n      fd.append("fields", JSON.stringify(fields));\n      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));`,
    `      // Build FormData and send to server-side fill API\n      const fieldsForDownload = fields.map((field) => {\n        if (field.type !== "signature") return field;\n        const signatureField = field as EditorField & { signatureDataUrl?: string; value?: string };\n        const signatureDataUrl = signatureField.signatureDataUrl || savedSignature || undefined;\n        return { ...signatureField, value: "", signatureDataUrl } as EditorField;\n      });\n\n      const fd = new FormData();\n      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");\n      fd.append("fields", JSON.stringify(fieldsForDownload));\n      if (savedSignature) fd.append("savedSignatureDataUrl", savedSignature);\n      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));`,
    "download signature payload",
  );

  text = replaceOnce(
    text,
    `  }, [pdfBytes, fields, pageScales, hasAcroForm, fileName, totalPages, showToast]);`,
    `  }, [pdfBytes, fields, savedSignature, pageScales, hasAcroForm, fileName, totalPages, showToast]);`,
    "download saved signature dependency",
  );

  writeIfChanged(path, text);
}

function patchPdfViewer() {
  const path = "src/components/PdfViewer.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replacePattern(
    text,
    /                onChange=\{\(e\) => \{\n                  const newValue = e\.target\.value;\n                  onFieldUpdate\(editField\.id, \{ value: newValue \} as Partial<EditorField>\);\n\n                  \/\/ Auto-expand field width if text overflows[\s\S]*?                \}\}/,
    `                onChange={(e) => {\n                  const newValue = e.target.value;\n                  onFieldUpdate(editField.id, { value: newValue } as Partial<EditorField>);\n                }}`,
    "mobile text field fixed width",
  );

  writeIfChanged(path, text);
}

function patchContextPanel() {
  const path = "src/components/ContextPanel.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `import { useState, type ReactNode } from "react";`,
    `import { useEffect, useState, type ReactNode } from "react";`,
    "useEffect import",
  );

  text = replaceOnce(
    text,
    `  const TypeIcon = fieldIcon(selectedField.type);\n  const nudgeField = (dx: number, dy: number) => {\n    onFieldUpdate(selectedField.id, {\n      x: Math.max(0, selectedField.x + dx),\n      y: Math.max(0, selectedField.y + dy),\n    } as Partial<EditorField>);\n  };\n\n  return (`,
    `  const TypeIcon = fieldIcon(selectedField.type);\n  const [isExpanded, setIsExpanded] = useState(false);\n\n  useEffect(() => {\n    setIsExpanded(false);\n  }, [selectedField.id]);\n\n  const nudgeField = (dx: number, dy: number) => {\n    onFieldUpdate(selectedField.id, {\n      x: Math.max(0, selectedField.x + dx),\n      y: Math.max(0, selectedField.y + dy),\n    } as Partial<EditorField>);\n  };\n\n  if (!isExpanded) {\n    return (\n      <div className="fixed bottom-[8.25rem] left-3 right-3 z-30 rounded-2xl border border-border bg-surface shadow-xl sm:hidden">\n        <div className="flex items-center justify-between gap-3 px-4 py-3">\n          <div className={"flex min-w-0 items-center gap-2 " + fieldColor(selectedField.type)}>\n            <TypeIcon className="h-4 w-4 shrink-0" />\n            <p className="truncate text-sm font-bold text-text">{fieldLabel(selectedField.type)} selected</p>\n          </div>\n          <div className="flex shrink-0 items-center gap-2">\n            <button\n              onClick={() => setIsExpanded(true)}\n              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-alt hover:text-text"\n            >\n              Options\n            </button>\n            <button\n              onClick={onFieldDeselect}\n              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-alt hover:text-text"\n            >\n              Done\n            </button>\n          </div>\n        </div>\n      </div>\n    );\n  }\n\n  return (`,
    "collapsed mobile field sheet",
  );

  writeIfChanged(path, text);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `    const hasAcroForm = formData.get("hasAcroForm") === "true";\n    hasAcroFormForLog = hasAcroForm;`,
    `    const hasAcroForm = formData.get("hasAcroForm") === "true";\n    const savedSignatureDataUrl = formData.get("savedSignatureDataUrl") as string | null;\n    hasAcroFormForLog = hasAcroForm;`,
    "saved signature form data",
  );

  text = replaceOnce(
    text,
    `function dataUrlToBytes(dataUrl: string): Uint8Array {\n  const base64 = dataUrl.split(",")[1];\n  if (!base64) return new Uint8Array(0);\n  const binary = Buffer.from(base64, "base64");\n  return new Uint8Array(binary);\n}\n\nexport async function POST(request: NextRequest) {`,
    `function dataUrlToBytes(dataUrl: string): Uint8Array {\n  const base64 = dataUrl.split(",")[1];\n  if (!base64) return new Uint8Array(0);\n  const binary = Buffer.from(base64, "base64");\n  return new Uint8Array(binary);\n}\n\nfunction normalizeFieldsForDownload(editorFields: EditorField[], savedSignatureDataUrl: string | null): EditorField[] {\n  const fallbackSignature = savedSignatureDataUrl?.startsWith("data:image/") ? savedSignatureDataUrl : null;\n  return editorFields.map((field) => {\n    if (field.type !== "signature") return field;\n    const signatureField = field as EditorField & { signatureDataUrl?: string; value?: string };\n    const signatureDataUrl = signatureField.signatureDataUrl || fallbackSignature || undefined;\n    return {\n      ...signatureField,\n      signatureDataUrl,\n      value: signatureDataUrl || signatureField.value === "Signed" ? "" : signatureField.value ?? "",\n    } as EditorField;\n  });\n}\n\nexport async function POST(request: NextRequest) {`,
    "normalize signature fields helper",
  );

  text = replaceOnce(
    text,
    `    const orderedFields = orderFieldsForPdfDraw(editorFields);`,
    `    editorFields = normalizeFieldsForDownload(editorFields, savedSignatureDataUrl);\n\n    const orderedFields = orderFieldsForPdfDraw(editorFields);`,
    "normalize before draw order",
  );

  text = replaceOnce(
    text,
    `function drawMultilineText(page: PDFPage, text: string, x: number, startY: number, fontSize: number, activeFont: PDFFont) {\n  const safeLine = sanitize(text);\n  if (!safeLine) return;\n  page.drawText(safeLine, { x, y: startY, size: fontSize, font: activeFont, color: rgb(0, 0, 0) });\n}\n\nasync function drawSignatureImage(pdfDoc: PDFDocument, page: PDFPage, signatureDataUrl: string,`,
    `function drawMultilineText(page: PDFPage, text: string, x: number, startY: number, fontSize: number, activeFont: PDFFont) {\n  const safeLine = sanitize(text);\n  if (!safeLine) return;\n  page.drawText(safeLine, { x, y: startY, size: fontSize, font: activeFont, color: rgb(0, 0, 0) });\n}\n\nfunction fitTextFontSize(activeFont: PDFFont, text: string, maxWidth: number, requestedFontSize: number) {\n  const minFontSize = 4;\n  const safeWidth = Math.max(4, maxWidth);\n  let size = Math.max(minFontSize, requestedFontSize);\n  while (size > minFontSize && activeFont.widthOfTextAtSize(text, size) > safeWidth) {\n    size -= 0.5;\n  }\n  return Math.max(minFontSize, Number(size.toFixed(2)));\n}\n\nasync function drawSignatureImage(pdfDoc: PDFDocument, page: PDFPage, signatureDataUrl: string,`,
    "server text fit helper",
  );

  text = replaceOnce(
    text,
    `      const fontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;\n      const activeFont = field.type === "signature" ? signatureFont : font;\n      // Vertically center text in the field box (matching editor's verticalAlign: "middle")\n      const textY = finalPdfY + (pdfH - fontSize) / 2;\n      page.drawText(sanitize(field.value), {\n        x: pdfX + 2,\n        y: textY,\n        size: fontSize,`,
    `      const activeFont = field.type === "signature" ? signatureFont : font;\n      const requestedFontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;\n      const safeValue = sanitize(field.value);\n      const fontSize = fitTextFontSize(activeFont, safeValue, pdfW - 4, requestedFontSize);\n      // Vertically center text in the field box (matching editor's verticalAlign: "middle")\n      const textY = finalPdfY + (pdfH - fontSize) / 2;\n      page.drawText(safeValue, {\n        x: pdfX + 2,\n        y: textY,\n        size: fontSize,`,
    "server shrink text into field",
  );

  writeIfChanged(path, text);
}

function patchPdfUtils() {
  const path = "src/lib/pdf-utils.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `function dataUrlToBytes(dataUrl: string): Uint8Array {\n  const base64 = dataUrl.split(",")[1];\n  if (!base64) return new Uint8Array(0);\n  const binary = atob(base64);\n  const bytes = new Uint8Array(binary.length);\n  for (let i = 0; i < binary.length; i++) {\n    bytes[i] = binary.charCodeAt(i);\n  }\n  return bytes;\n}\n\nasync function drawFieldOnPage(`,
    `function dataUrlToBytes(dataUrl: string): Uint8Array {\n  const base64 = dataUrl.split(",")[1];\n  if (!base64) return new Uint8Array(0);\n  const binary = atob(base64);\n  const bytes = new Uint8Array(binary.length);\n  for (let i = 0; i < binary.length; i++) {\n    bytes[i] = binary.charCodeAt(i);\n  }\n  return bytes;\n}\n\nfunction fitTextFontSize(\n  activeFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,\n  text: string,\n  maxWidth: number,\n  requestedFontSize: number\n) {\n  const minFontSize = 4;\n  const safeWidth = Math.max(4, maxWidth);\n  let size = Math.max(minFontSize, requestedFontSize);\n  while (size > minFontSize && activeFont.widthOfTextAtSize(text, size) > safeWidth) {\n    size -= 0.5;\n  }\n  return Math.max(minFontSize, Number(size.toFixed(2)));\n}\n\nasync function drawFieldOnPage(`,
    "client text fit helper",
  );

  text = replaceOnce(
    text,
    `      const fontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;\n      const activeFont = field.type === "signature" ? signatureFont : font;\n      page.drawText(sanitize(field.value), {\n        x: pdfX + 2,\n        y: pdfY + pdfH - fontSize - 2,\n        size: fontSize,`,
    `      const activeFont = field.type === "signature" ? signatureFont : font;\n      const requestedFontSize = field.type === "signature" ? 16 : field.fontSize ?? 14;\n      const safeValue = sanitize(field.value);\n      const fontSize = fitTextFontSize(activeFont, safeValue, pdfW - 4, requestedFontSize);\n      page.drawText(safeValue, {\n        x: pdfX + 2,\n        y: pdfY + pdfH - fontSize - 2,\n        size: fontSize,`,
    "client shrink text into field",
  );

  writeIfChanged(path, text);
}

patchEditorPage();
patchPdfViewer();
patchContextPanel();
patchFillPdfRoute();
patchPdfUtils();
