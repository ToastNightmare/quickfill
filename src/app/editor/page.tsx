"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Sparkles, X, RotateCcw, Minus, Plus, Download } from "lucide-react";
import { UploadZone } from "@/components/UploadZone";
import { Toolbar } from "@/components/Toolbar";
import { PdfViewer } from "@/components/PdfViewer";
import { FieldInspector } from "@/components/FieldInspector";
import { SignatureModal } from "@/components/SignatureModal";
import type { PdfViewerHandle } from "@/components/PdfViewer";
import { useHistory } from "@/lib/use-history";
import { detectAcroFormFields, fillPdf } from "@/lib/pdf-utils";
import {
  savePdfToIndexedDB,
  loadPdfFromIndexedDB,
  saveFieldsToLocalStorage,
  loadFieldsFromLocalStorage,
  savePageToLocalStorage,
  loadPageFromLocalStorage,
  saveFileNameToLocalStorage,
  loadFileNameFromLocalStorage,
  clearEditorState,
  saveZoomToLocalStorage,
  loadZoomFromLocalStorage,
} from "@/lib/persistence";
import type { EditorField, ToolType } from "@/lib/types";

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];

// Profile field matching keywords
const PROFILE_MATCHERS: { key: string; keywords: string[] }[] = [
  { key: "fullName", keywords: ["name", "full name", "fullname", "given name", "applicant"] },
  { key: "email", keywords: ["email", "e-mail", "email address"] },
  { key: "phone", keywords: ["phone", "telephone", "mobile", "tel", "contact number"] },
  { key: "street", keywords: ["address", "street", "address line 1", "address1"] },
  { key: "addressLine2", keywords: ["address line 2", "address2", "apt", "unit", "suite", "floor", "level"] },
  { key: "city", keywords: ["city", "suburb", "town", "locality"] },
  { key: "state", keywords: ["state", "territory", "province", "region"] },
  { key: "postcode", keywords: ["postcode", "post code", "zip", "postal", "post"] },
  { key: "abn", keywords: ["abn", "business number"] },
  { key: "organisation", keywords: ["organisation", "organization", "company", "employer"] },
];

function matchProfileKey(fieldId: string): string | null {
  const lower = fieldId.toLowerCase().replace(/[_\-\.]/g, " ");
  for (const { key, keywords } of PROFILE_MATCHERS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return key;
    }
  }
  return null;
}

export default function EditorPage() {
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasAcroForm, setHasAcroForm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pageScales] = useState(() => new Map<number, number>());
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightFieldIds, setHighlightFieldIds] = useState<Set<string>>(new Set());
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [pendingSignatureField, setPendingSignatureField] = useState<EditorField | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { fields, set: setFields, undo, redo, reset, canUndo, canRedo } = useHistory();
  const restoredRef = useRef(false);
  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Load saved signature on mount
  useEffect(() => {
    fetch("/api/signature")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.signatureDataUrl) {
          setSavedSignature(data.signatureDataUrl);
        }
      })
      .catch(() => {});
  }, []);

  // Show welcome banner for first-time users
  useEffect(() => {
    const dismissed = localStorage.getItem("qf_welcome_dismissed");
    if (!dismissed) setShowWelcome(true);
  }, []);

  const dismissWelcome = useCallback(() => {
    localStorage.setItem("qf_welcome_dismissed", "1");
    setShowWelcome(false);
  }, []);

  // Restore session on mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // Restore zoom
    setZoom(loadZoomFromLocalStorage());

    loadPdfFromIndexedDB().then(async (savedPdf) => {
      if (!savedPdf) return;
      const savedFields = loadFieldsFromLocalStorage();
      const savedPage = loadPageFromLocalStorage();
      const savedName = loadFileNameFromLocalStorage();

      setPdfBytes(savedPdf);
      setFileName(savedName);
      setCurrentPage(savedPage);
      if (savedFields.length > 0) {
        reset(savedFields);
      }
      setShowRestoredBanner(true);
      setTimeout(() => setShowRestoredBanner(false), 3000);

      // Detect AcroForm for progress tracking
      try {
        const acroFields = await detectAcroFormFields(savedPdf);
        if (acroFields.length > 0) setHasAcroForm(true);
      } catch {
        // silent
      }
    });
  }, [reset]);

  // Persist fields on change
  useEffect(() => {
    if (pdfBytes) {
      saveFieldsToLocalStorage(fields);
    }
  }, [fields, pdfBytes]);

  // Persist page on change
  useEffect(() => {
    if (pdfBytes) {
      savePageToLocalStorage(currentPage);
    }
  }, [currentPage, pdfBytes]);

  // Persist zoom on change
  useEffect(() => {
    saveZoomToLocalStorage(zoom);
  }, [zoom]);

  const selectedField = useMemo(() => {
    if (!selectedFieldId) return null;
    return fields.find((f) => f.id === selectedFieldId) ?? null;
  }, [fields, selectedFieldId]);

  const inspectorPosition = useMemo(() => {
    if (!selectedField || !viewerContainerRef.current) return null;
    const rect = viewerContainerRef.current.getBoundingClientRect();
    const zoomFactor = zoom / 100;
    // Center above the field, with the triangle pointing down at it
    const fieldCenterX = rect.left + (selectedField.x + selectedField.width / 2) * zoomFactor;
    const inspectorWidth = 176; // w-44 = 11rem = 176px
    const x = fieldCenterX - inspectorWidth / 2;
    // Estimate inspector height: ~80px for checkbox, ~110px for text fields with font size
    const estimatedHeight = selectedField.type === "checkbox" ? 80 : 110;
    const fieldTopY = rect.top + selectedField.y * zoomFactor;
    const y = fieldTopY - estimatedHeight - 6; // 6px gap for triangle
    // Keep within viewport
    const clampedX = Math.max(8, Math.min(x, window.innerWidth - inspectorWidth - 8));
    const clampedY = Math.max(8, y);
    return { x: clampedX, y: clampedY };
  }, [selectedField, zoom]);

  const totalFilledCount = useMemo(() => {
    return fields.filter((f) => {
      if (f.type === "checkbox") return f.checked;
      if ("value" in f) return (f as { value: string }).value !== "";
      return false;
    }).length;
  }, [fields]);

  const totalFieldCount = fields.length;

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => ZOOM_LEVELS.find((z) => z > prev) ?? prev);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => [...ZOOM_LEVELS].reverse().find((z) => z < prev) ?? prev);
  }, []);

  const handleFileLoad = useCallback(
    async (file: File, bytes: ArrayBuffer) => {
      setIsLoading(true);
      try {
        setPdfBytes(bytes);
        setFileName(file.name);
        setCurrentPage(0);
        setSelectedFieldId(null);
        setActiveTool(null);

        // Persist PDF and filename
        savePdfToIndexedDB(bytes);
        saveFileNameToLocalStorage(file.name);

        // Detect AcroForm fields
        try {
          const acroFields = await detectAcroFormFields(bytes);
          if (acroFields.length > 0) {
            setHasAcroForm(true);
            const editorFields: EditorField[] = acroFields.map((af) => {
              if (af.type === "checkbox") {
                return {
                  id: af.name,
                  type: "checkbox" as const,
                  x: af.x,
                  y: af.y,
                  width: af.width,
                  height: af.height,
                  page: af.page,
                  checked: false,
                };
              }
              return {
                id: af.name,
                type: "text" as const,
                x: af.x,
                y: af.y,
                width: af.width,
                height: af.height,
                page: af.page,
                value: af.value,
                fontSize: 12,
              };
            });
            reset(editorFields);
          } else {
            setHasAcroForm(false);
            reset([]);
          }
        } catch {
          setHasAcroForm(false);
          reset([]);
        }
      } catch {
        setPdfBytes(null);
        setToast("This PDF could not be opened. It may be encrypted or corrupted. Try a different file.");
        setTimeout(() => setToast(null), 5000);
      } finally {
        setIsLoading(false);
      }
    },
    [reset]
  );

  const handleFieldAdd = useCallback(
    (field: EditorField) => {
      setFields((prev) => [...prev, field]);
    },
    [setFields]
  );

  const handleFieldUpdate = useCallback(
    (id: string, updates: Partial<EditorField>) => {
      setFields((prev) =>
        prev.map((f) => (f.id === id ? ({ ...f, ...updates } as EditorField) : f))
      );
    },
    [setFields]
  );

  const handleFieldDelete = useCallback(
    (id: string) => {
      setFields((prev) => prev.filter((f) => f.id !== id));
      if (selectedFieldId === id) setSelectedFieldId(null);
    },
    [setFields, selectedFieldId]
  );

  const handleFieldDuplicate = useCallback(
    (id: string) => {
      const source = fields.find((f) => f.id === id);
      if (!source) return;
      const newId = `dup-${Date.now()}`;
      const dup = { ...source, id: newId, x: source.x + 12, y: source.y + 12 } as EditorField;
      setFields((prev) => [...prev, dup]);
      setSelectedFieldId(newId);
    },
    [fields, setFields]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") || ((e.ctrlKey || e.metaKey) && e.key === "y")) {
        e.preventDefault();
        redo();
      }
      // Delete selected field: Delete or Backspace
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFieldId) {
        e.preventDefault();
        handleFieldDelete(selectedFieldId);
      }
      // Duplicate selected field: Ctrl+D / Cmd+D
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedFieldId) {
        e.preventDefault();
        handleFieldDuplicate(selectedFieldId);
      }
      // Escape: deselect
      if (e.key === "Escape") {
        setSelectedFieldId(null);
        setActiveTool(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedFieldId, handleFieldDelete, handleFieldDuplicate]);


  const handleClear = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  const confirmClear = useCallback(() => {
    setFields([]);
    setSelectedFieldId(null);
    setShowClearConfirm(false);
  }, [setFields]);

  const handleFontSizeChange = useCallback(
    (size: number) => {
      if (selectedFieldId) {
        handleFieldUpdate(selectedFieldId, { fontSize: size } as Partial<EditorField>);
      }
    },
    [selectedFieldId, handleFieldUpdate]
  );

  const handleStartOver = useCallback(() => {
    clearEditorState();
    setPdfBytes(null);
    setFileName("");
    setCurrentPage(0);
    setTotalPages(0);
    setHasAcroForm(false);
    setSelectedFieldId(null);
    setActiveTool(null);
    reset([]);
  }, [reset]);

  const showToast = useCallback((msg: string, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }, []);

  const handleAutoFillFromProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        showToast("Sign in and save your profile first");
        return;
      }
      const profile = await res.json();
      if (!profile || !profile.fullName) {
        showToast("No profile saved yet  -  go to your Profile page to set one up");
        return;
      }

      let matched = 0;
      setFields((prev) =>
        prev.map((f) => {
          if (f.type === "checkbox") return f;
          const profileKey = matchProfileKey(f.id);
          if (profileKey && profile[profileKey]) {
            matched++;
            return { ...f, value: profile[profileKey] } as EditorField;
          }
          return f;
        })
      );

      if (matched > 0) {
        showToast(`Auto-filled ${matched} field${matched > 1 ? "s" : ""} from your profile`);
      } else {
        showToast("No matching fields found  -  try filling manually");
      }
    } catch {
      showToast("Failed to load profile");
    }
  }, [setFields, showToast]);

  // Called by PdfViewer after a signature field is placed
  const handleSignatureFieldPlaced = useCallback(
    (fieldId: string) => {
      if (savedSignature) {
        // Auto-apply saved signature to the field
        setFields((prev) =>
          prev.map((f) =>
            f.id === fieldId && f.type === "signature"
              ? { ...f, signatureDataUrl: savedSignature, value: "Signed" } as EditorField
              : f
          )
        );
      } else {
        // No saved signature - open modal to draw one
        const field = fields.find((f) => f.id === fieldId);
        if (field) {
          setPendingSignatureField(field);
          setSignatureModalOpen(true);
        }
      }
    },
    [savedSignature, setFields, fields]
  );

  const handleSignatureModalSave = useCallback(
    async (dataUrl: string) => {
      // Save to account
      try {
        await fetch("/api/signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signatureDataUrl: dataUrl }),
        });
        setSavedSignature(dataUrl);
      } catch {
        // Still apply locally even if account save fails
      }

      // Apply to pending field
      if (pendingSignatureField) {
        setFields((prev) =>
          prev.map((f) =>
            f.id === pendingSignatureField.id && f.type === "signature"
              ? { ...f, signatureDataUrl: dataUrl, value: "Signed" } as EditorField
              : f
          )
        );
      }
      setPendingSignatureField(null);
      setSignatureModalOpen(false);
    },
    [pendingSignatureField, setFields]
  );

  const handleSignatureModalUseExisting = useCallback(() => {
    if (pendingSignatureField && savedSignature) {
      setFields((prev) =>
        prev.map((f) =>
          f.id === pendingSignatureField.id && f.type === "signature"
            ? { ...f, signatureDataUrl: savedSignature, value: "Signed" } as EditorField
            : f
        )
      );
    }
    setPendingSignatureField(null);
    setSignatureModalOpen(false);
  }, [pendingSignatureField, savedSignature, setFields]);

  const handleDownload = useCallback(async () => {
    if (!pdfBytes) return;
    setIsDownloading(true);
    try {
      // Check usage before downloading
      let isPro = false;
      const usageRes = await fetch("/api/usage");
      if (usageRes.ok) {
        const usage = await usageRes.json();
        isPro = usage.isPro;
        if (!isPro && usage.used >= usage.limit) {
          setShowUpgradeModal(true);
          setIsDownloading(false);
          return;
        }
      }

      const addWatermark = !isPro;
      const result = await fillPdf(pdfBytes, fields, pageScales, hasAcroForm, addWatermark);
      const blob = new Blob([result.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + "-filled.pdf";
      a.click();
      URL.revokeObjectURL(url);

      // Increment usage after successful download
      await fetch("/api/usage", { method: "POST" });

      // Save fill history
      try {
        await fetch("/api/fills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: fileName,
            filledAt: new Date().toISOString(),
            fieldCount: fields.length,
            pageCount: totalPages || 1,
          }),
        });
      } catch {
        // silent  -  non-critical
      }

      if (addWatermark) {
        showToast("Download includes QuickFill watermark. Upgrade to Pro to remove it.", 5000);
      }
    } catch (err) {
      console.error("Download failed:", err);
      showToast("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [pdfBytes, fields, pageScales, hasAcroForm, fileName, totalPages, showToast]);

  const handlePageScaleSet = useCallback(
    (page: number, scale: number) => {
      pageScales.set(page, scale);
    },
    [pageScales]
  );

  const handleDetectFields = useCallback(async () => {
    if (!pdfViewerRef.current) return;

    setIsDetecting(true);
    const zoomFactor = zoom / 100;

    try {
      // --- Layer 1: Visual batch detection (always available, no API needed) ---
      let visualFields: EditorField[] = [];
      try {
        const { detectAllBoxes } = await import("@/lib/snap-detect");
        // Get canvas data URL and render onto temp canvas for scanning
        const dataUrl = pdfViewerRef.current.getCanvasDataURL();
        const dims = pdfViewerRef.current.getCanvasDimensions();
        if (dataUrl && dims.width > 0 && dims.height > 0) {
          const tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = dims.width;
          tmpCanvas.height = dims.height;
          const tmpCtx = tmpCanvas.getContext("2d");
          if (tmpCtx) {
            const img = new Image();
            await new Promise<void>((resolve) => {
              img.onload = () => { tmpCtx.drawImage(img, 0, 0); resolve(); };
              img.onerror = () => resolve();
              img.src = dataUrl;
            });
            const boxes = detectAllBoxes(tmpCanvas);
            if (boxes.length > 0) {
              visualFields = boxes.map((box, i) => {
                const id = `vis-${Date.now()}-${i}`;
                const fieldH = box.height / zoomFactor;
                const inferredFontSize = Math.max(8, Math.min(36, Math.round(fieldH * 0.65)));
                return {
                  id,
                  type: "text" as const,
                  x: box.x / zoomFactor,
                  y: box.y / zoomFactor,
                  width: box.width / zoomFactor,
                  height: fieldH,
                  page: currentPage,
                  value: "",
                  fontSize: inferredFontSize,
                  snapped: true,
                  snapBounds: {
                    x: box.x / zoomFactor,
                    y: box.y / zoomFactor,
                    width: box.width / zoomFactor,
                    height: fieldH,
                  },
                } satisfies EditorField;
              });
            }
          }
        }
      } catch {
        // Visual detection failed silently
      }

      // --- Layer 2: AI detection (if configured, enhances visual results) ---
      let aiFields: EditorField[] = [];
      try {
        const imageBase64 = pdfViewerRef.current.getCanvasDataURL();
        const dims = pdfViewerRef.current.getCanvasDimensions();
        if (imageBase64) {
          const res = await fetch("/api/detect-fields", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64,
              pageWidth: dims.width,
              pageHeight: dims.height,
            }),
          });
          const data = await res.json();
          if (!data.error && data.fields && data.fields.length > 0) {
            aiFields = data.fields.map(
              (f: { label?: string; type?: string; x: number; y: number; width: number; height: number }, i: number) => {
                const id = `ai-${Date.now()}-${i}`;
                const fieldType = (f.type === "checkbox" || f.type === "signature" || f.type === "date") ? f.type : "text";
                if (fieldType === "checkbox") {
                  return {
                    id, type: "checkbox" as const,
                    x: f.x / zoomFactor, y: f.y / zoomFactor,
                    width: f.width / zoomFactor, height: f.height / zoomFactor,
                    page: currentPage, checked: false,
                  };
                }
                return {
                  id, type: fieldType as "text" | "signature" | "date",
                  x: f.x / zoomFactor, y: f.y / zoomFactor,
                  width: f.width / zoomFactor, height: f.height / zoomFactor,
                  page: currentPage,
                  value: fieldType === "date" ? new Date().toLocaleDateString("en-AU") : "",
                  fontSize: fieldType === "signature" ? 16 : 14,
                };
              }
            );
          }
        }
      } catch {
        // AI detection unavailable, continue with visual results
      }

      // --- Merge: visual first, AI fields that don't overlap ---
      const allDetected = [...visualFields];
      for (const aiField of aiFields) {
        const overlaps = allDetected.some((vf) => {
          const overlapX = Math.max(0, Math.min(aiField.x + aiField.width, vf.x + vf.width) - Math.max(aiField.x, vf.x));
          const overlapY = Math.max(0, Math.min(aiField.y + aiField.height, vf.y + vf.height) - Math.max(aiField.y, vf.y));
          const aiArea = aiField.width * aiField.height;
          return aiArea > 0 && (overlapX * overlapY) / aiArea > 0.4;
        });
        if (!overlaps) allDetected.push(aiField);
      }

      if (allDetected.length === 0) {
        showToast("No fields detected - click boxes to snap, or place fields manually");
        return;
      }

      const newIds = new Set(allDetected.map((f) => f.id));
      setFields((prev) => [...prev, ...allDetected]);
      setHighlightFieldIds(newIds);
      setTimeout(() => setHighlightFieldIds(new Set()), 2000);

      const sourceLabel = aiFields.length > 0 && visualFields.length > 0
        ? "visual + AI" : aiFields.length > 0 ? "AI" : "visual";
      showToast(`Detected ${allDetected.length} fields (${sourceLabel}) - review and fill`);
    } catch (err) {
      console.error("Field detection failed:", err);
      showToast("Detection failed - click boxes to snap, or place fields manually");
    } finally {
      setIsDetecting(false);
    }
  }, [currentPage, zoom, setFields, showToast]);

  if (!pdfBytes) {
    return (
      <>
        {isLoading && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/80">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-accent border-t-transparent" />
              <p className="text-sm font-medium text-text-muted">Loading PDF...</p>
            </div>
          </div>
        )}
        {showWelcome && (
          <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="flex-1 text-sm">
              <span className="font-semibold text-accent">Welcome to QuickFill!</span>
              <span className="ml-1 text-text-muted">Upload any PDF form to get started — it takes less than 60 seconds.</span>
            </div>
            <button onClick={dismissWelcome} className="shrink-0 text-text-muted hover:text-text transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <UploadZone onFileLoad={handleFileLoad} />
      </>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-accent border-t-transparent" />
            <p className="text-sm font-medium text-text-muted">Loading PDF...</p>
          </div>
        </div>
      )}

      {/* Session restored banner */}
      {showRestoredBanner && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg bg-accent/90 px-4 py-2 text-sm font-medium text-white shadow-lg animate-fade-in">
          Session restored
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg animate-fade-in max-w-md text-center">
          {toast}
        </div>
      )}

      {/* Top bar with file name, zoom, progress, and page nav */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 flex-shrink-0">
          {/* Left: filename + start over */}
          <div className="flex items-center gap-2 min-w-0">
            <p className="truncate text-sm font-medium text-text-muted">{fileName}</p>
            <button
              onClick={handleStartOver}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
              title="Clear & Start Over"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Start Over</span>
            </button>
          </div>

          {/* Center: zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= ZOOM_LEVELS[0]}
              title="Zoom Out"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[3rem] text-center text-xs tabular-nums text-text-muted select-none">
              {zoom}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              title="Zoom In"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(100)}
              title="Fit to Page"
              className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
            >
              Fit
            </button>
          </div>

          {/* Right: progress + page nav */}
          <div className="flex items-center gap-4">
            {/* AcroForm progress indicator */}
            {hasAcroForm && totalFieldCount > 0 && (
              <div className="hidden items-center gap-2 sm:flex">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-alt">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{
                      width: `${Math.round((totalFilledCount / totalFieldCount) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs tabular-nums text-text-muted whitespace-nowrap">
                  {totalFilledCount} of {totalFieldCount} filled{totalPages > 1 ? " (all pages)" : ""}
                </span>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-alt transition-colors disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm tabular-nums text-text-muted">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage === totalPages - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-alt transition-colors disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

      {/* Sidebar + Canvas row */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-shrink-0 h-full overflow-y-auto hidden sm:flex">
          <Toolbar
            activeTool={activeTool}
            onToolSelect={setActiveTool}
            onUndo={undo}
            onRedo={redo}
            onClear={handleClear}
            onDownload={handleDownload}
            canUndo={canUndo}
            canRedo={canRedo}
            isDownloading={isDownloading}
            selectedField={selectedField}
            onFontSizeChange={handleFontSizeChange}
            onDetectFields={handleDetectFields}
            isDetecting={isDetecting}
            onAutoFill={handleAutoFillFromProfile}
          />
        </div>

        <div ref={viewerContainerRef} className="flex-1 h-full overflow-auto">
          <PdfViewer
            ref={pdfViewerRef}
            pdfBytes={pdfBytes}
            currentPage={currentPage}
            fields={fields}
            activeTool={activeTool}
            selectedFieldId={selectedFieldId}
            onFieldAdd={handleFieldAdd}
            onFieldUpdate={handleFieldUpdate}
            onFieldSelect={setSelectedFieldId}
            onToolSelect={setActiveTool}
            onFieldDelete={handleFieldDelete}
            onFieldDuplicate={handleFieldDuplicate}
            onPageScaleSet={handlePageScaleSet}
            totalPages={totalPages}
            onTotalPagesChange={setTotalPages}
            zoom={zoom}
            highlightFieldIds={highlightFieldIds}
            onSignatureFieldPlaced={handleSignatureFieldPlaced}
          />
        </div>
      </div>

      {/* Floating field inspector */}
      {selectedField && inspectorPosition && (
        <FieldInspector
          field={selectedField}
          onUpdate={handleFieldUpdate}
          onDelete={handleFieldDelete}
          onDeselect={() => setSelectedFieldId(null)}
          position={inspectorPosition}
        />
      )}

      {/* Floating bottom action bar */}
      {pdfBytes && totalPages > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 hidden sm:flex items-center gap-2 rounded-full bg-navy shadow-xl border border-white/10 px-4 py-2">
          <span className="text-xs text-white/70 font-medium">{currentPage + 1} / {totalPages}</span>
          <div className="w-px h-4 bg-white/20" />
          <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-white/20" />
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {isDownloading ? "Saving..." : "Download"}
          </button>
        </div>
      )}

      {/* Mobile bottom toolbar */}
      <Toolbar
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        onUndo={undo}
        onRedo={redo}
        onClear={handleClear}
        onDownload={handleDownload}
        canUndo={canUndo}
        canRedo={canRedo}
        isDownloading={isDownloading}
        selectedField={selectedField}
        onFontSizeChange={handleFontSizeChange}
        onDetectFields={handleDetectFields}
        isDetecting={isDetecting}
        onAutoFill={handleAutoFillFromProfile}
        mobile
      />

      {/* Signature modal for editor */}
      <SignatureModal
        open={signatureModalOpen}
        onClose={() => {
          setSignatureModalOpen(false);
          setPendingSignatureField(null);
        }}
        onSave={handleSignatureModalSave}
        existingSignature={savedSignature}
        useMode
        onUseExisting={handleSignatureModalUseExisting}
      />

      {/* Clear all confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
            <h2 className="text-lg font-bold">Clear all fields?</h2>
            <p className="mt-2 text-sm text-text-muted">This will remove all placed fields. This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={confirmClear}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
                <Sparkles className="h-7 w-7 text-accent" />
              </div>
              <h2 className="mt-4 text-xl font-bold">Free limit reached</h2>
              <p className="mt-2 text-sm text-text-muted">
                You have used all 3 of your free fills this month. Upgrade to Pro for unlimited fills with no watermarks.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <a
                  href="/pricing"
                  className="flex h-11 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                >
                  Upgrade to Pro — $12/month
                </a>
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
