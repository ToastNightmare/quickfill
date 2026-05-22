import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = readFileSync(path, "utf8");
  if (current !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing ${label}`);
  return text.replace(search, replacement);
}

function insertOnceAfter(text, anchor, insertion, label) {
  if (text.includes(insertion.trim())) return text;
  if (!text.includes(anchor)) throw new Error(`Missing ${label}`);
  return text.replace(anchor, `${anchor}${insertion}`);
}

const editorPath = "src/app/editor/page.tsx";
let editor = normalize(readFileSync(editorPath, "utf8"));

editor = insertOnceAfter(
  editor,
  `  const [showRestoredBanner, setShowRestoredBanner] = useState(false);\n`,
  `  const [savedDraftName, setSavedDraftName] = useState<string | null>(null);\n`,
  "restored banner state",
);

editor = insertOnceAfter(
  editor,
  `  const dismissWelcome = useCallback(() => {\n    localStorage.setItem("qf_welcome_dismissed", "1");\n    setShowWelcome(false);\n  }, []);\n`,
  `\n  const restoreSavedDraft = useCallback(async (savedPdf?: ArrayBuffer | null) => {\n    const draftPdf = savedPdf ?? await loadPdfFromIndexedDB();\n    if (!draftPdf) {\n      setSavedDraftName(null);\n      initialRestoreDoneRef.current = true;\n      return;\n    }\n\n    const savedFields = normalizeRestoredFields(loadFieldsFromLocalStorage());\n    const savedPage = loadPageFromLocalStorage();\n    const savedName = loadFileNameFromLocalStorage();\n\n    setPdfBytes(draftPdf);\n    setFileName(savedName);\n    setCurrentPage(savedPage);\n    if (savedFields.length > 0) {\n      reset(savedFields);\n      saveFieldsToLocalStorage(savedFields);\n    } else {\n      reset([]);\n    }\n    setSavedDraftName(null);\n    setShowRestoredBanner(true);\n    setTimeout(() => setShowRestoredBanner(false), 3000);\n    pollCanvasForContent(pdfViewerRef, setMinimapCanvas);\n\n    initialRestoreDoneRef.current = true;\n\n    try {\n      const acroFields = await detectAcroFormFields(draftPdf);\n      setHasAcroForm(acroFields.length > 0);\n    } catch {\n      setHasAcroForm(false);\n    }\n  }, [reset]);\n`,
  "dismiss welcome callback",
);

editor = replaceOnce(
  editor,
  `    restoredRef.current = true;\n\n    // Restore zoom`,
  `    restoredRef.current = true;\n\n    const params = new URLSearchParams(window.location.search);\n    const startFreshUpload = params.get("upload") === "1" || params.get("new") === "1";\n\n    // Restore zoom`,
  "fresh upload route flag",
);

editor = replaceOnce(
  editor,
  `    loadPdfFromIndexedDB().then(async (savedPdf) => {\n      if (!savedPdf) return;`,
  `    loadPdfFromIndexedDB().then(async (savedPdf) => {\n      if (!savedPdf) {\n        initialRestoreDoneRef.current = true;\n        return;\n      }\n\n      if (startFreshUpload) {\n        const savedName = loadFileNameFromLocalStorage();\n        setSavedDraftName(savedName || "previous PDF");\n        initialRestoreDoneRef.current = true;\n        return;\n      }`,
  "skip restore for fresh upload route",
);

editor = replaceOnce(
  editor,
  `        setPdfBytes(bytes);\n        setFileName(file.name);\n\n        // Persist PDF and filename`,
  `        setPdfBytes(bytes);\n        setFileName(file.name);\n        const uploadParams = new URLSearchParams(window.location.search);\n        if (uploadParams.has("upload") || uploadParams.has("new")) {\n          uploadParams.delete("upload");\n          uploadParams.delete("new");\n          const nextQuery = uploadParams.toString();\n          const nextUrl = window.location.pathname + (nextQuery ? "?" + nextQuery : "");\n          window.history.replaceState(null, "", nextUrl);\n        }\n\n        // Persist PDF and filename`,
  "upload query cleanup",
);

editor = replaceOnce(
  editor,
  `          <UploadZone onFileLoad={handleFileLoad} />`,
  `          {savedDraftName && (\n            <div className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-accent/20 bg-accent/5 px-5 py-4 sm:mx-8 sm:flex-row sm:items-center sm:justify-between">\n              <div>\n                <p className="text-sm font-semibold text-text">Previous PDF saved</p>\n                <p className="mt-1 text-xs leading-relaxed text-text-muted">Continue {savedDraftName}, or upload a new PDF below.</p>\n              </div>\n              <button\n                type="button"\n                onClick={() => { void restoreSavedDraft(); }}\n                className="h-10 rounded-lg bg-surface px-4 text-sm font-semibold text-accent shadow-sm ring-1 ring-border transition-colors hover:bg-white"\n              >\n                Continue previous PDF\n              </button>\n            </div>\n          )}\n          <UploadZone onFileLoad={handleFileLoad} />`,
  "saved draft prompt",
);

writeIfChanged(editorPath, editor);
