import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/api/fill-pdf/route.ts";

function replaceOnce(text, search, replacement) {
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

function removeLine(text, line) {
  return text.replace(line, "");
}

let text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

text = removeLine(text, 'import { applyBorderWatermark } from "@/lib/watermark";\n');

text = ensureImport(
  text,
  'import { orderFieldsForPdfDraw } from "@/lib/pdf-utils";\n',
  'import { buildPdfDownloadHeaders, filledPdfFilename } from "@/lib/pdf-download-response";\nimport { finalizePdfForDownload } from "@/lib/pdf-finalize";\n',
);

if (!text.includes("finalizePdfForDownload(pdfDoc")) {
  text = replaceOnce(
    text,
    `    // Apply border watermark for free/guest users. QA token requests act like Pro.
    const pages = pdfDoc.getPages();
    const watermarkFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    applyBorderWatermark(pages, watermarkFont, access.isPro || access.isQaBypass === true);

    const resultBytes = await pdfDoc.save({ updateFieldAppearances: false });
    await incrementDownloadUsage(access);
`,
    `    const resultBytes = await finalizePdfForDownload(pdfDoc, access.isPro || access.isQaBypass === true);
    const resultBuffer = Buffer.from(resultBytes);

    await incrementDownloadUsage(access);
`,
  );
}

if (!text.includes("buildPdfDownloadHeaders(resultBuffer")) {
  text = replaceOnce(
    text,
    `    return new NextResponse(Buffer.from(resultBytes), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },
    });
`,
    `    return new NextResponse(resultBuffer, {
      status: 200,
      headers: buildPdfDownloadHeaders(resultBuffer, filledPdfFilename(pdfFile.name)),
    });
`,
  );
}

writeFileSync(path, text);
