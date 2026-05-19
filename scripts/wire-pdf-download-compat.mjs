import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/api/fill-pdf/route.ts";
const watermarkStart = "    // Apply border watermark for free/guest users. QA token requests act like Pro.\n";
const incrementMarker = "    await incrementDownloadUsage(access);\n";
const responseStart = "    return new NextResponse";
const catchStart = "  } catch (err) {";

function replaceBetween(text, start, end, replacement) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) throw new Error(`Missing replacement start: ${start.slice(0, 80)}`);

  const endIndex = text.indexOf(end, startIndex + start.length);
  if (endIndex === -1) throw new Error(`Missing replacement end: ${end.slice(0, 80)}`);

  return text.slice(0, startIndex) + replacement + text.slice(endIndex);
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
text = removeLine(
  text,
  'import { assertValidGeneratedPdf, buildPdfDownloadHeaders, filledPdfFilename } from "@/lib/pdf-download-response";\n',
);

text = ensureImport(
  text,
  'import { orderFieldsForPdfDraw } from "@/lib/pdf-utils";\n',
  'import { buildPdfDownloadHeaders, filledPdfFilename } from "@/lib/pdf-download-response";\nimport { finalizePdfForDownload } from "@/lib/pdf-finalize";\n',
);

if (!text.includes("finalizePdfForDownload(pdfDoc")) {
  text = replaceBetween(
    text,
    watermarkStart,
    incrementMarker,
    `    const resultBytes = await finalizePdfForDownload(pdfDoc, access.isPro || access.isQaBypass === true);
    const resultBuffer = Buffer.from(resultBytes);

`,
  );
}

if (!text.includes("buildPdfDownloadHeaders(resultBuffer")) {
  text = replaceBetween(
    text,
    responseStart,
    catchStart,
    `    return new NextResponse(resultBuffer, {
      status: 200,
      headers: buildPdfDownloadHeaders(resultBuffer, filledPdfFilename(pdfFile.name)),
    });
`,
  );
}

writeFileSync(path, text);
