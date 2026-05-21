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
    throw new Error(`Missing signature export safety anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function replaceFirstAvailable(text, candidates, label) {
  if (candidates.some(({ replacement }) => text.includes(replacement))) return text;
  for (const { search, replacement } of candidates) {
    if (text.includes(search)) return text.replace(search, replacement);
  }
  throw new Error(`Missing signature export safety anchor (${label}): ${candidates[0]?.search.slice(0, 160) ?? "none"}`);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `    const orderedFields = orderFieldsForPdfDraw(editorFields);\n    fieldsForLog = editorFields;`,
    `    const orderedFields = orderFieldsForPdfDraw(editorFields);\n    const drawFields = [\n      ...orderedFields.filter((field) => field.type !== "signature"),\n      ...orderedFields.filter((field) => field.type === "signature"),\n    ];\n    fieldsForLog = editorFields;`,
    "server signature final draw pass",
  );

  text = text.replaceAll(`for (const field of orderedFields) {`, `for (const field of drawFields) {`);

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `  const base64 = dataUrl.split(",")[1];\n  if (!base64) return new Uint8Array(0);\n  const binary = Buffer.from(base64, "base64");`,
        replacement: `  const base64 = dataUrl.split(",")[1]?.replace(/\\s/g, "");\n  if (!base64) return new Uint8Array(0);\n  const binary = Buffer.from(base64, "base64");`,
      },
    ],
    "server signature base64 cleanup",
  );

  text = replaceOnce(
    text,
    `async function drawSignatureImage(pdfDoc: PDFDocument, page: PDFPage, signatureDataUrl: string,`,
    `async function embedSignatureImage(pdfDoc: PDFDocument, signatureDataUrl: string, imgBytes: Uint8Array) {\n  const preferJpeg = /^data:image\\/jpe?g/i.test(signatureDataUrl);\n  const attempts = preferJpeg\n    ? [() => pdfDoc.embedJpg(imgBytes), () => pdfDoc.embedPng(imgBytes)]\n    : [() => pdfDoc.embedPng(imgBytes), () => pdfDoc.embedJpg(imgBytes)];\n  let lastError: unknown;\n\n  for (const attempt of attempts) {\n    try {\n      return await attempt();\n    } catch (error) {\n      lastError = error;\n    }\n  }\n\n  throw lastError instanceof Error ? lastError : new Error("Could not embed signature image");\n}\n\nasync function drawSignatureImage(pdfDoc: PDFDocument, page: PDFPage, signatureDataUrl: string,`,
    "server signature embed helper",
  );

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `    const isJpeg = signatureDataUrl.startsWith("data:image/jpeg") || signatureDataUrl.startsWith("data:image/jpg");\n    const img = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);`,
        replacement: `    const img = await embedSignatureImage(pdfDoc, signatureDataUrl, imgBytes);`,
      },
    ],
    "server signature embed retry",
  );

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `  } else if (field.type === "signature" && field.signatureDataUrl) {\n    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, finalPdfY, pdfW, pdfH, field.value, signatureFont, field.fontSize ?? 16);\n  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {`,
        replacement: `  } else if (field.type === "signature" && field.signatureDataUrl) {\n    const fallbackText = field.value && field.value !== "Signed" ? field.value : "";\n    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, finalPdfY, pdfW, pdfH, fallbackText, signatureFont, field.fontSize ?? 16);\n  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {`,
      },
      {
        search: `  } else if (field.type === "signature" && field.signatureDataUrl) {\n    const fallbackText = field.value && field.value !== "Signed" ? field.value : "";\n    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, finalPdfY, pdfW, pdfH, fallbackText, signatureFont, field.fontSize ?? 16);\n  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {`,
        replacement: `  } else if (field.type === "signature" && field.signatureDataUrl) {\n    const fallbackText = field.value && field.value !== "Signed" ? field.value : "";\n    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, finalPdfY, pdfW, pdfH, fallbackText, signatureFont, field.fontSize ?? 16);\n  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {`,
      },
    ],
    "server signature fallback text",
  );

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `  } catch {\n    if (fallbackText) {`,
        replacement: `  } catch (error) {\n    console.warn("signature image embed failed:", error instanceof Error ? error.message : error);\n    if (fallbackText) {`,
      },
      {
        search: `  } catch (error) {\n    console.warn("signature image embed failed:", error instanceof Error ? error.message : error);\n    if (fallbackText) {`,
        replacement: `  } catch (error) {\n    console.warn("signature image embed failed:", error instanceof Error ? error.message : error);\n    if (fallbackText) {`,
      },
    ],
    "server signature embed logging",
  );

  writeIfChanged(path, text);
}

function patchPdfUtils() {
  const path = "src/lib/pdf-utils.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `export function orderFieldsForPdfDraw(editorFields: EditorField[]): EditorField[] {\n  const whiteoutFields = editorFields.filter((field) => field.type === "whiteout");\n  const overlayFields = editorFields.filter((field) => field.type !== "whiteout");\n  return [...whiteoutFields, ...overlayFields];\n}`,
        replacement: `export function orderFieldsForPdfDraw(editorFields: EditorField[]): EditorField[] {\n  const whiteoutFields = editorFields.filter((field) => field.type === "whiteout");\n  const signatureFields = editorFields.filter((field) => field.type === "signature");\n  const overlayFields = editorFields.filter((field) => field.type !== "whiteout" && field.type !== "signature");\n  return [...whiteoutFields, ...overlayFields, ...signatureFields];\n}`,
      },
      {
        search: `export function orderFieldsForPdfDraw(editorFields: EditorField[]): EditorField[] {\n  const whiteoutFields = editorFields.filter((field) => field.type === "whiteout");\n  const signatureFields = editorFields.filter((field) => field.type === "signature");\n  const overlayFields = editorFields.filter((field) => field.type !== "whiteout" && field.type !== "signature");\n  return [...whiteoutFields, ...overlayFields, ...signatureFields];\n}`,
        replacement: `export function orderFieldsForPdfDraw(editorFields: EditorField[]): EditorField[] {\n  const whiteoutFields = editorFields.filter((field) => field.type === "whiteout");\n  const signatureFields = editorFields.filter((field) => field.type === "signature");\n  const overlayFields = editorFields.filter((field) => field.type !== "whiteout" && field.type !== "signature");\n  return [...whiteoutFields, ...overlayFields, ...signatureFields];\n}`,
      },
    ],
    "shared signature draw order",
  );

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `  const base64 = dataUrl.split(",")[1];\n  if (!base64) return new Uint8Array(0);\n  const binary = atob(base64);`,
        replacement: `  const base64 = dataUrl.split(",")[1]?.replace(/\\s/g, "");\n  if (!base64) return new Uint8Array(0);\n  const binary = atob(base64);`,
      },
    ],
    "client signature base64 cleanup",
  );

  text = replaceOnce(
    text,
    `async function drawFieldOnPage(\n  pdfDoc: PDFDocument,`,
    `async function embedSignatureImage(pdfDoc: PDFDocument, signatureDataUrl: string, imgBytes: Uint8Array) {\n  const preferJpeg = /^data:image\\/jpe?g/i.test(signatureDataUrl);\n  const attempts = preferJpeg\n    ? [() => pdfDoc.embedJpg(imgBytes), () => pdfDoc.embedPng(imgBytes)]\n    : [() => pdfDoc.embedPng(imgBytes), () => pdfDoc.embedJpg(imgBytes)];\n  let lastError: unknown;\n\n  for (const attempt of attempts) {\n    try {\n      return await attempt();\n    } catch (error) {\n      lastError = error;\n    }\n  }\n\n  throw lastError instanceof Error ? lastError : new Error("Could not embed signature image");\n}\n\nasync function drawFieldOnPage(\n  pdfDoc: PDFDocument,`,
    "client signature embed helper",
  );

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `      const isJpeg = field.signatureDataUrl.startsWith("data:image/jpeg") || field.signatureDataUrl.startsWith("data:image/jpg");\n      const img = isJpeg ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);`,
        replacement: `      const img = await embedSignatureImage(pdfDoc, field.signatureDataUrl, imgBytes);`,
      },
    ],
    "client signature embed retry",
  );

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `    } catch {\n      if (field.value) {\n        page.drawText(sanitize(field.value), {`,
        replacement: `    } catch {\n      const fallbackValue = field.value === "Signed" ? "" : field.value;\n      if (fallbackValue) {\n        page.drawText(sanitize(fallbackValue), {`,
      },
      {
        search: `    } catch {\n      const fallbackValue = field.value === "Signed" ? "" : field.value;\n      if (fallbackValue) {\n        page.drawText(sanitize(fallbackValue), {`,
        replacement: `    } catch {\n      const fallbackValue = field.value === "Signed" ? "" : field.value;\n      if (fallbackValue) {\n        page.drawText(sanitize(fallbackValue), {`,
      },
    ],
    "client signature fallback text",
  );

  writeIfChanged(path, text);
}

patchFillPdfRoute();
patchPdfUtils();
