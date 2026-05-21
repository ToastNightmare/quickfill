import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = readFileSync(path, "utf8");
  if (normalize(current) !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing security hardening anchor (${label}): ${search.slice(0, 160)}`);
  return text.replace(search, replacement);
}

function insertAfterIfMissing(text, marker, snippet, needle, label) {
  if (text.includes(needle)) return text;
  if (!text.includes(marker)) throw new Error(`Missing security hardening marker (${label}): ${marker.slice(0, 160)}`);
  return text.replace(marker, `${marker}${snippet}`);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = insertAfterIfMissing(
    text,
    `const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;\n`,
    `const MAX_EXPORT_FIELDS = 500;\nconst MAX_FORM_JSON_CHARS = 1_000_000;\n\nfunction isLikelyPdfBytes(bytes: ArrayBuffer) {\n  if (bytes.byteLength < 5) return false;\n  return Buffer.from(bytes.slice(0, 5)).toString("latin1") === "%PDF-";\n}\n\n`,
    "MAX_EXPORT_FIELDS",
    "fill-pdf constants",
  );

  text = insertAfterIfMissing(
    text,
    `    if (!fieldsJson || !pageScalesJson) {\n      return NextResponse.json({ error: "Missing fields or pageScales" }, { status: 400 });\n    }\n`,
    `\n    if (\n      fieldsJson.length > MAX_FORM_JSON_CHARS ||\n      pageScalesJson.length > MAX_FORM_JSON_CHARS ||\n      (viewportDimsJson?.length ?? 0) > MAX_FORM_JSON_CHARS\n    ) {\n      return NextResponse.json({ error: "PDF export data is too large" }, { status: 413 });\n    }\n`,
    "PDF export data is too large",
    "fill-pdf JSON size guard",
  );

  text = replaceOnce(
    text,
    `      editorFields = JSON.parse(fieldsJson);\n      const pageScaleEntries: [number, number][] = JSON.parse(pageScalesJson);\n      pageScales = new Map(pageScaleEntries);\n\n      if (viewportDimsJson) {`,
    `      editorFields = JSON.parse(fieldsJson);\n      if (!Array.isArray(editorFields) || editorFields.length > MAX_EXPORT_FIELDS) {\n        return NextResponse.json({ error: "Too many fields to export" }, { status: 400 });\n      }\n\n      const pageScaleEntries: [number, number][] = JSON.parse(pageScalesJson);\n      if (!Array.isArray(pageScaleEntries)) {\n        return NextResponse.json({ error: "Invalid page scale data" }, { status: 400 });\n      }\n      pageScales = new Map(pageScaleEntries);\n\n      if (viewportDimsJson) {`,
    "fill-pdf parsed data guard",
  );

  text = replaceOnce(
    text,
    `      const { success } = await checkRateLimit(identifier);\n`,
    `      const { success } = await checkRateLimit(identifier, "fillPdf");\n`,
    "fill-pdf rate policy",
  );

  text = replaceOnce(
    text,
    `    const pdfBytes = await pdfFile.arrayBuffer();\n    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });`,
    `    const pdfBytes = await pdfFile.arrayBuffer();\n    if (!isLikelyPdfBytes(pdfBytes)) {\n      await recordDownloadLog({\n        status: "blocked",\n        userId: accessForLog?.userId,\n        guest: accessForLog?.guest,\n        filename: fileForLog?.name,\n        fileSizeKb: Math.round((fileForLog?.size ?? 0) / 1024),\n        reason: "invalid_pdf",\n        message: "Uploaded file did not start with a PDF header",\n      });\n      return NextResponse.json({ error: "Uploaded file is not a valid PDF" }, { status: 400 });\n    }\n\n    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });`,
    "fill-pdf magic-byte guard",
  );

  text = replaceOnce(
    text,
    `      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },`,
    `      headers: {\n        "Content-Type": "application/pdf",\n        "Content-Disposition": "inline",\n        "Cache-Control": "private, no-store",\n        "X-Content-Type-Options": "nosniff",\n      },`,
    "fill-pdf response headers",
  );

  text = replaceOnce(
    text,
    `    return NextResponse.json({ error: message }, { status: 500 });`,
    `    return NextResponse.json({ error: "PDF export failed. Please try again or send this to support." }, { status: 500 });`,
    "fill-pdf generic error",
  );

  writeIfChanged(path, text);
}

patchFillPdfRoute();
