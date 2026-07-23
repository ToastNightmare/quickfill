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
import { SaveProgressPrompt } from "@/components/SaveProgressPrompt";
import {
  FieldSuggestionReview,
  type FieldSuggestionCommitAction,
  type FieldSuggestionReviewDecision,
  type FieldSuggestionReviewStatus,
} from "@/components/FieldSuggestionReview";
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
import { renderFlattenedWhiteoutPages } from "@/lib/pdf-flatten-client";
import { renderGatePagePreview } from "@/lib/gate-preview";
import { getTemplateBySlug, isTemplateFillable, type TemplateConfig } from "@/lib/templates-config";
import { DOCUMENT_FILE_INPUT_ACCEPT, PDF_UPLOAD_MAX_BYTES, PDF_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";
import { appendUploadToDocument, filledDocumentFilename, removePageFromDocument, shiftFieldsAfterPageRemoval, type NormalizedDocumentUpload } from "@/lib/document-intake";
import { isCleanablePhoto } from "@/lib/image-cleanup";
import { clearLocalSignature, loadLocalSignature, saveLocalSignature } from "@/lib/signature-store";
import { clampGestureZoom } from "@/lib/pinch-zoom";
import { PhotoCleanupModal } from "@/components/PhotoCleanupModal";
import {
  createDocumentRevision,
  fieldSuggestionsToEditorFields,
  replaceFieldSuggestions,
  validateFieldSuggestions,
  withSuggestionType,
  type FieldSuggestion,
  type SuggestedFieldType,
} from "@/lib/field-suggestions";
import {
  clearFieldSuggestionIntent,
  consumeFieldSuggestionIntent,
  isFieldSuggestionReviewEnabled,
} from "@/lib/field-suggestion-rollout";
import {
  LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS,
  localFieldDetectionSnapshotKeysEqual,
  reduceLocalFieldDetectionLifecycle,
  type LocalFieldDetectionLifecycleEvent,
  type LocalFieldDetectionSnapshotKey,
} from "@/lib/local-field-suggestion-provider";
import {
  createFieldSuggestionAnalyticsSession,
  type FieldSuggestionAnalyticsSession,
  type FieldSuggestionFailureReason,
  type FieldSuggestionOutcome,
} from "@/lib/field-suggestion-analytics";
import { isAddMediaEnabled } from "@/lib/add-media-rollout";
import { MediaEditorBoundary } from "@/components/MediaEditorProvider";

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];
const GESTURE_HINT_KEY = "quickfill_gesture_hint_seen";
const SNAP_MIN = 125;
const SNAP_MAX = 175;
const FIELD_SUGGESTION_SNAPSHOT_WAIT_MS = 5_000;
// On mobile/tablet (below the lg desktop layout) we allow zooming below
// SNAP_MIN so the full page fits the screen
const isMobileDevice = () => typeof window !== "undefined" && window.innerWidth < 1024;
type LocalSaveStatus = "idle" | "saved" | "restored";

interface ActiveFieldSuggestionReview {
  documentRevision: string;
  viewerDocumentRevision: number;
  snapshotKey: Readonly<LocalFieldDetectionSnapshotKey> | null;
  status: FieldSuggestionReviewStatus;
  suggestions: FieldSuggestion[];
  reviewVersion: number;
  showAddAnotherPagePromptAfter: boolean;
  errorMessage?: string;
}

interface ActiveFieldSuggestionAnalytics {
  documentRevision: string;
  viewerDocumentRevision: number;
  session: FieldSuggestionAnalyticsSession;
}

type ReadyLocalFieldDetectionEvent = Extract<LocalFieldDetectionLifecycleEvent, { status: "ready" }>;

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
      className="inline-flex shrink-0 items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700"
    >
      {/* Compact dot on small screens so the badge can never crowd or overlap
          the zoom controls; full label from sm up. */}
      <span className="h-1.5 w-1.5 rounded-full bg-green-500 sm:hidden" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  );
}

function EditorPageContent() {
  const fieldSuggestionReviewEnabled = isFieldSuggestionReviewEnabled();
  const addMediaEnabled = isAddMediaEnabled();
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
  const [fieldSuggestionReview, setFieldSuggestionReview] = useState<ActiveFieldSuggestionReview | null>(null);
  const [viewerDocumentRevision, setViewerDocumentRevision] = useState<number | null>(null);
  const [fieldSuggestionSnapshotEvent, setFieldSuggestionSnapshotEvent] = useState<LocalFieldDetectionLifecycleEvent | null>(null);
  const [showRemovePageConfirm, setShowRemovePageConfirm] = useState(false);
  const [isRemovingPage, setIsRemovingPage] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [hasAcroForm, setHasAcroForm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDownloadPreviewGate, setShowDownloadPreviewGate] = useState(false);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const [lastDownloadError, setLastDownloadError] = useState<string | null>(null);
  const [showSupportForm, setShowSupportForm] = useState(false);
  const [zoom, setZoom] = useState(100);
  // Live zoom readout while a pinch gesture is in progress (null when idle).
  const [pinchZoomPreview, setPinchZoomPreview] = useState<number | null>(null);
  const [pageScales] = useState(() => new Map<number, number>());
  const [viewportDims] = useState(() => new Map<number, { width: number; height: number }>());
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightFieldIds, setHighlightFieldIds] = useState<Set<string>>(new Set());
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedSignatureSource, setSavedSignatureSource] = useState<"account" | "device" | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [pendingSignatureField, setPendingSignatureField] = useState<EditorField | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [minimapCanvas, setMinimapCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [showSaveProgressPrompt, setShowSaveProgressPrompt] = useState(false);
  const [localSaveStatus, setLocalSaveStatus] = useState<LocalSaveStatus>("idle");
  const [snapEnabled, setSnapEnabled] = useState(false); // OFF by default
  const [editingTextFieldId, setEditingTextFieldId] = useState<string | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const { fields, set: setFields, undo, redo, reset, canUndo, canRedo } = useHistory();
  const restoredRef = useRef(false);
  const initialRestoreDoneRef = useRef(false);
  const downloadReadyFiredRef = useRef(false);
  const downloadCancelledHandledRef = useRef(false);
  const currentDocumentRevisionRef = useRef<string | null>(null);
  const viewerDocumentRevisionSequenceRef = useRef(0);
  const activeViewerDocumentRevisionRef = useRef<number | null>(null);
  const fieldSuggestionSnapshotEventRef = useRef<LocalFieldDetectionLifecycleEvent | null>(null);
  const fieldSuggestionIncrementalDurationRef = useRef<{
    event: ReadyLocalFieldDetectionEvent;
    durationMs: number;
  } | null>(null);
  const blockedFieldSuggestionSnapshotRef = useRef<{
    documentRevision: number;
    viewerInstanceId: number;
    renderGeneration: number;
  } | null>(null);
  const fieldSuggestionReviewRef = useRef<ActiveFieldSuggestionReview | null>(null);
  const fieldSuggestionAnalyticsRef = useRef<ActiveFieldSuggestionAnalytics | null>(null);
  const signatureLoadSessionKeyRef = useRef<string | null>(null);
  const signatureActiveSessionKeyRef = useRef<string | null>(null);
  const signatureChangedThisSessionRef = useRef(false);
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
  const getMediaPageBounds = useCallback((pageIndex: number) => {
    const dimensions = pdfViewerRef.current?.getViewportDims() ?? null;
    return dimensions?.pageIndex === pageIndex
      ? {
          widthPts: dimensions.width,
          heightPts: dimensions.height,
        }
      : null;
  }, []);
  const activePdfTool = activeTool === "mask-eraser" ? activeTool : placementToolFor(activeTool);
  const authenticatedSignatureSessionKey = isLoaded && isSignedIn && userId && sessionId
    ? JSON.stringify([userId, sessionId])
    : null;
  // A resolved auth transition invalidates stale responses during this render.
  // Temporary unresolved states preserve the last continuous session identity.
  if (isLoaded) signatureActiveSessionKeyRef.current = authenticatedSignatureSessionKey;

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

  const releaseFieldSuggestionSnapshot = useCallback((blockCurrent = true) => {
    const current = fieldSuggestionSnapshotEventRef.current;
    if (blockCurrent && current) {
      blockedFieldSuggestionSnapshotRef.current = {
        documentRevision: current.key.documentRevision,
        viewerInstanceId: current.key.viewerInstanceId,
        renderGeneration: current.key.renderGeneration,
      };
    }
    fieldSuggestionSnapshotEventRef.current = null;
    fieldSuggestionIncrementalDurationRef.current = null;
    setFieldSuggestionSnapshotEvent(null);
  }, []);

  const fieldSuggestionAnalyticsForReview = useCallback((
    review: Pick<ActiveFieldSuggestionReview, "documentRevision" | "viewerDocumentRevision">,
  ) => {
    const active = fieldSuggestionAnalyticsRef.current;
    if (
      !active ||
      active.documentRevision !== review.documentRevision ||
      active.viewerDocumentRevision !== review.viewerDocumentRevision
    ) return null;
    return active.session;
  }, []);

  const completeActiveFieldSuggestionAnalytics = useCallback((
    outcome: FieldSuggestionOutcome,
    count?: number,
    expectedReview?: Pick<ActiveFieldSuggestionReview, "documentRevision" | "viewerDocumentRevision">,
  ) => {
    const active = fieldSuggestionAnalyticsRef.current;
    if (!active) return false;
    if (
      expectedReview &&
      (active.documentRevision !== expectedReview.documentRevision ||
        active.viewerDocumentRevision !== expectedReview.viewerDocumentRevision)
    ) return false;
    fieldSuggestionAnalyticsRef.current = null;
    return active.session.complete(outcome, { count });
  }, []);

  const recordIneligibleFieldSuggestionAttempt = useCallback((reason: FieldSuggestionFailureReason) => {
    const session = createFieldSuggestionAnalyticsSession(fieldSuggestionReviewEnabled);
    session.record({ stage: "eligibility", eligibility: "ineligible", reason });
    session.complete("ineligible");
  }, [fieldSuggestionReviewEnabled]);

  const activateNextViewerDocumentRevision = useCallback(() => {
    completeActiveFieldSuggestionAnalytics("superseded");
    releaseFieldSuggestionSnapshot(false);
    viewerDocumentRevisionSequenceRef.current += 1;
    const nextRevision = viewerDocumentRevisionSequenceRef.current;
    activeViewerDocumentRevisionRef.current = nextRevision;
    blockedFieldSuggestionSnapshotRef.current = null;
    setViewerDocumentRevision(nextRevision);
    fieldSuggestionReviewRef.current = null;
    setFieldSuggestionReview(null);
    return nextRevision;
  }, [completeActiveFieldSuggestionAnalytics, releaseFieldSuggestionSnapshot]);

  const deactivateViewerDocumentRevision = useCallback(() => {
    completeActiveFieldSuggestionAnalytics("superseded");
    releaseFieldSuggestionSnapshot(false);
    viewerDocumentRevisionSequenceRef.current += 1;
    activeViewerDocumentRevisionRef.current = null;
    blockedFieldSuggestionSnapshotRef.current = null;
    setViewerDocumentRevision(null);
    fieldSuggestionReviewRef.current = null;
    setFieldSuggestionReview(null);
  }, [completeActiveFieldSuggestionAnalytics, releaseFieldSuggestionSnapshot]);

  const handleFieldSuggestionSnapshotEvent = useCallback((event: LocalFieldDetectionLifecycleEvent) => {
    const callbackStartedAt = event.status === "ready" ? performance.now() : null;
    const activeDocumentRevision = activeViewerDocumentRevisionRef.current;
    if (activeDocumentRevision === null || event.key.documentRevision !== activeDocumentRevision) return;

    const blocked = blockedFieldSuggestionSnapshotRef.current;
    if (
      blocked &&
      blocked.documentRevision === event.key.documentRevision &&
      blocked.viewerInstanceId === event.key.viewerInstanceId &&
      event.key.renderGeneration <= blocked.renderGeneration
    ) {
      return;
    }
    if (
      blocked &&
      (blocked.documentRevision !== event.key.documentRevision ||
        blocked.viewerInstanceId !== event.key.viewerInstanceId ||
        event.key.renderGeneration > blocked.renderGeneration)
    ) {
      blockedFieldSuggestionSnapshotRef.current = null;
    }

    const current = fieldSuggestionSnapshotEventRef.current;
    const next = reduceLocalFieldDetectionLifecycle(current, event, activeDocumentRevision);
    if (next === current) return;
    fieldSuggestionSnapshotEventRef.current = next;
    setFieldSuggestionSnapshotEvent(next);

    if (next?.status !== "ready" || callbackStartedAt === null) {
      fieldSuggestionIncrementalDurationRef.current = null;
      return;
    }

    const callbackDurationMs = performance.now() - callbackStartedAt;
    const incrementalDurationMs = next.snapshotPreparationDurationMs + callbackDurationMs;
    if (
      !Number.isFinite(next.snapshotPreparationDurationMs) ||
      next.snapshotPreparationDurationMs < 0 ||
      !Number.isFinite(callbackDurationMs) ||
      callbackDurationMs < 0 ||
      !Number.isFinite(incrementalDurationMs) ||
      incrementalDurationMs > LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS
    ) {
      const failedEvent: LocalFieldDetectionLifecycleEvent = Object.freeze({
        status: "failed",
        key: next.key,
        scanDurationMs: next.scanDurationMs,
        reason: "ineligible-metadata",
      });
      fieldSuggestionSnapshotEventRef.current = failedEvent;
      fieldSuggestionIncrementalDurationRef.current = null;
      setFieldSuggestionSnapshotEvent(failedEvent);
      return;
    }

    fieldSuggestionIncrementalDurationRef.current = {
      event: next,
      durationMs: incrementalDurationMs,
    };
    const review = fieldSuggestionReviewRef.current;
    if (
      review?.viewerDocumentRevision === next.key.documentRevision &&
      review.documentRevision === currentDocumentRevisionRef.current
    ) {
      fieldSuggestionAnalyticsForReview(review)?.record({
        stage: "snapshot_ready",
        count: next.snapshot.boxes.length,
        scanDurationMs: next.scanDurationMs,
        incrementalDurationMs,
      });
    }
  }, [fieldSuggestionAnalyticsForReview]);

  const invalidateFieldSuggestionReviewForRenderIntent = useCallback(() => {
    releaseFieldSuggestionSnapshot(true);
    const currentReview = fieldSuggestionReviewRef.current;
    if (currentReview) {
      completeActiveFieldSuggestionAnalytics("superseded", undefined, currentReview);
    }
    fieldSuggestionReviewRef.current = null;
    setFieldSuggestionReview(null);
    if (currentReview?.showAddAnotherPagePromptAfter) setShowAddAnotherPagePrompt(true);
  }, [completeActiveFieldSuggestionAnalytics, releaseFieldSuggestionSnapshot]);

  useEffect(() => () => {
    completeActiveFieldSuggestionAnalytics("superseded");
    activeViewerDocumentRevisionRef.current = null;
    fieldSuggestionSnapshotEventRef.current = null;
    fieldSuggestionIncrementalDurationRef.current = null;
    blockedFieldSuggestionSnapshotRef.current = null;
    fieldSuggestionReviewRef.current = null;
  }, [completeActiveFieldSuggestionAnalytics]);

  const beginFieldSuggestionReview = useCallback((
    documentRevision: string,
    showAddAnotherPagePromptAfter: boolean,
    requestedViewerDocumentRevision = activeViewerDocumentRevisionRef.current,
  ) => {
    if (requestedViewerDocumentRevision === null) return;
    completeActiveFieldSuggestionAnalytics("superseded");
    setShowAddAnotherPagePrompt(false);
    setCurrentPage(0);
    const review: ActiveFieldSuggestionReview = {
      documentRevision,
      viewerDocumentRevision: requestedViewerDocumentRevision,
      snapshotKey: null,
      status: "processing",
      suggestions: [],
      reviewVersion: 0,
      showAddAnotherPagePromptAfter,
    };
    const analyticsSession = createFieldSuggestionAnalyticsSession(fieldSuggestionReviewEnabled);
    fieldSuggestionAnalyticsRef.current = {
      documentRevision,
      viewerDocumentRevision: requestedViewerDocumentRevision,
      session: analyticsSession,
    };
    analyticsSession.record({ stage: "eligibility", eligibility: "eligible" });
    analyticsSession.record({ stage: "review_requested" });
    fieldSuggestionReviewRef.current = review;
    setFieldSuggestionReview(review);
  }, [completeActiveFieldSuggestionAnalytics, fieldSuggestionReviewEnabled]);

  // Dynamic page title based on fileName
  useEffect(() => {
    if (fileName) {
      const name = fileName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
      document.title = `${name} | QuickFill`;
    } else {
      document.title = "Fill a PDF | QuickFill";
    }
  }, [fileName]);

  // Wait for Clerk before loading an account signature. Anonymous users use
  // only the signature saved on this device and never call the protected API.
  useEffect(() => {
    const loadDeviceSignature = () => {
      if (signatureChangedThisSessionRef.current) return;
      const local = loadLocalSignature();
      setSavedSignature(local);
      setSavedSignatureSource(local ? "device" : null);
    };

    if (!isLoaded) return;

    if (!authenticatedSignatureSessionKey) {
      signatureLoadSessionKeyRef.current = null;
      loadDeviceSignature();
      return;
    }

    if (signatureLoadSessionKeyRef.current === authenticatedSignatureSessionKey) return;
    if (signatureLoadSessionKeyRef.current !== null) loadDeviceSignature();
    signatureLoadSessionKeyRef.current = authenticatedSignatureSessionKey;
    const requestedSessionKey = authenticatedSignatureSessionKey;

    fetch("/api/signature")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (
          signatureActiveSessionKeyRef.current !== requestedSessionKey ||
          signatureLoadSessionKeyRef.current !== requestedSessionKey ||
          signatureChangedThisSessionRef.current
        ) return;
        if (data?.signatureDataUrl) {
          setSavedSignature(data.signatureDataUrl);
          setSavedSignatureSource("account");
          return;
        }
        loadDeviceSignature();
      })
      .catch(() => {
        if (
          signatureActiveSessionKeyRef.current !== requestedSessionKey ||
          signatureLoadSessionKeyRef.current !== requestedSessionKey ||
          signatureChangedThisSessionRef.current
        ) return;
        loadDeviceSignature();
      });
  }, [authenticatedSignatureSessionKey, isLoaded]);


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

    // Restore zoom. Mobile/tablet sessions always start at fit-to-width
    // (zoom 100) so a zoom saved by a previous session can never leave the
    // page clipped on a cold load. Zoom set during the current session is
    // untouched. Desktop keeps its restored zoom.
    setZoom(isMobileDevice() ? 100 : loadZoomFromLocalStorage());

    const restoredViewerDocumentRevision = activateNextViewerDocumentRevision();

    loadPdfFromIndexedDB().then(async (savedPdf) => {
      if (activeViewerDocumentRevisionRef.current !== restoredViewerDocumentRevision) return;
      if (!savedPdf) {
        clearFieldSuggestionIntent();
        deactivateViewerDocumentRevision();
        return;
      }
      const savedFields = repairDuplicateEditorFieldIds(loadFieldsFromLocalStorage());
      const savedPage = loadPageFromLocalStorage();
      const savedName = loadFileNameFromLocalStorage();
      const startedFromPhoto = window.sessionStorage.getItem("qf-photo-capture-source") === "1";
      window.sessionStorage.removeItem("qf-photo-capture-source");
      const documentRevision = fieldSuggestionReviewEnabled
        ? await createDocumentRevision(savedPdf)
        : null;
      if (activeViewerDocumentRevisionRef.current !== restoredViewerDocumentRevision) return;
      const suggestionIntent = documentRevision && startedFromPhoto
        ? consumeFieldSuggestionIntent(documentRevision)
        : null;
      if (!fieldSuggestionReviewEnabled || !startedFromPhoto) clearFieldSuggestionIntent();
      currentDocumentRevisionRef.current = suggestionIntent ? documentRevision : null;

      setPdfBytes(savedPdf);
      setFileName(savedName);
      setCurrentPage(suggestionIntent ? 0 : savedPage);
      if (savedFields.length > 0) {
        reset(savedFields);
        saveFieldsToLocalStorage(savedFields);
      }
      markLocalSave("restored");
      setShowRestoredBanner(true);
      setTimeout(() => setShowRestoredBanner(false), 3000);
      if (suggestionIntent && documentRevision) {
        beginFieldSuggestionReview(documentRevision, startedFromPhoto, restoredViewerDocumentRevision);
      } else if (startedFromPhoto) {
        setShowAddAnotherPagePrompt(true);
      }
      pollCanvasForContent(pdfViewerRef, setMinimapCanvas);

      // Mark initial restoration as complete so persist effect can save
      initialRestoreDoneRef.current = true;

      // Detect AcroForm for progress tracking
      try {
        const acroFields = await detectAcroFormFields(savedPdf);
        if (activeViewerDocumentRevisionRef.current !== restoredViewerDocumentRevision) return;
        if (acroFields.length > 0) setHasAcroForm(true);
      } catch {
        // silent
      }
    });
  }, [
    reset,
    markLocalSave,
    fieldSuggestionReviewEnabled,
    beginFieldSuggestionReview,
    activateNextViewerDocumentRevision,
    deactivateViewerDocumentRevision,
  ]);

  useEffect(() => {
    if (!pdfBytes || !fieldSuggestionReview || fieldSuggestionReview.status !== "processing") return;

    let cancelled = false;
    const expectedDocumentRevision = fieldSuggestionReview.documentRevision;
    const expectedViewerDocumentRevision = fieldSuggestionReview.viewerDocumentRevision;
    const expectedReviewVersion = fieldSuggestionReview.reviewVersion;

    const finishFailClosed = (reason: unknown, metrics: {
      scanDurationMs?: number | null;
      incrementalDurationMs?: number | null;
    } = {}) => {
      if (cancelled) return;
      const current = fieldSuggestionReviewRef.current;
      if (
        !current ||
        current.documentRevision !== expectedDocumentRevision ||
        current.viewerDocumentRevision !== expectedViewerDocumentRevision ||
        current.reviewVersion !== expectedReviewVersion
      ) return;
      fieldSuggestionAnalyticsForReview(current)?.record({
        stage: "fail_closed",
        reason,
        scanDurationMs: metrics.scanDurationMs,
        incrementalDurationMs: metrics.incrementalDurationMs,
      });
      completeActiveFieldSuggestionAnalytics(
        "fail_closed",
        current.suggestions.length,
        current,
      );
      releaseFieldSuggestionSnapshot(true);
      fieldSuggestionReviewRef.current = null;
      setFieldSuggestionReview(null);
      if (current.showAddAnotherPagePromptAfter) setShowAddAnotherPagePrompt(true);
    };

    const timeout = setTimeout(
      () => finishFailClosed("snapshot_timeout"),
      FIELD_SUGGESTION_SNAPSHOT_WAIT_MS,
    );
    const lifecycle = fieldSuggestionSnapshotEvent;
    if (
      currentDocumentRevisionRef.current !== expectedDocumentRevision ||
      activeViewerDocumentRevisionRef.current !== expectedViewerDocumentRevision ||
      currentPage !== 0
    ) {
      finishFailClosed(currentPage !== 0 ? "page_changed" : "stale_document");
    } else if (
      lifecycle &&
      lifecycle.key.documentRevision === expectedViewerDocumentRevision &&
      (lifecycle.status === "failed" || lifecycle.status === "cancelled")
    ) {
      finishFailClosed(
        lifecycle.status === "failed" ? lifecycle.reason : "snapshot_cancelled",
        { scanDurationMs: lifecycle.scanDurationMs },
      );
    } else if (
      lifecycle?.status === "ready" &&
      lifecycle.key.documentRevision === expectedViewerDocumentRevision &&
      lifecycle.key.pageIndex === 0
    ) {
      const readyEvent = lifecycle;
      void import("@/lib/local-field-suggestion-provider")
        .then(({ mapLocalFieldSuggestions }) => {
          const incremental = fieldSuggestionIncrementalDurationRef.current;
          if (
            cancelled ||
            currentDocumentRevisionRef.current !== expectedDocumentRevision ||
            activeViewerDocumentRevisionRef.current !== expectedViewerDocumentRevision ||
            fieldSuggestionSnapshotEventRef.current !== readyEvent ||
            incremental?.event !== readyEvent ||
            !localFieldDetectionSnapshotKeysEqual(fieldSuggestionSnapshotEventRef.current?.key, readyEvent.key)
          ) {
            return;
          }

          const result = mapLocalFieldSuggestions({
            snapshot: readyEvent.snapshot,
            documentRevision: expectedDocumentRevision,
            expectedDocumentRevision: expectedViewerDocumentRevision,
            incrementalDurationMs: incremental.durationMs,
          });
          if (
            cancelled ||
            result.status !== "ready" ||
            currentDocumentRevisionRef.current !== expectedDocumentRevision ||
            activeViewerDocumentRevisionRef.current !== expectedViewerDocumentRevision ||
            fieldSuggestionSnapshotEventRef.current !== readyEvent
          ) {
            if (!cancelled && result.status !== "ready") {
              finishFailClosed(result.reason, {
                scanDurationMs: readyEvent.scanDurationMs,
                incrementalDurationMs: result.incrementalDurationMs,
              });
            }
            return;
          }

          const current = fieldSuggestionReviewRef.current;
          if (
            !current ||
            current.status !== "processing" ||
            current.documentRevision !== expectedDocumentRevision ||
            current.viewerDocumentRevision !== expectedViewerDocumentRevision ||
            current.reviewVersion !== expectedReviewVersion ||
            fieldSuggestionSnapshotEventRef.current !== readyEvent
          ) {
            return;
          }

          const stateStartedAt = performance.now();
          const next: ActiveFieldSuggestionReview = {
            ...current,
            snapshotKey: readyEvent.key,
            status: "review",
            suggestions: replaceFieldSuggestions(result.suggestions),
            errorMessage: undefined,
          };
          fieldSuggestionReviewRef.current = next;
          setFieldSuggestionReview(next);
          const stateDurationMs = performance.now() - stateStartedAt;
          const completeIncrementalDurationMs = result.incrementalDurationMs + stateDurationMs;
          if (
            !Number.isFinite(stateDurationMs) ||
            stateDurationMs < 0 ||
            !Number.isFinite(completeIncrementalDurationMs) ||
            completeIncrementalDurationMs > LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS
          ) {
            finishFailClosed("incremental_budget_exceeded", {
              scanDurationMs: readyEvent.scanDurationMs,
              incrementalDurationMs: completeIncrementalDurationMs,
            });
            return;
          }
          fieldSuggestionAnalyticsForReview(next)?.record({
            stage: "review_displayed",
            count: next.suggestions.length,
            scanDurationMs: readyEvent.scanDurationMs,
            incrementalDurationMs: completeIncrementalDurationMs,
          });
        })
        .catch(() => finishFailClosed("mapping_failed"));
    }

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    pdfBytes,
    currentPage,
    fieldSuggestionReview,
    fieldSuggestionSnapshotEvent,
    completeActiveFieldSuggestionAnalytics,
    fieldSuggestionAnalyticsForReview,
    releaseFieldSuggestionSnapshot,
  ]);

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
    invalidateFieldSuggestionReviewForRenderIntent();
    setZoom((prev) => ZOOM_LEVELS.find((z) => z > prev && z <= SNAP_MAX) ?? prev);
  }, [invalidateFieldSuggestionReviewForRenderIntent]);

  const handleZoomOut = useCallback(() => {
    invalidateFieldSuggestionReviewForRenderIntent();
    const mobile = isMobileDevice();
    setZoom((prev) => [...ZOOM_LEVELS].reverse().find((z) => z < prev && (mobile || z >= SNAP_MIN)) ?? prev);
  }, [invalidateFieldSuggestionReviewForRenderIntent]);

  // Fit to width: reset zoom to the base fit level AND ask the viewer to
  // re-measure the viewport and recompute its fit scale, so Fit works even
  // after rotation, resize, or a restored session left the page clipped.
  const handleFitToWidth = useCallback(() => {
    invalidateFieldSuggestionReviewForRenderIntent();
    setPinchZoomPreview(null);
    setZoom(100);
    pdfViewerRef.current?.refit?.();
  }, [invalidateFieldSuggestionReviewForRenderIntent]);

  // Pinch zoom (PR #94): live readout during the gesture, then a single
  // committed zoom value on release (clamped 50-200).
  const handleGestureZoomPreview = useCallback((value: number | null) => {
    setPinchZoomPreview(value);
  }, []);

  const handleGestureZoomCommit = useCallback((value: number) => {
    invalidateFieldSuggestionReviewForRenderIntent();
    setPinchZoomPreview(null);
    setZoom(clampGestureZoom(Math.round(value)));
  }, [invalidateFieldSuggestionReviewForRenderIntent]);

  const handleSnapZoom = useCallback(() => {
    invalidateFieldSuggestionReviewForRenderIntent();
    setZoom(150);
  }, [invalidateFieldSuggestionReviewForRenderIntent]);

  const handleFileLoad = useCallback(
    async (
      file: File,
      bytes: ArrayBuffer,
      source: "upload" | "template" = "upload",
      options?: {
        skipAcroFormDetection?: boolean;
        requestFieldSuggestions?: boolean;
        documentRevision?: string;
      }
    ) => {
      setIsLoading(true);
      const requestedViewerDocumentRevision = activateNextViewerDocumentRevision();
      const isCurrentDocumentLoad = () => (
        activeViewerDocumentRevisionRef.current === requestedViewerDocumentRevision
      );
      setShowAddAnotherPagePrompt(false);
      currentDocumentRevisionRef.current = null;
      clearFieldSuggestionIntent();
      if (source === "upload") {
        trackEvent("editor_upload_started", { sizeKb: Math.round(bytes.byteLength / 1024) });
        trackMetaEvent('QF_UploadStarted', { sizeKb: Math.round(bytes.byteLength / 1024) });
      }
      try {
        if (bytes.byteLength > PDF_UPLOAD_MAX_BYTES) {
          setToast(`This file is too large (max ${PDF_UPLOAD_MAX_LABEL})`);
          setTimeout(() => setToast(null), 5000);
          setIsLoading(false);
          deactivateViewerDocumentRevision();
          return;
        }

        let requestedDocumentRevision: string | null = null;
        if (fieldSuggestionReviewEnabled && options?.requestFieldSuggestions) {
          if (!options.documentRevision) {
            recordIneligibleFieldSuggestionAttempt("invalid_request");
          } else {
            const currentRevision = await createDocumentRevision(bytes);
            if (!isCurrentDocumentLoad()) return;
            if (currentRevision === options.documentRevision) {
              requestedDocumentRevision = currentRevision;
            } else {
              recordIneligibleFieldSuggestionAttempt("revision_mismatch");
            }
          }
        }

        if (!isCurrentDocumentLoad()) return;

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
        if (!isCurrentDocumentLoad()) return;
        saveFileNameToLocalStorage(file.name);
        markLocalSave("saved");

        setPdfBytes(bytes);
        setFileName(file.name);
        currentDocumentRevisionRef.current = requestedDocumentRevision;

        // Detect AcroForm fields
        let detectedAcroFieldCount = 0;
        if (options?.skipAcroFormDetection) {
          setHasAcroForm(false);
          reset([]);
        } else {
          try {
            const acroFields = await detectAcroFormFields(bytes);
            if (!isCurrentDocumentLoad()) return;
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
            if (!isCurrentDocumentLoad()) return;
            setHasAcroForm(false);
            reset([]);
          }
        }
        if (!isCurrentDocumentLoad()) return;
        trackEvent("editor_pdf_loaded", {
          source,
          sizeKb: Math.round(bytes.byteLength / 1024),
          hasAcroForm: detectedAcroFieldCount > 0,
          detectedFieldCount: detectedAcroFieldCount,
        });
        trackMetaEvent('ViewContent', { content_name: 'pdf_editor', content_type: source });
        if (requestedDocumentRevision) {
          beginFieldSuggestionReview(requestedDocumentRevision, false, requestedViewerDocumentRevision);
        }
      } catch {
        if (!isCurrentDocumentLoad()) return;
        setPdfBytes(null);
        setIsLoading(false);
        deactivateViewerDocumentRevision();
        currentDocumentRevisionRef.current = null;
        clearFieldSuggestionIntent();
        setToast("This PDF could not be opened. It may be encrypted or corrupted. Try a different file.");
        setTimeout(() => setToast(null), 5000);
      } finally {
        if (!isCurrentDocumentLoad()) return;
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
    [
      reset,
      pageScales,
      markLocalSave,
      fieldSuggestionReviewEnabled,
      beginFieldSuggestionReview,
      recordIneligibleFieldSuggestionAttempt,
      activateNextViewerDocumentRevision,
      deactivateViewerDocumentRevision,
    ]
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
      deactivateViewerDocumentRevision();
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
  }, [activeTemplate, handleFileLoad, reset, pageScales, deactivateViewerDocumentRevision]);

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

      // Preferred offset for the copy.
      let x = source.x + 12;
      let y = source.y + 12;

      // Clamp inside page bounds so the copy never lands partially off the
      // right/bottom edge. Field coords are in PDF point space, matching the
      // viewport-at-scale-1 dimensions. Only clamp when we have dimensions for
      // the field's own page (the viewer reports the current page's viewport);
      // otherwise preserve the plain offset behaviour.
      const dims =
        source.page === currentPage ? pdfViewerRef.current?.getViewportDims() ?? null : null;
      if (dims && dims.width > 0 && dims.height > 0) {
        const maxX = dims.width - source.width;
        const maxY = dims.height - source.height;
        // If the field is wider/taller than the page, pin to the top/left edge.
        x = maxX >= 0 ? Math.min(Math.max(x, 0), maxX) : 0;
        y = maxY >= 0 ? Math.min(Math.max(y, 0), maxY) : 0;
      }

      const dup = { ...source, id: newId, x, y } as EditorField;
      trackEvent("field_added", { source: "duplicate", type: dup.type });
      setFields((prev) => [...prev, dup]);
      setSelectedFieldId(newId);
    },
    [fields, setFields, currentPage]
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
      // No Ctrl/Cmd+D duplicate shortcut: browsers use it for bookmarks
      // (preventDefault is not reliable across browsers, e.g. Edge favourites).
      // Duplicate stays available via the Duplicate button, the mobile
      // bottom sheet, and the right-click context menu.
      // Escape: deselect
      if (e.key === "Escape") {
        setSelectedFieldId(null);
        setActiveTool("select");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);


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
        activateNextViewerDocumentRevision();
        currentDocumentRevisionRef.current = null;
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
    [pdfBytes, isAddingPage, markLocalSave, activateNextViewerDocumentRevision]
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
      activateNextViewerDocumentRevision();
      currentDocumentRevisionRef.current = null;
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
  }, [
    pdfBytes,
    totalPages,
    isRemovingPage,
    currentPage,
    fields,
    reset,
    pageScales,
    markLocalSave,
    activateNextViewerDocumentRevision,
  ]);

  const handleStartOver = useCallback(() => {
    clearFieldSuggestionIntent();
    currentDocumentRevisionRef.current = null;
    deactivateViewerDocumentRevision();
    setShowAddAnotherPagePrompt(false);
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
  }, [reset, pageScales, deactivateViewerDocumentRevision]);

  const showToast = useCallback((msg: string, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }, []);

  const finishFieldSuggestionReview = useCallback((
    outcome: FieldSuggestionOutcome,
    count?: number,
    expectedReview = fieldSuggestionReviewRef.current,
  ) => {
    const showAddAnotherPagePromptAfter = expectedReview?.showAddAnotherPagePromptAfter ?? false;
    if (expectedReview) {
      const session = fieldSuggestionAnalyticsForReview(expectedReview);
      if (outcome === "dismissed") session?.record({ stage: "dismissed" });
      completeActiveFieldSuggestionAnalytics(outcome, count, expectedReview);
    }
    clearFieldSuggestionIntent();
    fieldSuggestionReviewRef.current = null;
    setFieldSuggestionReview(null);
    releaseFieldSuggestionSnapshot(true);
    if (showAddAnotherPagePromptAfter) setShowAddAnotherPagePrompt(true);
  }, [
    completeActiveFieldSuggestionAnalytics,
    fieldSuggestionAnalyticsForReview,
    releaseFieldSuggestionSnapshot,
  ]);

  const handleFieldSuggestionDismiss = useCallback((expectedReview: ActiveFieldSuggestionReview) => {
    if (fieldSuggestionReviewRef.current !== expectedReview) return;
    finishFieldSuggestionReview("dismissed", undefined, expectedReview);
  }, [finishFieldSuggestionReview]);

  const handleFieldSuggestionTypeChange = useCallback((
    expectedReview: ActiveFieldSuggestionReview,
    id: string,
    type: SuggestedFieldType,
  ) => {
    const current = fieldSuggestionReviewRef.current;
    const lifecycle = fieldSuggestionSnapshotEventRef.current;
    if (
      current !== expectedReview ||
      current.status !== "review" ||
      activeViewerDocumentRevisionRef.current !== current.viewerDocumentRevision ||
      lifecycle?.status !== "ready" ||
      !localFieldDetectionSnapshotKeysEqual(current.snapshotKey, lifecycle.key)
    ) return;
    const next = {
      ...current,
      suggestions: current.suggestions.map((suggestion) =>
        suggestion.id === id ? withSuggestionType(suggestion, type) : suggestion),
    };
    fieldSuggestionReviewRef.current = next;
    setFieldSuggestionReview(next);
  }, []);

  const handleFieldSuggestionDecision = useCallback((
    expectedReview: ActiveFieldSuggestionReview,
    decision: FieldSuggestionReviewDecision,
  ) => {
    const review = fieldSuggestionReviewRef.current;
    const lifecycle = fieldSuggestionSnapshotEventRef.current;
    if (
      review !== expectedReview ||
      review.status !== "review" ||
      activeViewerDocumentRevisionRef.current !== review.viewerDocumentRevision ||
      currentDocumentRevisionRef.current !== review.documentRevision ||
      lifecycle?.status !== "ready" ||
      !localFieldDetectionSnapshotKeysEqual(review.snapshotKey, lifecycle.key)
    ) return;
    fieldSuggestionAnalyticsForReview(review)?.record({
      stage: decision === "accepted" ? "individual_accept" : "individual_reject",
    });
  }, [fieldSuggestionAnalyticsForReview]);

  const handleFieldSuggestionRetry = useCallback((expectedReview: ActiveFieldSuggestionReview) => {
    const current = fieldSuggestionReviewRef.current;
    const lifecycle = fieldSuggestionSnapshotEventRef.current;
    if (
      current !== expectedReview ||
      current.status !== "review" ||
      activeViewerDocumentRevisionRef.current !== current.viewerDocumentRevision ||
      currentDocumentRevisionRef.current !== current.documentRevision ||
      lifecycle?.status !== "ready" ||
      !localFieldDetectionSnapshotKeysEqual(current.snapshotKey, lifecycle.key)
    ) return;
    fieldSuggestionAnalyticsForReview(current)?.record({ stage: "retry" });
    const next: ActiveFieldSuggestionReview = {
      ...current,
      snapshotKey: null,
      status: "processing",
      suggestions: [],
      errorMessage: undefined,
      reviewVersion: current.reviewVersion + 1,
    };
    fieldSuggestionReviewRef.current = next;
    setFieldSuggestionReview(next);
  }, [fieldSuggestionAnalyticsForReview]);

  const handleFieldSuggestionCommit = useCallback((
    expectedReview: ActiveFieldSuggestionReview,
    acceptedSuggestions: readonly FieldSuggestion[],
    action: FieldSuggestionCommitAction,
  ) => {
    const review = fieldSuggestionReviewRef.current;
    const lifecycle = fieldSuggestionSnapshotEventRef.current;
    if (
      review !== expectedReview ||
      review.status !== "review" ||
      lifecycle?.status !== "ready" ||
      currentDocumentRevisionRef.current !== review.documentRevision ||
      activeViewerDocumentRevisionRef.current !== review.viewerDocumentRevision ||
      currentPage !== 0 ||
      !localFieldDetectionSnapshotKeysEqual(review.snapshotKey, lifecycle.key)
    ) return;

    const validated = validateFieldSuggestions(acceptedSuggestions, {
      documentRevision: review.documentRevision,
      pageIndex: 0,
      pageWidth: lifecycle.key.viewportWidth,
      pageHeight: lifecycle.key.viewportHeight,
    });
    if (validated.length !== acceptedSuggestions.length) {
      fieldSuggestionAnalyticsForReview(review)?.record({
        stage: "fail_closed",
        reason: "invalid_snapshot",
      });
      finishFieldSuggestionReview("fail_closed", 0, review);
      return;
    }

    // Final identity check immediately before the single history commit.
    if (
      currentDocumentRevisionRef.current !== review.documentRevision ||
      activeViewerDocumentRevisionRef.current !== review.viewerDocumentRevision ||
      fieldSuggestionSnapshotEventRef.current !== lifecycle ||
      !localFieldDetectionSnapshotKeysEqual(review.snapshotKey, lifecycle.key)
    ) return;

    if (action === "accept_all") {
      fieldSuggestionAnalyticsForReview(review)?.record({
        stage: "accept_all",
        count: validated.length,
      });
    }
    if (validated.length > 0) setFields([
      ...fields,
      ...fieldSuggestionsToEditorFields(validated, fields),
    ]);
    finishFieldSuggestionReview(
      action === "accept_all" ? "accepted_all" : "accepted_selected",
      validated.length,
      review,
    );
  }, [
    currentPage,
    fields,
    fieldSuggestionAnalyticsForReview,
    finishFieldSuggestionReview,
    setFields,
  ]);

  // One-time gesture discovery hint on touch devices (PR #94). Non-intrusive:
  // a single toast the first time a document opens, never again after that.
  useEffect(() => {
    if (!pdfBytes || typeof window === "undefined") return;
    const isTouchDevice =
      window.matchMedia?.("(pointer: coarse)").matches === true ||
      navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;
    try {
      if (localStorage.getItem(GESTURE_HINT_KEY)) return;
      localStorage.setItem(GESTURE_HINT_KEY, "1");
    } catch {
      return;
    }
    showToast("Pinch to zoom. Use two fingers to move around.", 5000);
  }, [pdfBytes, showToast]);

  const handleSaveProgress = useCallback(async () => {
    if (!fileName) return;

    // Anonymous users cannot save to an account. Local autosave already
    // protects their work on this device, so skip the doomed 401 request
    // and explain how account saving works instead of failing silently.
    if (isLoaded && !isSignedIn) {
      setShowSaveProgressPrompt(true);
      trackEvent("save_progress_anon_prompt");
      return;
    }

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
      } else if (res.status === 401) {
        // Clerk state was not loaded yet or the session expired mid-edit.
        setShowSaveProgressPrompt(true);
        trackEvent("save_progress_anon_prompt");
      } else if (res.status === 429) {
        showToast("Too many saves. Try again in a moment.");
      } else {
        showToast("Account save failed. Local autosave is still on.");
      }
    } catch {
      showToast("Account save failed. Local autosave is still on.");
    } finally {
      setSavingProgress(false);
    }
  }, [fileName, fields, currentPage, showToast, isLoaded, isSignedIn]);

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
      // Always remember on this device so anonymous users keep their
      // signature across sessions; account save stays best-effort.
      signatureChangedThisSessionRef.current = true;
      saveLocalSignature(dataUrl);
      setSavedSignature(dataUrl);
      setSavedSignatureSource("device");
      try {
        const res = await fetch("/api/signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signatureDataUrl: dataUrl }),
        });
        if (res.ok) setSavedSignatureSource("account");
      } catch {
        // Still applied locally even if account save fails
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

  const handleSignatureDelete = useCallback(async () => {
    signatureChangedThisSessionRef.current = true;
    clearLocalSignature();
    setSavedSignature(null);
    setSavedSignatureSource(null);
    try {
      // Best-effort account cleanup; anonymous users get a harmless 401.
      await fetch("/api/signature", { method: "DELETE" });
    } catch {
      // Local clear already succeeded
    }
    setPendingSignatureField(null);
    setSignatureModalOpen(false);
  }, []);

  const openDownloadPreviewGate = useCallback(() => {
    setShowDownloadPreviewGate(true);
  }, []);

  // Locked per-page previews for the download gate. The page the editor is
  // currently showing reuses the exact Konva live capture (identical to the
  // previous single-page gate); other pages render offscreen with the shared
  // gate-preview compositor. Never calls /api/fill-pdf.
  const renderGatePreviewPage = useCallback(
    async (pageIndex: number): Promise<string | null> => {
      if (pageIndex === currentPage) {
        try {
          const live = await pdfViewerRef.current?.getCompositePreviewURL();
          if (live) return live;
        } catch {
          // Fall through to the offscreen renderer.
        }
      }
      if (!pdfBytes) return null;
      return renderGatePagePreview(pdfBytes, fields, pageIndex);
    },
    [currentPage, pdfBytes, fields]
  );

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

          // Flattened Whiteout: render pages that contain whiteout fields and
          // burn the whiteout into the page image before it leaves the client.
          // Fails open: on any error the server keeps the vector whiteout.
          try {
            const flattenedPages = await renderFlattenedWhiteoutPages(pdf, fields);
            if (flattenedPages.length > 0) {
              fd.append("flattenedPages", JSON.stringify(flattenedPages));
            }
          } catch (err) {
            console.warn("Flattened whiteout rendering failed, keeping vector whiteout:", err);
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
    invalidateFieldSuggestionReviewForRenderIntent();
    setCurrentPage(page);
  }, [invalidateFieldSuggestionReviewForRenderIntent]);

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
                <span className="ml-1 text-text-muted">Upload a PDF, JPG, or PNG. Core editing runs in your browser. Cloud AI and completed-file generation process the data needed for those requests.</span>
              </div>
              <button onClick={dismissWelcome} className="shrink-0 text-text-muted hover:text-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <UploadZone
            onFileLoad={(upload: NormalizedDocumentUpload, suggestionOptions) =>
              handleFileLoad(
                new File([upload.pdfBytes], upload.fileName, { type: "application/pdf" }),
                upload.pdfBytes,
                "upload",
                {
                  skipAcroFormDetection: upload.skipAcroFormDetection,
                  ...suggestionOptions,
                }
              )
            }
          />

          <div className="mx-8 -mt-2 mb-8 grid gap-3 lg:grid-cols-3">
            {[
              { icon: LockKeyhole, title: "Browser-based editing", body: "Core editing keeps the working file and editor state in your browser." },
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
    <MediaEditorBoundary
      enabled={addMediaEnabled}
      documentRevision={viewerDocumentRevision ?? 0}
      currentPage={currentPage}
      getPageBounds={getMediaPageBounds}
      onMessage={showToast}
    >
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
        <div
          data-testid="editor-toast"
          className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg animate-fade-in max-w-md text-center"
        >
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
            <p className="min-w-0 truncate text-sm font-medium text-text-muted">{fileName}</p>
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
              {pinchZoomPreview ?? zoom}%
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
              onClick={handleFitToWidth}
              title="Fit to Page"
              aria-label="Fit document to screen width"
              className="ml-1 block rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
            >
              Fit
            </button>
            <button
              onClick={handleSnapZoom}
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
                  onClick={() => handlePageChange(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-alt transition-colors disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm tabular-nums text-text-muted">
                  Page {Math.min(currentPage + 1, totalPages)} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(Math.min(totalPages - 1, currentPage + 1))}
                  disabled={currentPage === totalPages - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-alt transition-colors disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

      <aside
        aria-label="Document processing modes"
        data-testid="editor-processing-disclosure"
        className="border-b border-border bg-surface-alt px-3 py-2 text-xs leading-5 text-text-muted sm:px-4"
      >
        <div className={`mx-auto grid max-w-6xl gap-1.5 ${fieldSuggestionReviewEnabled ? "sm:grid-cols-2 sm:gap-4" : ""}`}>
          {fieldSuggestionReviewEnabled && (
            <p>
              <strong className="font-semibold text-text">On-device:</strong>{" "}
              Local field suggestions reuse browser-derived geometry. No page image is sent to an
              external provider for that suggestion step.
            </p>
          )}
          <p>
            <strong className="font-semibold text-text">Cloud AI:</strong>{" "}
            Detect Fields sends an image of the current page through QuickFill&apos;s API to its
            configured third-party AI processor, currently OpenAI.
          </p>
        </div>
      </aside>

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

      {fieldSuggestionReview && (
        <FieldSuggestionReview
          key={`${fieldSuggestionReview.documentRevision}:${fieldSuggestionReview.reviewVersion}`}
          status={fieldSuggestionReview.status}
          suggestions={fieldSuggestionReview.suggestions}
          errorMessage={fieldSuggestionReview.errorMessage}
          onTypeChange={(id, type) => handleFieldSuggestionTypeChange(fieldSuggestionReview, id, type)}
          onCommit={(suggestions, action) => handleFieldSuggestionCommit(fieldSuggestionReview, suggestions, action)}
          onDecision={(decision) => handleFieldSuggestionDecision(fieldSuggestionReview, decision)}
          onRetry={() => handleFieldSuggestionRetry(fieldSuggestionReview)}
          onCancel={() => handleFieldSuggestionDismiss(fieldSuggestionReview)}
        />
      )}

      <AddAnotherPagePrompt
        open={showAddAnotherPagePrompt && !fieldSuggestionReview}
        onAddAnother={() => {
          setShowAddAnotherPagePrompt(false);
          addPageInputRef.current?.click();
        }}
        onDone={() => setShowAddAnotherPagePrompt(false)}
      />

      <SaveProgressPrompt
        open={showSaveProgressPrompt}
        onKeepEditing={() => setShowSaveProgressPrompt(false)}
        onSignInClick={() => trackEvent("save_progress_sign_in_click")}
      />

      {/* Sidebar + Canvas row. Side panels only mount at lg+ so tablet
          portrait never loses the document between two fixed 256px panels. */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-shrink-0 h-full overflow-hidden hidden lg:flex">
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
            fieldSuggestionDocumentRevision={fieldSuggestionReviewEnabled ? viewerDocumentRevision ?? undefined : undefined}
            onFieldSuggestionSnapshotEvent={fieldSuggestionReviewEnabled ? handleFieldSuggestionSnapshotEvent : undefined}
            onGestureZoomPreview={handleGestureZoomPreview}
            onGestureZoomCommit={handleGestureZoomCommit}
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
            onEditingChange={setEditingTextFieldId}
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
          suppressMobileSheet={editingTextFieldId !== null}
        />

      </div>

      {/* Floating bottom page nav, only on multi-page docs */}
      {pdfBytes && totalPages > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 hidden lg:flex items-center gap-2 rounded-full bg-navy shadow-xl border border-white/10 px-4 py-2">
          <span className="text-xs text-white/70 font-medium">{Math.min(currentPage + 1, totalPages)} / {totalPages}</span>
          <div className="w-px h-4 bg-white/20" />
          <button onClick={() => handlePageChange(Math.max(0, currentPage - 1))} disabled={currentPage === 0} className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => handlePageChange(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1} className="text-white/70 hover:text-white disabled:opacity-30 transition-colors">
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
        hidden={(selectedField !== null && activeTool !== "mask-eraser") || editingTextFieldId !== null}
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
          onDelete={handleSignatureDelete}
          existingSignature={savedSignature}
          signatureSource={savedSignatureSource}
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
        fileName={fileName}
        pageCount={Math.max(1, totalPages)}
        renderPagePreview={renderGatePreviewPage}
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
    </MediaEditorBoundary>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <EditorPageContent />
    </Suspense>
  );
}
