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
  const replacement = [
    `      // Build FormData and send to server-side fill API`,
    `      const toSignatureBlob = (dataUrl: string) => {`,
    `        const [header, base64Part] = dataUrl.split(",");`,
    `        if (!base64Part) return null;`,
    `        const mime = header.match(/^data:([^;]+);base64$/i)?.[1] ?? "image/png";`,
    `        if (!/^image\\/(png|jpe?g)$/i.test(mime)) return null;`,
    `        const cleanBase64 = base64Part.replace(/\\s/g, "");`,
    `        const binary = atob(cleanBase64);`,
    `        const bytes = new Uint8Array(binary.length);`,
    `        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);`,
    `        return new Blob([bytes], { type: mime });`,
    `      };`,
    ``,
    `      const fieldsForDownload = fields.map((field) => {`,
    `        if (field.type !== "signature") return field;`,
    `        const signatureField = field as EditorField & { signatureDataUrl?: string; value?: string };`,
    `        const signatureDataUrl = signatureField.signatureDataUrl || savedSignature || undefined;`,
    `        return {`,
    `          ...signatureField,`,
    `          value: signatureDataUrl ? "" : signatureField.value ?? "",`,
    `          signatureDataUrl,`,
    `        } as EditorField;`,
    `      });`,
    ``,
    `      const fd = new FormData();`,
    `      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");`,
    `      fd.append("fields", JSON.stringify(fieldsForDownload));`,
    ``,
    `      const signaturePayloads: Record<string, string> = {};`,
    `      for (const field of fieldsForDownload) {`,
    `        if (field.type !== "signature") continue;`,
    `        const signatureDataUrl = (field as EditorField & { signatureDataUrl?: string }).signatureDataUrl;`,
    `        if (typeof signatureDataUrl !== "string" || !/^data:image\\/(png|jpe?g);base64,/i.test(signatureDataUrl)) continue;`,
    `        signaturePayloads[field.id] = signatureDataUrl;`,
    `        const signatureBlob = toSignatureBlob(signatureDataUrl);`,
    `        if (signatureBlob) {`,
    `          const extension = /jpe?g/i.test(signatureBlob.type) ? "jpg" : "png";`,
    `          fd.append("signatureImage:" + field.id, signatureBlob, field.id + "." + extension);`,
    `        }`,
    `      }`,
    `      fd.append("signaturePayloads", JSON.stringify(signaturePayloads));`,
    `      if (savedSignature) fd.append("savedSignatureDataUrl", savedSignature);`,
    `      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));`,
    ``,
  ].join("\n");

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

  const helper = [
    ``,
    `function isSignatureImageDataUrl(value: unknown): value is string {`,
    `  return typeof value === "string" && /^data:image\\/(png|jpe?g);base64,/i.test(value);`,
    `}`,
    ``,
    `async function signatureFilePartToDataUrl(part: unknown): Promise<string | null> {`,
    `  if (!part || typeof part === "string") return null;`,
    ``,
    `  const file = part as { type?: string; size?: number; arrayBuffer?: () => Promise<ArrayBuffer> };`,
    `  if (typeof file.arrayBuffer !== "function" || !file.size) return null;`,
    ``,
    `  const mime = typeof file.type === "string" && /^image\\/(png|jpe?g)$/i.test(file.type)`,
    `    ? file.type`,
    `    : "image/png";`,
    `  const bytes = Buffer.from(await file.arrayBuffer());`,
    `  if (bytes.length === 0) return null;`,
    ``,
    `  return "data:" + mime + ";base64," + bytes.toString("base64");`,
    `}`,
    ``,
    `async function definitiveNormalizeSignatureImages(`,
    `  editorFields: EditorField[],`,
    `  formData: FormData,`,
    `  signaturePayloads: Record<string, string>,`,
    `  savedSignatureDataUrl: string | null,`,
    `): Promise<EditorField[]> {`,
    `  const fallbackSignature = isSignatureImageDataUrl(savedSignatureDataUrl) ? savedSignatureDataUrl : null;`,
    ``,
    `  return Promise.all(editorFields.map(async (field) => {`,
    `    if (field.type !== "signature") return field;`,
    ``,
    `    const signatureField = field as EditorField & { signatureDataUrl?: string; value?: string };`,
    `    const binaryPartDataUrl = await signatureFilePartToDataUrl(formData.get("signatureImage:" + field.id));`,
    `    const signatureDataUrl =`,
    `      binaryPartDataUrl ||`,
    `      (isSignatureImageDataUrl(signatureField.signatureDataUrl) ? signatureField.signatureDataUrl : null) ||`,
    `      (isSignatureImageDataUrl(signaturePayloads[field.id]) ? signaturePayloads[field.id] : null) ||`,
    `      fallbackSignature ||`,
    `      undefined;`,
    ``,
    `    return {`,
    `      ...signatureField,`,
    `      signatureDataUrl,`,
    `      value: signatureDataUrl ? "" : signatureField.value ?? "",`,
    `    } as EditorField;`,
    `  }));`,
    `}`,
  ].join("\n");

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
