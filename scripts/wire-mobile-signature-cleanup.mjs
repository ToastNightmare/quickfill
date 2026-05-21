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
    throw new Error(`Missing mobile signature cleanup anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function replaceFirstAvailable(text, candidates, label) {
  if (candidates.some(({ replacement }) => text.includes(replacement))) return text;
  for (const { search, replacement } of candidates) {
    if (text.includes(search)) return text.replace(search, replacement);
  }
  throw new Error(`Missing mobile signature cleanup anchor (${label}): ${candidates[0]?.search.slice(0, 160) ?? "none"}`);
}

function patchEditorPage() {
  const path = "src/app/editor/page.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `  const totalFilledCount = useMemo(() => {\n    return fields.filter((f) => {\n      if (f.type === "checkbox") return f.checked;\n      if ("value" in f) return (f as { value: string }).value !== "";\n      return false;\n    }).length;\n  }, [fields]);`,
    `  const totalFilledCount = useMemo(() => {\n    return fields.filter((f) => {\n      if (f.type === "checkbox") return f.checked;\n      if (f.type === "signature") {\n        const signature = f as { signatureDataUrl?: string; value?: string };\n        return Boolean(signature.signatureDataUrl || signature.value);\n      }\n      if ("value" in f) return (f as { value: string }).value !== "";\n      return false;\n    }).length;\n  }, [fields]);`,
    "signature progress count",
  );

  text = text.replaceAll(`signatureDataUrl: savedSignature, value: "Signed"`, `signatureDataUrl: savedSignature, value: ""`);
  text = text.replaceAll(`signatureDataUrl: dataUrl, value: "Signed"`, `signatureDataUrl: dataUrl, value: ""`);

  writeIfChanged(path, text);
}

function patchPdfUtils() {
  const path = "src/lib/pdf-utils.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `export function orderFieldsForPdfDraw(editorFields: EditorField[]): EditorField[] {\n  const whiteoutFields = editorFields.filter((field) => field.type === "whiteout");\n  const overlayFields = editorFields.filter((field) => field.type !== "whiteout");\n  return [...whiteoutFields, ...overlayFields];\n}`,
    `export function orderFieldsForPdfDraw(editorFields: EditorField[]): EditorField[] {\n  const whiteoutFields = editorFields.filter((field) => field.type === "whiteout");\n  const signatureFields = editorFields.filter((field) => field.type === "signature");\n  const overlayFields = editorFields.filter((field) => field.type !== "whiteout" && field.type !== "signature");\n  return [...whiteoutFields, ...overlayFields, ...signatureFields];\n}`,
    "signature draw order",
  );

  text = replaceOnce(
    text,
    `    } catch {\n      if (field.value) {\n        page.drawText(sanitize(field.value), {`,
    `    } catch {\n      const fallbackValue = field.value === "Signed" ? "" : field.value;\n      if (fallbackValue) {\n        page.drawText(sanitize(fallbackValue), {`,
    "client signature fallback",
  );

  writeIfChanged(path, text);
}

function patchFillPdfRoute() {
  const path = "src/app/api/fill-pdf/route.ts";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `  } else if (field.type === "signature" && field.signatureDataUrl) {\n    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, finalPdfY, pdfW, pdfH, field.value, signatureFont, field.fontSize ?? 16);\n  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {`,
    `  } else if (field.type === "signature" && field.signatureDataUrl) {\n    const fallbackText = field.value && field.value !== "Signed" ? field.value : "";\n    await drawSignatureImage(pdfDoc, page, field.signatureDataUrl, pdfX, finalPdfY, pdfW, pdfH, fallbackText, signatureFont, field.fontSize ?? 16);\n  } else if (field.type === "text" || field.type === "date" || field.type === "signature") {`,
    "server signature fallback",
  );

  writeIfChanged(path, text);
}

function patchSignatureModal() {
  const path = "src/components/SignatureModal.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `  const handlePhotoFile = useCallback(async (file: File | null | undefined) => {`,
    `  const openCameraPicker = useCallback(() => {\n    if (cameraInputRef.current) cameraInputRef.current.value = "";\n    cameraInputRef.current?.click();\n  }, []);\n\n  const openImagePicker = useCallback(() => {\n    if (fileInputRef.current) fileInputRef.current.value = "";\n    fileInputRef.current?.click();\n  }, []);\n\n  const handlePhotoFile = useCallback(async (file: File | null | undefined) => {`,
    "photo picker helpers",
  );

  text = replaceOnce(
    text,
    `                    capture="environment"\n                    className="hidden"\n                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}`,
    `                    capture="environment"\n                    className="hidden"\n                    onClick={(event) => { event.currentTarget.value = ""; }}\n                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}`,
    "camera input reset",
  );

  text = replaceOnce(
    text,
    `                    accept="image/*"\n                    className="hidden"\n                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}`,
    `                    accept="image/*"\n                    className="hidden"\n                    onClick={(event) => { event.currentTarget.value = ""; }}\n                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}`,
    "image input reset",
  );

  text = text.replaceAll(`onClick={() => cameraInputRef.current?.click()}`, `onClick={openCameraPicker}`);
  text = text.replaceAll(`onClick={() => fileInputRef.current?.click()}`, `onClick={openImagePicker}`);

  text = replaceFirstAvailable(
    text,
    [
      {
        search: `                      onClick={photoSignature ? resetPhoto : () => cameraInputRef.current?.click()}\n                      title={photoSignature ? "Retake" : "Camera"}`,
        replacement: `                      onClick={photoSignature ? () => { resetPhoto(); window.setTimeout(openImagePicker, 0); } : openCameraPicker}\n                      title={photoSignature ? "Choose another image" : "Camera"}`,
      },
      {
        search: `                      onClick={photoSignature ? resetPhoto : openCameraPicker}\n                      title={photoSignature ? "Retake" : "Camera"}`,
        replacement: `                      onClick={photoSignature ? () => { resetPhoto(); window.setTimeout(openImagePicker, 0); } : openCameraPicker}\n                      title={photoSignature ? "Choose another image" : "Camera"}`,
      },
    ],
    "photo replace action",
  );

  text = replaceOnce(
    text,
    `{photoSignature ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}`,
    `{photoSignature ? <ImagePlus className="h-4 w-4" /> : <Camera className="h-4 w-4" />}`,
    "photo replace icon",
  );

  writeIfChanged(path, text);
}

function patchContextPanel() {
  const path = "src/components/ContextPanel.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = text.replace("max-h-[42svh]", "max-h-[52svh]");

  text = replaceOnce(
    text,
    `      {selectedField.type !== "whiteout" && (\n        <Section label="Move">`,
    `      {selectedField.type !== "whiteout" && (\n        <Section label="Position">`,
    "position label",
  );

  text = replaceOnce(
    text,
    `      {selectedField.type !== "whiteout" && (\n        <Section label="Position">\n          <div className="mx-auto grid max-w-[180px] grid-cols-3 gap-2">\n            <span aria-hidden="true" />\n            <NudgeButton label="Move up" icon={ArrowUp} onClick={() => nudgeField(0, -2)} />\n            <span aria-hidden="true" />\n            <NudgeButton label="Move left" icon={ArrowLeft} onClick={() => nudgeField(-2, 0)} />\n            <button\n              onClick={onFieldDeselect}\n              className="flex h-10 items-center justify-center rounded-xl border border-border bg-surface-alt px-3 text-xs font-bold text-text-muted"\n            >\n              Done\n            </button>\n            <NudgeButton label="Move right" icon={ArrowRight} onClick={() => nudgeField(2, 0)} />\n            <span aria-hidden="true" />\n            <NudgeButton label="Move down" icon={ArrowDown} onClick={() => nudgeField(0, 2)} />\n            <span aria-hidden="true" />\n          </div>\n        </Section>\n      )}\n\n      <Section>`,
    `      {selectedField.type !== "whiteout" && (\n        <Section label="Position">\n          <div className="mx-auto grid max-w-[180px] grid-cols-3 gap-2">\n            <span aria-hidden="true" />\n            <NudgeButton label="Move up" icon={ArrowUp} onClick={() => nudgeField(0, -2)} />\n            <span aria-hidden="true" />\n            <NudgeButton label="Move left" icon={ArrowLeft} onClick={() => nudgeField(-2, 0)} />\n            <button\n              onClick={onFieldDeselect}\n              className="flex h-10 items-center justify-center rounded-xl border border-border bg-surface-alt px-3 text-xs font-bold text-text-muted"\n            >\n              Done\n            </button>\n            <NudgeButton label="Move right" icon={ArrowRight} onClick={() => nudgeField(2, 0)} />\n            <span aria-hidden="true" />\n            <NudgeButton label="Move down" icon={ArrowDown} onClick={() => nudgeField(0, 2)} />\n            <span aria-hidden="true" />\n          </div>\n        </Section>\n      )}\n\n      {selectedField.type !== "checkbox" && selectedField.type !== "whiteout" && (\n        <MobileSizeButtons selectedField={selectedField} onFieldUpdate={onFieldUpdate} />\n      )}\n\n      <Section>`,
    "mobile size controls",
  );

  text = replaceOnce(
    text,
    `function NudgeButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Type; onClick: () => void }) {`,
    `function MobileSizeButtons({\n  selectedField,\n  onFieldUpdate,\n}: {\n  selectedField: EditorField;\n  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;\n}) {\n  const scaleField = (scale: number) => {\n    const minWidth = selectedField.type === "signature" ? 48 : 20;\n    const minHeight = selectedField.type === "signature" ? 18 : 10;\n    onFieldUpdate(selectedField.id, {\n      width: Math.max(minWidth, Math.round(selectedField.width * scale)),\n      height: Math.max(minHeight, Math.round(selectedField.height * scale)),\n    } as Partial<EditorField>);\n  };\n\n  return (\n    <Section label="Size">\n      <div className="grid grid-cols-2 gap-2">\n        <button\n          onClick={() => scaleField(0.9)}\n          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface-alt text-xs font-bold text-text-muted transition-colors hover:border-accent hover:text-accent"\n        >\n          <Minus className="h-4 w-4" />\n          Smaller\n        </button>\n        <button\n          onClick={() => scaleField(1.1)}\n          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface-alt text-xs font-bold text-text-muted transition-colors hover:border-accent hover:text-accent"\n        >\n          <Plus className="h-4 w-4" />\n          Larger\n        </button>\n      </div>\n    </Section>\n  );\n}\n\nfunction NudgeButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Type; onClick: () => void }) {`,
    "MobileSizeButtons component",
  );

  writeIfChanged(path, text);
}

function patchPdfViewer() {
  const path = "src/components/PdfViewer.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `          const selectedField = selectedFieldId ? pageFields.find(f => f.id === selectedFieldId) : null;\n          const selectedFieldIsSnapped = selectedField?.snapped ?? false;\n          return (`,
    `          const selectedField = selectedFieldId ? pageFields.find(f => f.id === selectedFieldId) : null;\n          const selectedFieldIsSnapped = selectedField?.snapped ?? false;\n          const mobileSignatureHandles = isMobileEditor && selectedField?.type === "signature";\n          return (`,
    "mobile transformer state",
  );

  text = replaceOnce(
    text,
    `              anchorSize={8}\n              // BUG 3 FIX: Always enable all 8 anchors for resizing\n              // Remove the conditional that disabled anchors for snapped fields\n              enabledAnchors={["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"]}`,
    `              anchorSize={isMobileEditor ? 14 : 8}\n              anchorCornerRadius={isMobileEditor ? 7 : 0}\n              anchorStrokeWidth={isMobileEditor ? 2 : 1}\n              borderStrokeWidth={isMobileEditor ? 2 : 1}\n              padding={isMobileEditor ? 6 : 0}\n              enabledAnchors={mobileSignatureHandles\n                ? ["top-left", "top-right", "bottom-right", "bottom-left"]\n                : ["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"]}`,
    "mobile transformer handles",
  );

  writeIfChanged(path, text);
}

patchEditorPage();
patchPdfUtils();
patchFillPdfRoute();
patchSignatureModal();
patchContextPanel();
patchPdfViewer();
