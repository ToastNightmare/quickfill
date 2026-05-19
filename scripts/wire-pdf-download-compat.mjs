import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/api/fill-pdf/route.ts";

function replaceOnce(text, search, replacement) {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const normalizedReplacement = replacement.trim().replace(/\r\n/g, "\n");
  if (normalizedText.includes(normalizedReplacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing replacement target: ${search.slice(0, 80)}`);
  return text.replace(search, replacement);
}

function ensureImport(text, after, addition) {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const normalizedAddition = addition.trim().replace(/\r\n/g, "\n");
  if (normalizedText.includes(normalizedAddition)) return text;

  const anchor = after.replace(/\r?\n$/, "");
  const anchorIndex = text.indexOf(anchor);
  if (anchorIndex === -1) throw new Error(`Missing import anchor: ${after.trim()}`);

  const lineEndStart = anchorIndex + anchor.length;
  const lineEnd = text.startsWith("\r\n", lineEndStart) ? "\r\n" : "\n";
  const insertIndex = lineEndStart + lineEnd.length;
  return text.slice(0, insertIndex) + addition.replace(/\r?\n/g, lineEnd) + text.slice(insertIndex);
}

let text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

text = ensureImport(
  text,
  'import { orderFieldsForPdfDraw } from "@/lib/pdf-utils";\n',
  'import { assertValidGeneratedPdf, buildPdfDownloadHeaders, filledPdfFilename } from "@/lib/pdf-download-response";\n',
);

text = replaceOnce(
  text,
  '    // Apply border watermark for free/guest users. QA token requests act like Pro.\n',
  '    cleanupEditedDocumentArtifacts(pdfDoc);\n\n    // Apply border watermark for free/guest users. QA token requests act like Pro.\n',
);

text = replaceOnce(
  text,
  'function removeWidgetAnnotations(pdfDoc: PDFDocument) {\n',
  'function cleanupEditedDocumentArtifacts(pdfDoc: PDFDocument) {\n  try {\n    pdfDoc.catalog.delete(PDFName.of("Perms"));\n  } catch {\n    // Edited PDFs invalidate source document signatures/certification permissions.\n  }\n}\n\nfunction removeWidgetAnnotations(pdfDoc: PDFDocument) {\n',
);

text = replaceOnce(
  text,
  '    const resultBytes = await pdfDoc.save({ updateFieldAppearances: false, useObjectStreams: false });\n    await incrementDownloadUsage(access);\n',
  '    const resultBytes = await pdfDoc.save({ updateFieldAppearances: false, useObjectStreams: false });\n    const resultBuffer = Buffer.from(resultBytes);\n    assertValidGeneratedPdf(resultBuffer);\n\n    await incrementDownloadUsage(access);\n',
);

text = replaceOnce(
  text,
  '    return new NextResponse(Buffer.from(resultBytes), {\n      status: 200,\n      headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment" },\n    });\n',
  '    return new NextResponse(resultBuffer, {\n      status: 200,\n      headers: buildPdfDownloadHeaders(resultBuffer, filledPdfFilename(pdfFile.name)),\n    });\n',
);

writeFileSync(path, text);
