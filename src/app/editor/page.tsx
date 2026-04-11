"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Sparkles, X, RotateCcw, Minus, Plus, Download } from "lucide-react";
import { UploadZone } from "@/components/UploadZone";
import { MobileFiller } from "@/components/MobileFiller";
import { Toolbar } from "@/components/Toolbar";
import { PdfViewer } from "@/components/PdfViewer";
import { ContextPanel } from "@/components/ContextPanel";
import { SignatureModal } from "@/components/SignatureModal";
import type { PdfViewerHandle } from "@/components/PdfViewer";
import { useHistory } from "@/lib/use-history";
import { detectAcroFormFields } from "@/lib/pdf-utils";
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
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];
const SNAP_MIN = 125;
const SNAP_MAX = 175;
// On mobile we allow zooming below SNAP_MIN so the full page fits the screen
const isMobileDevice = () => typeof window !== "undefined" && window.innerWidth < 640;

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
  { key: "dateOfBirth", keywords: ["date of birth", "dob", "birth date", "born"] },
  { key: "gender", keywords: ["gender", "sex", "m/f"] },
  { key: "tfn", keywords: ["tfn", "tax file number", "tax file", "file number"] },
  { key: "medicareNumber", keywords: ["medicare", "medicare number", "medicare card"] },
  { key: "medicareExpiry", keywords: ["medicare expiry", "medicare exp", "card expiry"] },
  { key: "driversLicence", keywords: ["driver", "licence", "license", "drivers licence"] },
  { key: "driversLicenceExpiry", keywords: ["licence expiry", "license expiry", "licence exp", "dl expiry", "dl exp"] },
  { key: "passportNumber", keywords: ["passport", "passport number"] },
  { key: "employer", keywords: ["employer", "employer name", "company name", "business name"] },
  { key: "jobTitle", keywords: ["job title", "occupation", "position", "role"] },
  { key: "bankBsb", keywords: ["bsb", "bank state branch"] },
  { key: "bankAccount", keywords: ["account number", "bank account"] },
  { key: "bankName", keywords: ["bank name", "financial institution", "bank"] },
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

// Poll the canvas for visible content (after PDF render) and update minimap
function pollCanvasForContent(
  pdfViewerRef: React.RefObject<PdfViewerHandle | null>,
  onContent: (canvas: HTMLCanvasElement) => void,
  maxAttempts = 20,
  delayMs = 150,
  initialDelayMs = 400
): void {
  let attempts = 0;
  const poll = () => {
    const canvas = pdfViewerRef.current?.getCanvas();
    if (canvas) {
      try {
        const ctx = canvas.getContext("2d");
        const sample = ctx?.getImageData(canvas.width / 2, canvas.height / 2, 1, 1);
        if (sample && sample.data[3] > 0) {
          onContent(canvas);
          return;
        }
      } catch {
        // Silent
      }
    }
    if (attempts++ < maxAttempts) {
      setTimeout(poll, delayMs);
    }
  };
  setTimeout(poll, initialDelayMs);
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
  const [showGuestSignupPrompt, setShowGuestSignupPrompt] = useState(false);
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
  const [minimapCanvas, setMinimapCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const { fields, set: setFields, undo, redo, reset, canUndo, canRedo } = useHistory();
  const restoredRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Load saved session when PDF is loaded
  useEffect(() => {
    if (!pdfBytes || !fileName) return;

    const loadSession = async () => {
      try {
        const res = await fetch(`/api/session?filename=${encodeURIComponent(fileName)}`);
        if (res.ok) {
          const session = await res.json();
          if (session && session.fields && session.fields.length > 0) {
            reset(session.fields);
            if (typeof session.currentPage === "number") {
              setCurrentPage(session.currentPage);
            }
            setShowRestoredBanner(true);
            setTimeout(() => setShowRestoredBanner(false), 3000);
          }
        }
      } catch {
        // Silent - session load is non-critical
      }
    };

    loadSession();
  }, [pdfBytes, fileName, reset]);

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
      pollCanvasForContent(pdfViewerRef, setMinimapCanvas);

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

  // Persist page on change + update minimap
  useEffect(() => {
    if (pdfBytes) {
      savePageToLocalStorage(currentPage);
      pollCanvasForContent(pdfViewerRef, setMinimapCanvas);
    }
  }, [currentPage, pdfBytes]);

  // Persist zoom on change
  useEffect(() => {
    saveZoomToLocalStorage(zoom);
  }, [zoom]);

  // Auto-save session when fields change (debounced 3 seconds)
  useEffect(() => {
    if (!pdfBytes || !fileName) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 3 seconds
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: fileName,
            fields,
            currentPage,
          }),
        });
      } catch {
        // Silent - auto-save is non-critical
      }
    }, 3000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [fields, currentPage, pdfBytes, fileName]);

  const selectedField = useMemo(() => {
    if (!selectedFieldId) return null;
    return fields.find((f) => f.id === selectedFieldId) ?? null;
  }, [fields, selectedFieldId]);



  const totalFilledCount = useMemo(() => {
    return fields.filter((f) => {
      if (f.type === "checkbox") return f.checked;
      if ("value" in f) return (f as { value: string }).value !== "";
      return false;
    }).length;
  }, [fields]);

  const totalFieldCount = fields.length;

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => ZOOM_LEVELS.find((z) => z > prev && z <= SNAP_MAX) ?? prev);
  }, []);

  const handleZoomOut = useCallback(() => {
    const mobile = isMobileDevice();
    setZoom((prev) => [...ZOOM_LEVELS].reverse().find((z) => z < prev && (mobile || z >= SNAP_MIN)) ?? prev);
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
        // Poll until canvas has content then update minimap
        let attempts = 0;
        const pollCanvas = () => {
          const c = pdfViewerRef.current?.getCanvas();
          if (c) {
            try {
              const ctx = c.getContext("2d");
              const sample = ctx?.getImageData(c.width / 2, c.height / 2, 1, 1);
              if (sample && sample.data[3] > 0) {
                setMinimapCanvas(c);
                return;
              }
            } catch { /* silent */ }
          }
          if (attempts++ < 20) setTimeout(pollCanvas, 150);
        };
        setTimeout(pollCanvas, 300);
      }
    },
    [reset]
  );

  // Load template from URL param
  useEffect(() => {
    if (pdfBytes) return;
    const params = new URLSearchParams(window.location.search);
    const templateParam = params.get("template");
    if (!templateParam) return;
    fetch(`/templates/${templateParam}`)
      .then((r) => r.arrayBuffer())
      .then(async (bytes) => {
        const file = new File([bytes], templateParam, { type: "application/pdf" });
        await handleFileLoad(file, bytes);
      })
      .catch(() => {});
  }, [pdfBytes, handleFileLoad]);

  const handleFieldAdd = useCallback(
    (field: EditorField) => {
      setFields((prev) => [...prev, field]);
      // Deactivate tool - field selection is handled by PdfViewer's createFieldAtPoint
      setActiveTool(null);
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

  const handleSaveProgress = useCallback(async () => {
    if (!fileName) return;
    setSavingProgress(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: fileName,
          fields,
          currentPage,
        }),
      });
      if (res.ok) {
        showToast("Progress saved");
      }
    } catch {
      showToast("Failed to save progress");
    } finally {
      setSavingProgress(false);
    }
  }, [fileName, fields, currentPage, showToast]);

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

  // Called by PdfViewer after a signature field is placed.
  // Receives the full field object directly to avoid stale-closure issues.
  const handleSignatureFieldPlaced = useCallback(
    (field: EditorField) => {
      if (savedSignature) {
        // Auto-apply saved signature to the field
        setFields((prev) =>
          prev.map((f) =>
            f.id === field.id && f.type === "signature"
              ? { ...f, signatureDataUrl: savedSignature, value: "Signed" } as EditorField
              : f
          )
        );
      } else {
        // No saved signature - open modal to draw one
        setPendingSignatureField(field);
        setSignatureModalOpen(true);
      }
    },
    [savedSignature, setFields]
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
      let isGuest = false;
      const usageRes = await fetch("/api/usage");
      if (usageRes.ok) {
        const usage = await usageRes.json();
        isPro = usage.isPro;
        isGuest = usage.tier === "guest";
        
        // Guest mode: check localStorage for already used
        if (isGuest) {
          const guestFillUsed = localStorage.getItem("guestFillUsed");
          if (guestFillUsed === "true") {
            setShowGuestSignupPrompt(true);
            setIsDownloading(false);
            return;
          }
        }
        
        if (!isPro && !isGuest && usage.used >= usage.limit) {
          setShowUpgradeModal(true);
          setIsDownloading(false);
          return;
        }
      }

      const addWatermark = !isPro;

      // Build FormData and send to server-side fill API
      const fd = new FormData();
      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");
      fd.append("fields", JSON.stringify(fields));
      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));
      fd.append("hasAcroForm", String(hasAcroForm));
      fd.append("addWatermark", String(addWatermark));

      const fillRes = await fetch("/api/fill-pdf", { method: "POST", body: fd });
      if (!fillRes.ok) {
        const errBody = await fillRes.json().catch(() => ({ error: "Server error" }));
        throw new Error(errBody.error || `Server responded ${fillRes.status}`);
      }
      const resultBuf = await fillRes.arrayBuffer();

      const blob = new Blob([resultBuf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + "-filled.pdf";
      a.click();
      URL.revokeObjectURL(url);

      // Increment usage after successful download
      const postUsageRes = await fetch("/api/usage", { method: "POST" });
      const postUsage = await postUsageRes.json().catch(() => ({}));
      
      // For guest mode, mark as used in localStorage
      if (postUsage.guest) {
        localStorage.setItem("guestFillUsed", "true");
      }

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

      // For guest mode, show signup prompt after download
      if (isGuest) {
        setShowGuestSignupPrompt(true);
      }

      // Clear saved session after successful download
      try {
        await fetch(`/api/session?filename=${encodeURIComponent(fileName)}`, {
          method: "DELETE",
        });
      } catch {
        // Silent - clearing session is non-critical
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Download failed:", msg, err);
      showToast(`Failed to generate PDF: ${msg}`);
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
        {/* Mobile, dedicated filler flow */}
        <div className="sm:hidden">
          <MobileFiller />
        </div>
        {/* Desktop, full editor upload */}
        <div className="hidden sm:flex sm:flex-col sm:flex-1">
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
                <span className="ml-1 text-text-muted">Upload any PDF form to get started, it takes less than 60 seconds.</span>
              </div>
              <button onClick={dismissWelcome} className="shrink-0 text-text-muted hover:text-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <UploadZone onFileLoad={handleFileLoad} />
        </div>
      </>
    );
  }

  return (
    <>
    {/* Mobile, filler flow (replaces canvas editor entirely) */}
    <div className="sm:hidden">
      <MobileFiller />
    </div>
    {/* Desktop, full canvas editor */}
    <div className="hidden sm:flex sm:flex-col h-[calc(100svh-64px)]">
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
              disabled={zoom <= 50}
              title="Zoom Out"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[3rem] text-center text-xs tabular-nums text-text-muted select-none">
              {zoom}%
            </span>
            {zoom < 125 && (
              <span className="hidden sm:inline text-[10px] text-amber-500 font-medium">↑snap</span>
            )}
            {zoom >= 125 && zoom <= 175 && (
              <span className="hidden sm:inline text-[10px] text-green-500 font-medium">✓snap</span>
            )}
            {zoom > 175 && (
              <span className="hidden sm:inline text-[10px] text-amber-500 font-medium">↓snap</span>
            )}
            <button
              onClick={handleZoomIn}
              disabled={zoom >= SNAP_MAX}
              title="Zoom In"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(100)}
              title="Fit to Page"
              className="ml-1 hidden sm:block rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
            >
              Fit
            </button>
            <button
              onClick={() => setZoom(150)}
              title="Best zoom for snap detection (150%)"
              className={`hidden sm:block rounded-md px-2 py-1 text-xs font-medium transition-colors ${zoom >= 125 && zoom <= 175 ? "text-green-600 bg-green-50 hover:bg-green-100" : "text-text-muted hover:bg-surface-alt hover:text-text"}`}
            >
              Snap
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
            onSaveProgress={handleSaveProgress}
            canUndo={canUndo}
            canRedo={canRedo}
            isDownloading={isDownloading}
            selectedField={selectedField}
            onFontSizeChange={handleFontSizeChange}
            onDetectFields={handleDetectFields}
            isDetecting={isDetecting}
            onAutoFill={handleAutoFillFromProfile}
            minimapCanvas={minimapCanvas}
            viewerRef={viewerContainerRef}
            zoom={zoom}
            onMinimapRefresh={() => { let qa = 0; const qp = () => { const c = pdfViewerRef.current?.getCanvas(); if (c) { try { const x = c.getContext("2d")?.getImageData(c.width/2,c.height/2,1,1); if (x && x.data[3]>0) { setMinimapCanvas(c); return; } } catch{} } if (qa++<15) setTimeout(qp,200); }; setTimeout(qp,500); }}
          />
        </div>

        <div ref={viewerContainerRef} className="flex-1 h-full overflow-auto relative min-w-0">
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

        {/* Right context panel */}
        <ContextPanel
          activeTool={activeTool}
          selectedField={selectedField}
          onToolCancel={() => setActiveTool(null)}
          onFieldUpdate={handleFieldUpdate}
          onFieldDelete={handleFieldDelete}
          onFieldDeselect={() => setSelectedFieldId(null)}
          onStampChange={(stamp) => {
            if (selectedField) {
              handleFieldUpdate(selectedField.id, {
                stamp,
                checked: stamp !== "none",
              } as Partial<EditorField>);
            }
          }}
          onAutoFill={handleAutoFillFromProfile}
          onDetectFields={handleDetectFields}
          isDetecting={isDetecting}
          onSignatureRequest={(fieldId) => {
            const field = fields.find((f) => f.id === fieldId);
            if (field) {
              setPendingSignatureField(field);
              setSignatureModalOpen(true);
            }
          }}
        />

      </div>

      {/* Floating bottom page nav, only on multi-page docs */}
      {pdfBytes && totalPages > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 hidden sm:flex items-center gap-2 rounded-full bg-navy shadow-xl border border-white/10 px-4 py-2">
          <span className="text-xs text-white/70 font-medium">{currentPage + 1} / {totalPages}</span>
          <div className="w-px h-4 bg-white/20" />
          <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
            <ChevronRight className="h-4 w-4" />
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
        onSaveProgress={handleSaveProgress}
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

      {/* Signature modal for editor — key forces full remount on each open so
          the canvas re-initialises and drawing event listeners re-attach correctly */}
      {signatureModalOpen && (
        <SignatureModal
          key={pendingSignatureField?.id ?? "sig-modal"}
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
      )}

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

      {/* Guest signup prompt modal */}
      {showGuestSignupPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-xl font-bold mb-2">Your PDF is ready!</h2>
            <p className="text-text-muted text-sm mb-6">
              Create a free account to get 3 fills per month, save your Australian profile, and re-fill forms instantly.
            </p>
            <Link href="/sign-up" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors mb-3">
              Create Free Account
            </Link>
            <button onClick={() => setShowGuestSignupPrompt(false)} className="text-sm text-text-muted hover:text-text transition-colors">
              Maybe later
            </button>
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
                  Upgrade to Pro, $12/month
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
    </>
  );
}
