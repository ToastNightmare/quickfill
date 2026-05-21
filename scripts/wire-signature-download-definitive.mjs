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
    throw new Error(`Missing definitive signature export anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function replaceBetween(text, start, end, replacement, label) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`Missing definitive signature export anchor (${label}: start)`);
  }
  const endIndex = text.indexOf(end, startIndex);
  if (endIndex === -1) {
    throw new Error(`Missing definitive signature export anchor (${label}: end)`);
  }
  return text.slice(0, startIndex) + replacement + text.slice(endIndex + end.length);
}

function patchEditorPage() {
  const path = "src/app/editor/page.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  const start = `      // Build FormData and send to server-side fill API\n`;
  const end = `      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));\n`;
  const replacement = `      // Build FormData and send to server-side fill API\n      const toSignatureBlob = (dataUrl: string) => {\n        const [header, base64Part] = dataUrl.split(",");\n        if (!base64Part) return null;\n        const mime = header.match(/^data:([^;]+);base64$/i)?.[1] ?? "image/png";\n        if (!/^image\\/(png|jpe?g)$/i.test(mime)) return null;\n        const cleanBase64 = base64Part.replace(/\\s/g, "");\n        const binary = atob(cleanBase64);\n        const bytes = new Uint8Array(binary.length);\n        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);\n        return new Blob([bytes], { type: mime });\n      };\n\n      const fieldsForDownload = fields.map((field) => {\n        if (field.type !== "signature") return field;\n        const signatureField = field as EditorField & { signatureDataUrl?: string; value?: string };\n        const signatureDataUrl = signatureField.signatureDataUrl || savedSignature || undefined;\n        return {\n          ...signatureField,\n          value: signatureDataUrl ? "" : signatureField.value ?? "",\n          signatureDataUrl,\n        } as EditorField;\n      });\n\n      const fd = new FormData();\n      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");\n      fd.append("fields", JSON.stringify(fieldsForDownload));\n\n      const signaturePayloads: Record<string, string> = {};\n      for (const field of fieldsForDownload) {\n        if (field.type !== "signature") continue;\n        const signatureDataUrl = (field as EditorField & { signatureDataUrl?: string }).signatureDataUrl;\n        if (typeof signatureDataUrl !== "string" || !/^data:image\\/(png|jpe?g);base64,/i.test(signatureDataUrl)) continue;\n        signaturePayloads[field.id] = signatureDataUrl;\n        const signatureBlob = toSignatureBlob(signatureDataUrl);\n        if (signatureBlob) {\n          const extension = /jpe?g/i.test(signatureBlob.type) ? "jpg" : "png";\n          fd.append(` + "`signatureImage:${field.id}`" + `, signatureBlob, `${field.id}.${extension}`);\n        }\n      }\n      fd.append("signaturePayloads", JSON.stringify(signaturePayloads));\n      if (savedSignature) fd.append("savedSignatureDataUrl", savedSignature);\n      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));\n`;

  text = replaceBetween(text, start, end, replacement, "editor download payload");
  text = text.replace(
    `  }, [pdfBytes, fields, pageScales, hasAcroForm, fileName, totalPages, showToast]);`,
    `  }, [pdfBytes, fields, savedSignature, pageScales, hasAcroForm, fileName, totalPages, showToast]);`,
  );

  writeIfChanged(path, text);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceRequired(
    text,
    `    const hasAcroForm = formData.get("hasAcroForm") === "true";\n    const savedSignatureDataUrl = formData.get("savedSignatureDataUrl") as string | null;\n    hasAcroFormForLog = hasAcroForm;`,
    `    const hasAcroForm = formData.get("hasAcroForm") === "true";\n    const savedSignatureDataUrl = formData.get("savedSignatureDataUrl") as string | null;\n    const signaturePayloadsJson = formData.get("signaturePayloads") as string | null;\n    hasAcroFormForLog = hasAcroForm;`,
    "signature payload form field",
  );

  text = replaceRequired(
    text,
    `    let editorFields: EditorField[];\n    let pageScales: Map<number, number>;\n    let viewportDims: Map<number, { width: number; height: number }> | null = null;`,
    `    let editorFields: EditorField[];\n    let pageScales: Map<number, number>;\n    let viewportDims: Map<number, { width: number; height: number }> | null = null;\n    let signaturePayloads: Record<string, string> = {};`,
    "signature payload variable",
  );

  text = replaceRequired(
    text,
    `      if (viewportDimsJson) {\n        const viewportEntries: [number, { width: number; height: number }][] = JSON.parse(viewportDimsJson);\n        viewportDims = new Map(viewportEntries);\n      }\n    } catch {`,
    `      if (viewportDimsJson) {\n        const viewportEntries: [number, { width: number; height: number }][] = JSON.parse(viewportDimsJson);\n        viewportDims = new Map(viewportEntries);\n      }\n\n      if (signaturePayloadsJson) {\n        const parsed = JSON.parse(signaturePayloadsJson);\n        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {\n          signaturePayloads = parsed as Record<string, string>;\n        }\n      }\n    } catch {`,
    "signature payload parsing",
  );

  const helper = `\nfunction isSignatureImageDataUrl(value: unknown): value is string {\n  return typeof value === "string" && /^data:image\\/(png|jpe?g);base64,/i.test(value);\n}\n\nasync function signatureFilePartToDataUrl(part: unknown): Promise<string | null> {\n  if (!part || typeof part === "string") return null;\n\n  const file = part as { type?: string; size?: number; arrayBuffer?: () => Promise<ArrayBuffer> };\n  if (typeof file.arrayBuffer !== "function" || !file.size) return null;\n\n  const mime = typeof file.type === "string" && /^image\\/(png|jpe?g)$/i.test(file.type)\n    ? file.type\n    : "image/png";\n  const bytes = Buffer.from(await file.arrayBuffer());\n  if (bytes.length === 0) return null;\n\n  return ` + "`data:${mime};base64,${bytes.toString(\"base64\")}`" + `;\n}\n\nasync function definitiveNormalizeSignatureImages(\n  editorFields: EditorField[],\n  formData: FormData,\n  signaturePayloads: Record<string, string>,\n  savedSignatureDataUrl: string | null,\n): Promise<EditorField[]> {\n  const fallbackSignature = isSignatureImageDataUrl(savedSignatureDataUrl) ? savedSignatureDataUrl : null;\n\n  return Promise.all(editorFields.map(async (field) => {\n    if (field.type !== "signature") return field;\n\n    const signatureField = field as EditorField & { signatureDataUrl?: string; value?: string };\n    const binaryPartDataUrl = await signatureFilePartToDataUrl(formData.get(` + "`signatureImage:${field.id}`" + `));\n    const signatureDataUrl =\n      binaryPartDataUrl ||\n      (isSignatureImageDataUrl(signatureField.signatureDataUrl) ? signatureField.signatureDataUrl : null) ||\n      (isSignatureImageDataUrl(signaturePayloads[field.id]) ? signaturePayloads[field.id] : null) ||\n      fallbackSignature ||\n      undefined;\n\n    return {\n      ...signatureField,\n      signatureDataUrl,\n      value: signatureDataUrl ? "" : signatureField.value ?? "",\n    } as EditorField;\n  }));\n}\n`;

  if (!text.includes("function isSignatureImageDataUrl")) {
    text = text.replace(`\nexport async function POST(request: NextRequest) {`, `${helper}\nexport async function POST(request: NextRequest) {`);
  }

  if (text.includes(`    editorFields = normalizeFieldsForDownload(editorFields, savedSignatureDataUrl);`)) {
    text = text.replace(
      `    editorFields = normalizeFieldsForDownload(editorFields, savedSignatureDataUrl);`,
      `    editorFields = await definitiveNormalizeSignatureImages(editorFields, formData, signaturePayloads, savedSignatureDataUrl);`,
    );
  } else {
    text = replaceRequired(
      text,
      `    const orderedFields = orderFieldsForPdfDraw(editorFields);`,
      `    editorFields = await definitiveNormalizeSignatureImages(editorFields, formData, signaturePayloads, savedSignatureDataUrl);\n\n    const orderedFields = orderFieldsForPdfDraw(editorFields);`,
      "signature normalization before draw",
    );
  }

  writeIfChanged(path, text);
}

patchEditorPage();
patchFillPdfRoute();
