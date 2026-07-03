"use client";

import { Suspense, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Sparkles, X, RotateCcw, Minus, Plus, Download, ShieldCheck, LockKeyhole, BadgeCheck, FileText } from "lucide-react";
import { UploadZone } from "@/components/UploadZone";
import { MobileFiller } from "@/components/MobileFiller";
import { Toolbar } from "@/components/Toolbar";
import { PdfViewer } from "@/components/PdfViewer";
import { ContextPanel } from "@/components/ContextPanel";
import { SignatureModal } from "@/components/SignatureModal";
import { WelcomeModal } from "@/components/WelcomeModal";
import { TourModal } from "@/components/TourModal";
import { SupportForm } from "@/components/SupportForm";
import { DownloadPreviewGate } from "@/components/DownloadPreviewGate";
import { AddAnotherPagePrompt } from "@/components/AddAnotherPagePrompt";
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
  cleanupOldIndexedDBSessions,
} from "@/lib/persistence";
import type { EditorField, LineOrientation, PlacementToolType, ToolDefaultState, ToolType } from "@/lib/types";
import { todayDateStamp } from "@/lib/date-stamp";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { trackMetaEvent } from "@/lib/meta-pixel";
import { runEditorProfileAutofill, trackEditorAutofillShadowReport } from "@/lib/editor-profile-autofill";
import { createEditorFieldId, repairDuplicateEditorFieldIds, withUniqueEditorFieldId } from "@/lib/field-ids";
import { loadPdfjsClient } from "@/lib/pdfjs-client";
import { getTemplateBySlug, isTemplateFillable, type TemplateConfig } from "@/lib/templates-config";
import { DOCUMENT_FILE_INPUT_ACCEPT, PDF_UPLOAD_MAX_BYTES, PDF_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";
import { appendUploadToDocument, filledDocumentFilename, removePageFromDocument, shiftFieldsAfterPageRemoval, type NormalizedDocumentUpload } from "@/lib/document-intake";
import { isCleanablePhoto } from "@/lib/image-cleanup";
import { PhotoCleanupModal } from "@/components/PhotoCleanupModal";

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];
const SNAP_MIN = 125;
const SNAP_MAX = 175;
// On mobile we allow zooming below SNAP_MIN so the full page fits the screen
const isMobileDevice = () => typeof window !== "undefined" && window.innerWidth < 640;
type LocalSaveStatus = "idle" | "saved" | "restored";

const DEFAULT_TOOL_DEFAULTS: ToolDefaultState = {
  select: {},
  text: { fontSize: 14 },
  date: { fontSize: 14, format: "en-AU" },
  checkbox: { stamp: "tick", color: "#000000", size: 20 },
  signature: { fontSize: 16 },
  box: { charCount: 9 },
  whiteout: { fillColor: null },
  line: { strokeWidth: 1, color: "#000000", orientation: "horizontal" as LineOrientation },
  eraser: { size: 48 },
  "mask-eraser": { size: 48 },
};

function placementToolFor(tool: ToolType): PlacementToolType | null {
  if (tool === "text" || tool === "date" || tool === "checkbox" || tool === "signature" || tool === "box" || tool === "whiteout" || tool === "line") {
    return tool;
  }
  return null;
}

const STARTER_TEMPLATE_SLUGS = [
  "super-choice",
  "statutory-declaration",
  "rental-application-nsw",
  "employment-separation",
  "ndis-service-agreement",
] as const;

type StarterTemplateSlug = (typeof STARTER_TEMPLATE_SLUGS)[number];

const STARTER_TEMPLATE_LABELS: Partial<Record<StarterTemplateSlug, string>> = {
  "super-choice": "Superannuation Standard Choice",
  "statutory-declaration": "Statutory Declaration",
  "rental-application-nsw": "Rental Application Worksheet (NSW)",
  "employment-separation": "Employment Separation Certificate",
  "ndis-service-agreement": "NDIS Service Agreement",
};

function isTrustedStarterTemplate(template: TemplateConfig | undefined): template is TemplateConfig {
  return Boolean(
    template &&
    !template.hideFromMainGrid &&
    template.sourceKind !== "underReview" &&
    template.sourceKind !== "sample" &&
    template.templateType !== "infoOnly" &&
    isTemplateFillable(template)
  );
}

const STARTER_TEMPLATES = STARTER_TEMPLATE_SLUGS.flatMap((slug) => {
  const template = getTemplateBySlug(slug);
  if (!isTrustedStarterTemplate(template)) return [];

  return [
    {
      file: template.file,
      title: STARTER_TEMPLATE_LABELS[slug] ?? template.title,
    },
  ];
});

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

function LocalSaveBadge({ status }: { status: LocalSaveStatus }) {
  if (status === "idle") return null;

  const label = status === "restored" ? "Restored locally" : "Saved locally";

  return (
    <span
      data-testid="local-save-status"
      title="Saved in this browser only. Use Save Progress for account save when available."
      className="inline-flex shrink-0 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700"
    >
      {label}
    </span>
  );
}

function EditorPageContent() {
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [toolDefaults, setToolDefaults] = useState<ToolDefaultState>(DEFAULT_TOOL_DEFAULTS);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [whiteoutColor, setWhiteoutColor] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isAddingPage, setIsAddingPage] = useState(false);
  const addPageInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAddPagePhoto, setPendingAddPagePhoto] = useState<File | null>(null);
  const [showAddAnotherPagePrompt, setShowAddAnotherPagePrompt] = useState(false);
  const [showRemovePageConfirm, setShowRemovePageConfirm] = useState(false);
  const [isRemovingPage, setIsRemovingPage] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [hasAcroForm, setHasAcroForm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDownloadPreviewGate, setShowDownloadPreviewGate] = useState(false);
  const [downloadPreviewUrl, setDownloadPreviewUrl] = useState<string | null>(null);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const [lastDownloadError, setLastDownloadError] = useState<string | null>(null);
  const [showSupportForm, setShowSupportForm] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pageScales] = useState(() => new Map<number, number>());
  const [viewportDims] = useState(() => new Map<number, { width: number; height: number }>());
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
  const [localSaveStatus, setLocalSaveStatus] = useState<LocalSaveStatus>("idle");
  const [snapEnabled, setSnapEnabled] = useState(false); // OFF by default
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const { isLoaded, isSignedIn } = useAuth();
  const { fields, set: setFields, undo, redo, reset, canUndo, canRedo } = useHistory();
  const restoredRef = useRef(false);
  const initialRestoreDoneRef = useRef(false);
  const downloadReadyFiredRef = useRef(false);
  const downloadCancelledHandledRef = useRef(false);
  const searchParams = useSearchParams();
  const advancedMobile = searchParams.get("advanced") === "1";
  const showFullEditorOnMobile = advancedMobile || Boolean(pdfBytes);
  const fullEditorUploadClassName = showFullEditorOnMobile
    ? "flex flex-col flex-1"
    : "hidden sm:flex sm:flex-col sm:flex-1";
  const fullEditorCanvasClassName = showFullEditorOnMobile
    ? "flex flex-col h-[calc(100svh-64px)]"
    : "hidden sm:flex sm:flex-col h-[calc(100svh-64px)]";

  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const activePdfTool = activeTool === "mask-eraser" ? activeTool : placementToolFor(activeTool);

  const handleToolSelect = useCallback((tool: ToolType) => {
    if (tool === "mask-eraser") {
      setSelectedFieldId(null);
    }
    setActiveTool(tool);
  }, []);

  const handleToolDefaultChange = useCallback(
    <T extends keyof ToolDefaultState>(tool: T, updates: Partial<ToolDefaultState[T]>) => {
      setToolDefaults(prev => ({
        ...prev,
        [tool]: { ...prev[tool], ...updates },
      }));
    },
    []
  );

  const markLocalSave = useCallback((status: LocalSaveStatus) => {
    setLocalSaveStatus(status);
  }, []);

  // Dynamic page title based on fileName
  useEffect(() => {
    if (fileName) {
      const name = fileName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
      document.title = `${name} | QuickFill`;
    } else {
      document.title = "Fill a PDF | QuickFill";
    }
  }, [fileName]);

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

  // Cleanup old IndexedDB sessions on mount (fire and forget)
  useEffect(() => {
    cleanupOldIndexedDBSessions();
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
      const savedFields = repairDuplicateEditorFieldIds(loadFieldsFromLocalStorage());
      const savedPage = loadPageFromLocalStorage();
      const savedName = loadFileNameFromLocalStorage();
      const startedFromPhoto = window.sessionStorage.getItem("qf-photo-capture-source") === "1";
      window.sessionStorage.removeItem("qf-photo-capture-source");

      setPdfBytes(savedPdf);
      setFileName(savedName);
      setCurrentPage(savedPage);
      if (savedFields.length > 0) {
        reset(savedFields);
        saveFieldsToLocalStorage(savedFields);
      }
      markLocalSave("restored");
      setShowRestoredBanner(true);
      setTimeout(() => setShowRestoredBanner(false), 3000);
      if (startedFromPhoto) setShowAddAnotherPagePrompt(true);
      pollCanvasForContent(pdfViewerRef, setMinimapCanvas);

      // Mark initial restoration as complete so persist effect can save
      initialRestoreDoneRef.current = true;

      // Detect AcroForm for progress tracking
      try {
        const acroFields = await detectAcroFormFields(savedPdf);
        if (acroFields.length > 0) setHasAcroForm(true);
      } catch {
        // silent
      }
    });
  }, [reset, markLocalSave]);

  // Persist fields on change (only after initial restoration is complete)
  useEffect(() => {
    if (pdfBytes && initialRestoreDoneRef.current) {
      saveFieldsToLocalStorage(fields);
      markLocalSave("saved");
    }
  }, [fields, pdfBytes, markLocalSave]);

  // Persist page on change + update minimap
  useEffect(() => {
    if (pdfBytes) {
      savePageToLocalStorage(currentPage);
      markLocalSave("saved");
      pollCanvasForContent(pdfViewerRef, setMinimapCanvas);
    }
  }, [currentPage, pdfBytes, markLocalSave]);

  // Persist zoom on change
  useEffect(() => {
    if (!pdfBytes) return;
    saveZoomToLocalStorage(zoom);
    markLocalSave("saved");
  }, [zoom, pdfBytes, markLocalSave]);

  // Welcome modal and tour logic for new users
  // Only runs once on mount when pdfBytes is available
  useEffect(() => {
    if (!pdfBytes) return;
    
    const welcomed = localStorage.getItem("quickfill_welcomed");
    const tourDone = localStorage.getItem("quickfill_tour_done");
    
    if (!welcomed) {
      // First visit - show welcome modal
      setShowWelcomeModal(true);
    } else if (!tourDone) {
      // Already welcomed but tour not done - show tour after a brief delay
      const timer = setTimeout(() => setShowTour(true), 500);
      return () => clearTimeout(timer);
    }
  }, [pdfBytes]);

  const handleWelcomeComplete = useCallback(() => {
    setShowWelcomeModal(false);
    // Check if tour should start (only if not already done)
    const tourDone = localStorage.getItem("quickfill_tour_done");
    if (!tourDone) {
      const timer = setTimeout(() => setShowTour(true), 300);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleTourComplete = useCallback(() => {
    setShowTour(false);
  }, []);

  const handleShowHelp = useCallback(() => {
    // Reset tour done flag and show tour
    localStorage.removeItem("quickfill_tour_done");
    setShowTour(true);
  }, []);

  // Clear snap preview when snap is disabled
  useEffect(() => {
    if (!snapEnabled) {
      // Signal to PdfViewer to clear any snap preview by triggering a state update
      // The PdfViewer will handle this via its own useEffect on snapEnabled
    }
  }, [snapEnabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (activeTool === "checkbox" || activeTool === "line" || activeTool === "date")) {
        setActiveTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool]);


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
    async (
      file: File,
      bytes: ArrayBuffer,
      source: "upload" | "template" = "upload",
      options?: { skipAcroFormDetection?: boolean }
    ) => {
      setIsLoading(true);
      if (source === "upload") {
        trackEvent("editor_upload_started", { sizeKb: Math.round(bytes.byteLength / 1024) });
        trackMetaEvent('QF_UploadStarted', { sizeKb: Math.round(bytes.byteLength / 1024) });
      }
      try {
        if (bytes.byteLength > PDF_UPLOAD_MAX_BYTES) {
          setToast(`This file is too large (max ${PDF_UPLOAD_MAX_LABEL})`);
          setTimeout(() => setToast(null), 5000);
          setIsLoading(false);
          return;
        }

        // BUG 1 FIX: Clear ALL state before loading new template
        // This ensures no fields from previous session bleed through
        reset([]);
        setSelectedFieldId(null);
        setActiveTool("select");
        setCurrentPage(0);
        setHasAcroForm(false);
        pageScales.clear(); // Clear old page scales for fresh coordinate calculation
        // Mark as ready for field persistence
        initialRestoreDoneRef.current = true;

        // Persist before showing the editor so a route refresh cannot lose the loaded PDF.
        await savePdfToIndexedDB(bytes);
        saveFileNameToLocalStorage(file.name);
        markLocalSave("saved");

        setPdfBytes(bytes);
        setFileName(file.name);

        // Detect AcroForm fields
        let detectedAcroFieldCount = 0;
        if (options?.skipAcroFormDetection) {
          setHasAcroForm(false);
          reset([]);
        } else {
          try {
            const acroFields = await detectAcroFormFields(bytes);
            if (acroFields.length > 0) {
              detectedAcroFieldCount = acroFields.length;
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
              reset(repairDuplicateEditorFieldIds(editorFields));
            } else {
              setHasAcroForm(false);
              reset([]);
            }
          } catch {
            setHasAcroForm(false);
            reset([]);
          }
        }
        trackEvent("editor_pdf_loaded", {
          source,
          sizeKb: Math.round(bytes.byteLength / 1024),
          hasAcroForm: detectedAcroFieldCount > 0,
          detectedFieldCount: detectedAcroFieldCount,
        });
        trackMetaEvent('ViewContent', { content_name: 'pdf_editor', content_type: source });
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
    [reset, pageScales, markLocalSave]
  );

  // Load template from URL param - reset state when template changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const templateParam = params.get("template");
    if (!templateParam) return;
    if (templateParam === activeTemplate) return;
    trackEvent("template_start", { source: "url", template: templateParam });

    // New template selected - clear previous session
    clearEditorState().then(() => {
      reset([]);
      setPdfBytes(null);
      setFileName("");
      setCurrentPage(0);
      setSelectedFieldId(null);
      pageScales.clear(); // Clear old page scales for fresh coordinate calculation
      setActiveTemplate(templateParam);

      fetch(`/templates/${templateParam}`)
        .then((r) => r.arrayBuffer())
        .then(async (bytes) => {
          const file = new File([bytes], templateParam, { type: "application/pdf" });
          await handleFileLoad(file, bytes, "template");
        })
        .catch(() => {});
    });
  }, [activeTemplate, handleFileLoad, reset, pageScales]);

  const handleFieldAdd = useCallback(
    (field: EditorField) => {
      const fieldToAdd = withUniqueEditorFieldId(field, fields);
      trackEvent("field_added", { source: "manual", type: fieldToAdd.type, snapped: Boolean(fieldToAdd.snapped) });
      setFields((prev) => [...prev, fieldToAdd]);
      // Select the newly added field and keep stamp-style tools active
      const isStampStyle = fieldToAdd.type === "checkbox" || fieldToAdd.type === "line" || fieldToAdd.type === "date";
      setSelectedFieldId(isStampStyle ? null : fieldToAdd.id);
      setActiveTool((prev) => (isStampStyle ? prev : "select"));
      return fieldToAdd;
    },
    [fields, setFields]
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
      const newId = createEditorFieldId(fields, "dup");
      const dup = { ...source, id: newId, x: source.x + 12, y: source.y + 12 } as EditorField;
      trackEvent("field_added", { source: "duplicate", type: dup.type });
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
      // Duplicate selected field: Ctrl+D / Cmd+D
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedFieldId) {
        e.preventDefault();
        handleFieldDuplicate(selectedFieldId);
      }
      // Escape: deselect
      if (e.key === "Escape") {
        setSelectedFieldId(null);
        setActiveTool("select");
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

  const handleAddPageRequest = useCallback(() => {
    addPageInputRef.current?.click();
  }, []);

  const appendPageFile = useCallback(
    async (file: File, options?: { showPrompt?: boolean }) => {
      if (!pdfBytes || isAddingPage) return;
      setIsAddingPage(true);
      try {
        const result = await appendUploadToDocument(pdfBytes, file);
        const newTotalPages = result.firstAddedPageIndex + result.addedPageCount;

        // Persist first so a refresh cannot lose the appended pages.
        await savePdfToIndexedDB(result.pdfBytes);
        markLocalSave("saved");

        // Update totalPages alongside currentPage so the viewer's clamp
        // guard never resets the jump to the first appended page.
        setPdfBytes(result.pdfBytes);
        setTotalPages(newTotalPages);
        setCurrentPage(result.firstAddedPageIndex);

        trackEvent("page_added", {
          addedPageCount: result.addedPageCount,
          totalPages: newTotalPages,
        });
        setToast(result.addedPageCount === 1 ? "Page added" : `${result.addedPageCount} pages added`);
        setTimeout(() => setToast(null), 3000);
        if (options?.showPrompt) setShowAddAnotherPagePrompt(true);
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "This page could not be added. Try a different PDF, JPG, or PNG.";
        setToast(message);
        setTimeout(() => setToast(null), 6000);
      } finally {
        setIsAddingPage(false);
      }
    },
    [pdfBytes, isAddingPage, markLocalSave]
  );

  const handleAddPageFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (isCleanablePhoto(file)) {
        // Photos go through the cleanup modal; PDFs append directly.
        setPendingAddPagePhoto(file);
        return;
      }
      void appendPageFile(file);
    },
    [appendPageFile]
  );

  const handleRemovePageRequest = useCallback(() => {
    if (totalPages <= 1) return;
    setShowRemovePageConfirm(true);
  }, [totalPages]);

  const confirmRemovePage = useCallback(async () => {
    if (!pdfBytes || totalPages <= 1 || isRemovingPage) return;
    setIsRemovingPage(true);
    try {
      const result = await removePageFromDocument(pdfBytes, currentPage);
      const newFields = shiftFieldsAfterPageRemoval(fields, currentPage);

      // Persist first so a refresh cannot restore the removed page.
      await savePdfToIndexedDB(result.pdfBytes);
      saveFieldsToLocalStorage(newFields);
      markLocalSave("saved");

      // Page removal is not undoable: reset history so Ctrl+Z can never
      // restore fields that point at a page which no longer exists.
      setPdfBytes(result.pdfBytes);
      reset(newFields);
      setSelectedFieldId(null);
      setTotalPages(result.newPageCount);
      setCurrentPage(Math.min(currentPage, result.newPageCount - 1));
      pageScales.clear(); // Page indexes shifted; scales repopulate on render.

      trackEvent("page_removed", {
        removedPageIndex: currentPage,
        totalPages: result.newPageCount,
      });
      setToast("Page removed");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "This page could not be removed. Please try again.";
      setToast(message);
      setTimeout(() => setToast(null), 6000);
    } finally {
      setIsRemovingPage(false);
      setShowRemovePageConfirm(false);
    }
  }, [pdfBytes, totalPages, isRemovingPage, currentPage, fields, reset, pageScales, markLocalSave]);

  const handleStartOver = useCallback(() => {
    clearEditorState();
    setLocalSaveStatus("idle");
    setPdfBytes(null);
    setFileName("");
    setCurrentPage(0);
    setTotalPages(0);
    setHasAcroForm(false);
    setSelectedFieldId(null);
    setActiveTool("select");
    pageScales.clear(); // Clear old page scales for fresh coordinate calculation
    reset([]);
  }, [reset, pageScales]);

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
        showToast("Progress saved to your account");
      }
    } catch {
      showToast("Account save failed. Local autosave is still on.");
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
      if (!profile?.fullName) {
        showToast("No profile saved, go to Profile to set one up");
        return;
      }

      const result = runEditorProfileAutofill(fields, profile);
      setFields(result.fields);
      trackEditorAutofillShadowReport(result, { surface: "desktop", hasAcroForm, totalPages });
      showToast(result.matched > 0 ? `Auto-filled ${result.matched} field${result.matched > 1 ? "s" : ""}` : "No matching profile fields found");
    } catch {
      showToast("Failed to load profile");
    }
  }, [fields, hasAcroForm, setFields, showToast, totalPages]);

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

  const openDownloadPreviewGate = useCallback(() => {
    setShowDownloadPreviewGate(false);
    setDownloadPreviewUrl(null);
    setShowDownloadPreviewGate(true);

    void pdfViewerRef.current?.getCompositePreviewURL()
      .then((url) => {
        if (url) setDownloadPreviewUrl(url);
      })
      .catch(() => {});
  }, []);

  const handleDownload = useCallback(async () => {
    if (!pdfBytes) return;
    trackEvent("download_attempt", {
      fieldCount: fields.length,
      pageCount: totalPages || 1,
      hasAcroForm,
    });
    trackMetaEvent('QF_DownloadAttempt', { fieldCount: fields.length, pageCount: totalPages || 1 });
    setIsDownloading(true);
    setLastDownloadError(null);
    try {
      // Determine Pro status. Fail safe: any error or non-ok response treats user as non-Pro.
      let isPro = false;
      try {
        const usageRes = await fetch("/api/usage");
        if (usageRes.ok) {
          const usage = await usageRes.json();
          isPro = Boolean(usage.isPro || usage.tier === "pro" || usage.tier === "business");
        }
      } catch {
      }

      // Non-Pro users always see the gate. Never call fill-pdf before payment.
      if (!isPro) {
        trackEvent("download_gate_shown", { source: "non_pro" });
        openDownloadPreviewGate();
        setIsDownloading(false);
        return;
      }

      // Build FormData and send to server-side fill API
      const fd = new FormData();
      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");
      fd.append("fields", JSON.stringify(fields));
      fd.append("pageScales", JSON.stringify(Array.from(pageScales.entries())));
      
      // Collect viewport dimensions for each page from PdfViewer
      const pageViewportDims = new Map<number, { width: number; height: number }>();
      if (pdfViewerRef.current) {
        // We need viewport dims for all pages, not just current
        // Since we can only access current page's viewport, we'll fetch all pages' viewports
        // by temporarily rendering each page (this is done client-side, so it's acceptable)
        try {
          const pdfjsLib = await loadPdfjsClient();
          const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
          for (let i = 0; i < pdf.numPages; i++) {
            const page = await pdf.getPage(i + 1);
            const viewport = page.getViewport({ scale: 1 });
            pageViewportDims.set(i, { width: viewport.width, height: viewport.height });
          }
        } catch (err) {
          console.error("Failed to get viewport dimensions:", err);
        }
      }
      
      fd.append("viewportDims", JSON.stringify(Array.from(pageViewportDims.entries())));
      fd.append("hasAcroForm", String(hasAcroForm));
      const fillRes = await fetch("/api/fill-pdf", { method: "POST", body: fd });
      if (!fillRes.ok) {
        const errBody = await fillRes.json().catch(() => ({ error: "Server error" }));
        if (fillRes.status === 402) {
          trackEvent("download_gate_shown", { source: "api_402_safety" });
          openDownloadPreviewGate();
          setIsDownloading(false);
          return;
        }
        throw new Error(errBody.error || `Server responded ${fillRes.status}`);
      }
      const resultBuf = await fillRes.arrayBuffer();

      const blob = new Blob([resultBuf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filledDocumentFilename(fileName);
      a.click();
      URL.revokeObjectURL(url);

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
        // silent - non-critical
      }

      trackEvent("download_success", {
        fieldCount: fields.length,
        pageCount: totalPages || 1,
        pro: isPro,
      });

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
      trackEvent("download_failed", { message: msg.slice(0, 120) });
      setLastDownloadError(msg);
      setShowSupportForm(true);
      showToast(`Failed to generate PDF: ${msg}`);
    } finally {
      setIsDownloading(false);
    }
  }, [pdfBytes, fields, pageScales, hasAcroForm, fileName, totalPages, showToast, openDownloadPreviewGate]);

  // Stripe cancel from the download gate returns to /editor?download=cancelled.
  // The user's document restores from IndexedDB as normal; reopen the gate so
  // they land back at the unlock moment instead of a bare editor.
  useEffect(() => {
    if (!pdfBytes) return;
    if (downloadCancelledHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("download") !== "cancelled") return;
    downloadCancelledHandledRef.current = true;

    trackEvent("checkout_cancelled", { source: "download_preview_gate" });
    openDownloadPreviewGate();

    // Strip the param so a refresh does not re-fire the event or reopen the gate.
    params.delete("download");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname
    );
  }, [pdfBytes, openDownloadPreviewGate]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!pdfBytes) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("download") !== "ready") return;
    if (downloadReadyFiredRef.current) return;
    downloadReadyFiredRef.current = true;

    fetch("/api/usage")
      .then((res) => res.ok ? res.json() : null)
      .then((usage) => {
        if (usage?.isPro || usage?.tier === "pro") {
          handleDownload();
        }
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn, pdfBytes, handleDownload]);

  const handlePageScaleSet = useCallback(
    (page: number, scale: number) => {
      // Only update scale when at 100% zoom (base render) to avoid zoom-induced overwrites.
      // Field coordinates are stored in base canvas space (fitScale * pdfPoint).
      // Allow updates when scale genuinely changes (e.g., PDF re-render at different size).
      if (zoom === 100) {
        const existing = pageScales.get(page);
        if (existing !== scale) {
          pageScales.set(page, scale);
        }
      }
    },
    [pageScales, zoom]
  );

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleDetectFields = useCallback(async () => {
    if (!pdfViewerRef.current) return;

    setIsDetecting(true);
    const zoomFactor = zoom / 100;

    try {
      const reservedFieldIds = fields.map((field) => field.id);
      const reserveFieldId = (prefix: string) => {
        const id = createEditorFieldId(reservedFieldIds, prefix);
        reservedFieldIds.push(id);
        return id;
      };

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
              visualFields = boxes.map((box) => {
                const id = reserveFieldId("vis");
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
              (f: { label?: string; type?: string; x: number; y: number; width: number; height: number }) => {
                const id = reserveFieldId("ai");
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
                  value: fieldType === "date" ? todayDateStamp() : "",
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
      trackEvent("field_detection_used", { count: allDetected.length, visualCount: visualFields.length, aiCount: aiFields.length });
      trackEvent("field_added", { source: "detect", count: allDetected.length });
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
  }, [currentPage, zoom, fields, setFields, showToast]);

  if (!pdfBytes) {
    return (
      <>
        {/* Mobile, dedicated filler flow */}
        <div className={advancedMobile ? "hidden" : "sm:hidden"}>
          <MobileFiller />
        </div>
        {/* Desktop and advanced mobile full editor upload */}
        <div className={fullEditorUploadClassName}>
          {isLoading && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/80">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-3 border-accent border-t-transparent" />
                <p className="text-sm font-medium text-text-muted">Loading file...</p>
              </div>
            </div>
          )}
          {showWelcome && (
            <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div className="flex-1 text-sm">
                <span className="font-semibold text-accent">Welcome to QuickFill!</span>
                <span className="ml-1 text-text-muted">Upload a PDF, JPG, or PNG. Your file is processed to generate your download and is not saved to our servers.</span>
              </div>
              <button onClick={dismissWelcome} className="shrink-0 text-text-muted hover:text-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <UploadZone
            onFileLoad={(upload: NormalizedDocumentUpload) =>
              handleFileLoad(
                new File([upload.pdfBytes], upload.fileName, { type: "application/pdf" }),
                upload.pdfBytes,
                "upload",
                { skipAcroFormDetection: upload.skipAcroFormDetection }
              )
            }
          />

          <div className="mx-8 -mt-2 mb-8 grid gap-3 lg:grid-cols-3">
            {[
              { icon: LockKeyhole, title: "No file storage", body: "Your file is used to create your download, then discarded. Never saved." },
              { icon: ShieldCheck, title: "Edit first", body: "Fill, mark up, and sign your document before download." },
              { icon: BadgeCheck, title: "Finish online", body: "Use text, boxes, dates, lines, whiteout, and signatures in one editor." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-xl border border-border bg-surface-alt px-4 py-3">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{item.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Template starter cards */}
          <div className="px-8 pb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-medium text-text-muted">or start with a template</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {STARTER_TEMPLATES.map(({ file, title }) => (
                <button
                  key={file}
                  onClick={() => {
                    trackEvent("template_start", { source: "editor_card", template: file });
                    setIsLoading(true);
                    fetch(`/templates/${file}`)
                      .then(r => r.arrayBuffer())
                      .then(async bytes => {
                        const f = new File([bytes], file, { type: "application/pdf" });
                        await handleFileLoad(f, bytes);
                      })
                      .catch(() => setIsLoading(false));
                  }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-alt px-4 py-3 text-left hover:border-accent hover:bg-accent/5 transition-colors group"
                >
                  <FileText className="h-5 w-5 text-accent" />
                  <span className="text-sm font-medium text-text-muted group-hover:text-accent transition-colors">{title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    {/* Keep loaded PDFs in the full editor on mobile so restored work stays visible. */}
    <div className={fullEditorCanvasClassName}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-accent border-t-transparent" />
            <p className="text-sm font-medium text-text-muted">Loading file...</p>
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
          {/* Left: browse templates + filename */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/templates"
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
              title="Browse all templates"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              <span className="hidden sm:inline">Templates</span>
            </Link>
            <span className="hidden sm:inline text-text-muted/30 text-xs">/</span>
            <p className="truncate text-sm font-medium text-text-muted">{fileName}</p>
            <LocalSaveBadge status={localSaveStatus} />
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
              <span className="hidden sm:inline text-[10px] text-amber-500 font-medium">too small</span>
            )}
            {zoom >= 125 && zoom <= 175 && (
              <span className="hidden sm:inline text-[10px] text-green-500 font-medium">snap ready</span>
            )}
            {zoom > 175 && (
              <span className="hidden sm:inline text-[10px] text-amber-500 font-medium">too large</span>
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
                  Page {Math.min(currentPage + 1, totalPages)} of {totalPages}
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

      {/* Hidden picker for Add Page: native mobile pickers offer camera/photo options */}
      <input
        ref={addPageInputRef}
        type="file"
        accept={DOCUMENT_FILE_INPUT_ACCEPT}
        className="hidden"
        onChange={handleAddPageFile}
        data-testid="add-page-input"
      />

      {pendingAddPagePhoto && (
        <PhotoCleanupModal
          file={pendingAddPagePhoto}
          onConfirm={(cleanedFile) => {
            setPendingAddPagePhoto(null);
            void appendPageFile(cleanedFile, { showPrompt: true });
          }}
          onCancel={() => setPendingAddPagePhoto(null)}
        />
      )}

      <AddAnotherPagePrompt
        open={showAddAnotherPagePrompt}
        onAddAnother={() => {
          setShowAddAnotherPagePrompt(false);
          addPageInputRef.current?.click();
        }}
        onDone={() => setShowAddAnotherPagePrompt(false)}
      />

      {/* Sidebar + Canvas row */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-shrink-0 h-full overflow-hidden hidden sm:flex">
          <Toolbar
            activeTool={activeTool}
            onToolSelect={handleToolSelect}
            onUndo={undo}
            onRedo={redo}
            onClear={handleClear}
            onDownload={handleDownload}
            onSaveProgress={handleSaveProgress}
            isSavingProgress={savingProgress}
            canUndo={canUndo}
            canRedo={canRedo}
            isDownloading={isDownloading}
            selectedField={selectedField}
            onFontSizeChange={handleFontSizeChange}
            onDetectFields={handleDetectFields}
            isDetecting={isDetecting}
            onAutoFill={handleAutoFillFromProfile}
            snapEnabled={snapEnabled}
            onSnapToggle={() => setSnapEnabled(v => !v)}
            onShowHelp={handleShowHelp}
            minimapCanvas={minimapCanvas}
            viewerRef={viewerContainerRef}
            zoom={zoom}
            fields={fields}
            onStartOver={handleStartOver}
            onAddPage={handleAddPageRequest}
            isAddingPage={isAddingPage}
            onRemovePage={handleRemovePageRequest}
            canRemovePage={totalPages > 1}
            onMinimapRefresh={() => { let qa = 0; const qp = () => { const c = pdfViewerRef.current?.getCanvas(); if (c) { try { const x = c.getContext("2d")?.getImageData(c.width/2,c.height/2,1,1); if (x && x.data[3]>0) { setMinimapCanvas(c); return; } } catch{} } if (qa++<15) setTimeout(qp,200); }; setTimeout(qp,500); }}
          />
        </div>

        <div ref={viewerContainerRef} className="flex-1 h-full overflow-auto relative min-w-0">
          <PdfViewer
            ref={pdfViewerRef}
            pdfBytes={pdfBytes}
            currentPage={currentPage}
            fields={fields}
            activeTool={activePdfTool}
            selectedFieldId={selectedFieldId}
            onFieldAdd={handleFieldAdd}
            onFieldUpdate={handleFieldUpdate}
            onFieldsSet={setFields}
            onFieldSelect={setSelectedFieldId}
            onToolSelect={() => setActiveTool("select")}
            onFieldDelete={handleFieldDelete}
            onFieldDuplicate={handleFieldDuplicate}
            onPageScaleSet={handlePageScaleSet}
            totalPages={totalPages}
            onTotalPagesChange={setTotalPages}
            zoom={zoom}
            highlightFieldIds={highlightFieldIds}
            onSignatureFieldPlaced={handleSignatureFieldPlaced}
            onSignatureRequest={(fieldId) => {
              const field = fields.find((f) => f.id === fieldId);
              if (field) {
                setPendingSignatureField(field);
                setSignatureModalOpen(true);
              }
            }}
            onPageChange={handlePageChange}
            snapEnabled={snapEnabled}
            keepRatio={selectedField?.type === "signature"}
            whiteoutColor={whiteoutColor}
            onWhiteoutColorChange={setWhiteoutColor}
            toolDefaults={toolDefaults}
          />
        </div>

        {/* Right context panel */}
        <ContextPanel
          activeTool={activeTool}
          selectedField={selectedField}
          onToolCancel={() => setActiveTool("select")}
          onFieldUpdate={handleFieldUpdate}
          onFieldDelete={handleFieldDelete}
          onFieldDeselect={() => setSelectedFieldId(null)}
          onFieldEdit={(fieldId) => pdfViewerRef.current?.editField(fieldId)}
          onFieldDuplicate={handleFieldDuplicate}
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
          toolDefaults={toolDefaults}
          onToolDefaultChange={handleToolDefaultChange}
          onSignatureRequest={(fieldId) => {
            const field = fields.find((f) => f.id === fieldId);
            if (field) {
              setPendingSignatureField(field);
              setSignatureModalOpen(true);
            }
          }}
          whiteoutColor={whiteoutColor}
          onWhiteoutColorChange={setWhiteoutColor}
        />

      </div>

      {/* Floating bottom page nav, only on multi-page docs */}
      {pdfBytes && totalPages > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 hidden sm:flex items-center gap-2 rounded-full bg-navy shadow-xl border border-white/10 px-4 py-2">
          <span className="text-xs text-white/70 font-medium">{Math.min(currentPage + 1, totalPages)} / {totalPages}</span>
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
        onToolSelect={handleToolSelect}
        onUndo={undo}
        onRedo={redo}
        onClear={handleClear}
        onDownload={handleDownload}
        onSaveProgress={handleSaveProgress}
        isSavingProgress={savingProgress}
        canUndo={canUndo}
        canRedo={canRedo}
        isDownloading={isDownloading}
        selectedField={selectedField}
        onFontSizeChange={handleFontSizeChange}
        onDetectFields={handleDetectFields}
        isDetecting={isDetecting}
        onAutoFill={handleAutoFillFromProfile}
        snapEnabled={snapEnabled}
        onSnapToggle={() => setSnapEnabled(v => !v)}
        onShowHelp={handleShowHelp}
        fields={fields}
        onStartOver={handleStartOver}
        onAddPage={handleAddPageRequest}
        isAddingPage={isAddingPage}
        onRemovePage={handleRemovePageRequest}
        canRemovePage={totalPages > 1}
        mobile
      />

      {/* Signature modal for editor: key forces full remount on each open so
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

      {showSupportForm && lastDownloadError && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Send this to support?</h2>
                <p className="mt-1 text-sm text-text-muted">
                  We can use the error details to investigate the PDF export.
                </p>
              </div>
              <button
                onClick={() => setShowSupportForm(false)}
                className="rounded-lg p-2 text-text-muted hover:bg-surface-alt hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SupportForm
              compact
              source="editor_download_error"
              title="Download problem"
              description="The message below will go to support with your account context."
              defaultSubject="PDF download failed"
              defaultMessage={`File: ${fileName || "Untitled PDF"}\nFields: ${fields.length}\nPages: ${totalPages || 1}\nError: ${lastDownloadError}`}
              onSent={() => setTimeout(() => setShowSupportForm(false), 900)}
            />
          </div>
        </div>
      )}

      {/* Remove page confirmation */}
      {showRemovePageConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
            <h2 className="text-lg font-bold">Remove page {Math.min(currentPage + 1, totalPages)} of {totalPages}?</h2>
            <p className="mt-2 text-sm text-text-muted">
              {(() => {
                const fieldsOnPage = fields.filter((f) => f.page === currentPage).length;
                return fieldsOnPage > 0
                  ? `This will delete ${fieldsOnPage} field${fieldsOnPage !== 1 ? "s" : ""} on this page. This cannot be undone.`
                  : "This cannot be undone.";
              })()}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={confirmRemovePage}
                disabled={isRemovingPage}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {isRemovingPage ? "Removing..." : "Remove Page"}
              </button>
              <button
                onClick={() => setShowRemovePageConfirm(false)}
                disabled={isRemovingPage}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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

      <DownloadPreviewGate
        open={showDownloadPreviewGate}
        onClose={() => setShowDownloadPreviewGate(false)}
        previewDataUrl={downloadPreviewUrl}
        fileName={fileName}
      />

      {/* Welcome modal for first-time users */}
      {showWelcomeModal && (
        <WelcomeModal onComplete={handleWelcomeComplete} />
      )}

      {/* Tour modal for guided walkthrough */}
      {showTour && (
        <TourModal isOpen={showTour} onClose={handleTourComplete} />
      )}

    </div>
    </>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <EditorPageContent />
    </Suspense>
  );
}
