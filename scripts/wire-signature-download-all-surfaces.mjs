import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceBetween(text, start, end, replacement, label) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`Missing signature all-surfaces anchor (${label}: start)`);
  }
  const endIndex = text.indexOf(end, startIndex);
  if (endIndex === -1) {
    throw new Error(`Missing signature all-surfaces anchor (${label}: end)`);
  }
  return text.slice(0, startIndex) + replacement + text.slice(endIndex + end.length);
}

function replaceFirstAvailable(text, candidates, label) {
  for (const candidate of candidates) {
    if (text.includes(candidate.replacement)) return text;
  }

  for (const candidate of candidates) {
    if (text.includes(candidate.search)) {
      return text.replace(candidate.search, candidate.replacement);
    }
  }

  throw new Error(`Missing signature all-surfaces anchor (${label})`);
}

function signatureHelpers(indent) {
  return [
    `${indent}const loadSignatureImageForDownload = (dataUrl: string) => new Promise<HTMLImageElement>((resolve, reject) => {`,
    `${indent}  const image = new Image();`,
    `${indent}  image.decoding = "async";`,
    `${indent}  image.onload = () => resolve(image);`,
    `${indent}  image.onerror = () => reject(new Error("Could not prepare signature image"));`,
    `${indent}  image.src = dataUrl;`,
    `${indent}});`,
    ``,
    `${indent}const normalizeSignatureDataUrlForDownload = async (dataUrl: string | null | undefined) => {`,
    `${indent}  if (!dataUrl || !/^data:image\\//i.test(dataUrl)) return null;`,
    `${indent}  try {`,
    `${indent}    const image = await loadSignatureImageForDownload(dataUrl);`,
    `${indent}    const width = Math.max(1, image.naturalWidth || image.width);`,
    `${indent}    const height = Math.max(1, image.naturalHeight || image.height);`,
    `${indent}    const canvas = document.createElement("canvas");`,
    `${indent}    canvas.width = width;`,
    `${indent}    canvas.height = height;`,
    `${indent}    const ctx = canvas.getContext("2d");`,
    `${indent}    if (!ctx) return /^data:image\\/(png|jpe?g);base64,/i.test(dataUrl) ? dataUrl : null;`,
    `${indent}    ctx.clearRect(0, 0, width, height);`,
    `${indent}    ctx.drawImage(image, 0, 0, width, height);`,
    `${indent}    return canvas.toDataURL("image/png");`,
    `${indent}  } catch {`,
    `${indent}    return /^data:image\\/(png|jpe?g);base64,/i.test(dataUrl) ? dataUrl : null;`,
    `${indent}  }`,
    `${indent}};`,
    ``,
    `${indent}const signatureDataUrlToBlobForDownload = (dataUrl: string) => {`,
    `${indent}  const [header, base64Part] = dataUrl.split(",");`,
    `${indent}  if (!base64Part) return null;`,
    `${indent}  const mime = header.match(/^data:([^;]+);base64$/i)?.[1] ?? "image/png";`,
    `${indent}  if (!/^image\\/(png|jpe?g)$/i.test(mime)) return null;`,
    `${indent}  const cleanBase64 = base64Part.replace(/\\s/g, "");`,
    `${indent}  const binary = atob(cleanBase64);`,
    `${indent}  const bytes = new Uint8Array(binary.length);`,
    `${indent}  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);`,
    `${indent}  return new Blob([bytes], { type: mime });`,
    `${indent}};`,
  ].join("\n");
}

function patchEditorPage() {
  const path = "src/app/editor/page.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  const start = `      // Build FormData and send to server-side fill API\n`;
  const end = `      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));\n`;
  const replacement = [
    `      // Build FormData and send to server-side fill API`,
    signatureHelpers("      "),
    ``,
    `      const fieldsForDownload = await Promise.all(fields.map(async (field) => {`,
    `        if (field.type !== "signature") return field;`,
    `        const signatureField = field as EditorField & { signatureDataUrl?: string; value?: string };`,
    `        const signatureDataUrl = await normalizeSignatureDataUrlForDownload(signatureField.signatureDataUrl || savedSignature);`,
    `        return {`,
    `          ...signatureField,`,
    `          value: signatureDataUrl ? "" : signatureField.value ?? "",`,
    `          signatureDataUrl: signatureDataUrl ?? undefined,`,
    `        } as EditorField;`,
    `      }));`,
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
    `        const signatureBlob = signatureDataUrlToBlobForDownload(signatureDataUrl);`,
    `        if (signatureBlob) {`,
    `          const extension = /jpe?g/i.test(signatureBlob.type) ? "jpg" : "png";`,
    `          fd.append("signatureImage:" + field.id, signatureBlob, field.id + "." + extension);`,
    `        }`,
    `      }`,
    `      fd.append("signaturePayloads", JSON.stringify(signaturePayloads));`,
    `      const normalizedSavedSignature = await normalizeSignatureDataUrlForDownload(savedSignature);`,
    `      if (normalizedSavedSignature) fd.append("savedSignatureDataUrl", normalizedSavedSignature);`,
    `      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));`,
    ``,
  ].join("\n");

  text = replaceBetween(text, start, end, replacement, "editor download payload");
  text = replaceFirstAvailable(
    text,
    [
      {
        search: `  }, [pdfBytes, fields, pageScales, hasAcroForm, fileName, totalPages, showToast]);`,
        replacement: `  }, [pdfBytes, fields, savedSignature, pageScales, hasAcroForm, fileName, totalPages, showToast]);`,
      },
      {
        search: `  }, [pdfBytes, fields, savedSignature, pageScales, hasAcroForm, fileName, totalPages, showToast]);`,
        replacement: `  }, [pdfBytes, fields, savedSignature, pageScales, hasAcroForm, fileName, totalPages, showToast]);`,
      },
    ],
    "editor download dependencies",
  );

  writeIfChanged(path, text);
}

function patchMobileFiller() {
  const path = "src/components/MobileFiller.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  const start = `      const editorFields = fields.map(toEditorField);\n`;
  const end = `      fd.append("pageScales", JSON.stringify([]));\n`;
  const replacement = [
    signatureHelpers("      "),
    ``,
    `      const editorFields = await Promise.all(fields.map(async (field) => {`,
    `        const editorField = toEditorField(field);`,
    `        if (editorField.type !== "signature") return editorField;`,
    `        const signatureField = editorField as EditorField & { signatureDataUrl?: string; value?: string };`,
    `        const signatureDataUrl = await normalizeSignatureDataUrlForDownload(signatureField.signatureDataUrl || savedSignature);`,
    `        return {`,
    `          ...signatureField,`,
    `          value: signatureDataUrl ? "" : signatureField.value ?? "",`,
    `          signatureDataUrl: signatureDataUrl ?? undefined,`,
    `        } as EditorField;`,
    `      }));`,
    `      const fd = new FormData();`,
    `      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");`,
    `      fd.append("fields", JSON.stringify(editorFields));`,
    `      const signaturePayloads: Record<string, string> = {};`,
    `      for (const field of editorFields) {`,
    `        if (field.type !== "signature") continue;`,
    `        const signatureDataUrl = (field as EditorField & { signatureDataUrl?: string }).signatureDataUrl;`,
    `        if (typeof signatureDataUrl !== "string" || !/^data:image\\/(png|jpe?g);base64,/i.test(signatureDataUrl)) continue;`,
    `        signaturePayloads[field.id] = signatureDataUrl;`,
    `        const signatureBlob = signatureDataUrlToBlobForDownload(signatureDataUrl);`,
    `        if (signatureBlob) {`,
    `          const extension = /jpe?g/i.test(signatureBlob.type) ? "jpg" : "png";`,
    `          fd.append("signatureImage:" + field.id, signatureBlob, field.id + "." + extension);`,
    `        }`,
    `      }`,
    `      fd.append("signaturePayloads", JSON.stringify(signaturePayloads));`,
    `      const normalizedSavedSignature = await normalizeSignatureDataUrlForDownload(savedSignature);`,
    `      if (normalizedSavedSignature) fd.append("savedSignatureDataUrl", normalizedSavedSignature);`,
    `      fd.append("pageScales", JSON.stringify([]));`,
    ``,
  ].join("\n");

  text = replaceBetween(text, start, end, replacement, "mobile filler download payload");
  text = replaceFirstAvailable(
    text,
    [
      {
        search: `  }, [pdfBytes, fields, fileName, hasAcroForm, showToast]);`,
        replacement: `  }, [pdfBytes, fields, fileName, hasAcroForm, savedSignature, showToast]);`,
      },
      {
        search: `  }, [pdfBytes, fields, fileName, hasAcroForm, savedSignature, showToast]);`,
        replacement: `  }, [pdfBytes, fields, fileName, hasAcroForm, savedSignature, showToast]);`,
      },
    ],
    "mobile filler download dependencies",
  );

  writeIfChanged(path, text);
}

patchEditorPage();
patchMobileFiller();
