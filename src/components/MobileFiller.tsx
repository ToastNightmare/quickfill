"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload,
  Camera,
  FileText,
  UserCheck,
  Download,
  ChevronLeft,
  CheckSquare,
  Square,
  RotateCcw,
  Loader2,
  PenTool,
  ArrowDown,
  CheckCircle2,
} from "lucide-react";
import { detectAcroFormFields } from "@/lib/pdf-utils";
import { SignatureModal } from "@/components/SignatureModal";
import { DownloadPreviewGate } from "@/components/DownloadPreviewGate";
import { trackEvent } from "@/lib/analytics";
import { loadPdfjsClient } from "@/lib/pdfjs-client";
import { trackAutofillShadowReport } from "@/lib/autofill-shadow-reporting";
import { autofillModeFromFlag, runProfileAutofill } from "@/lib/profile-autofill";
import {
  clearEditorState,
  saveFieldsToLocalStorage,
  saveFileNameToLocalStorage,
  savePageToLocalStorage,
  savePdfToIndexedDB,
} from "@/lib/persistence";
import type { EditorField } from "@/lib/types";
import {
  DOCUMENT_FILE_INPUT_ACCEPT,
  IMAGE_CAPTURE_ACCEPT,
  PDF_UPLOAD_MAX_LABEL,
} from "@/lib/upload-limits";
import { filledDocumentFilename, normalizeDocumentUpload } from "@/lib/document-intake";
import { isCleanablePhoto } from "@/lib/image-cleanup";
import { clearLocalSignature, loadLocalSignature, saveLocalSignature } from "@/lib/signature-store";
import { PhotoCleanupModal } from "@/components/PhotoCleanupModal";

const SIG_KEYWORDS = ["signature", "sign here", "signed", "sig", "esign", "e-sign"];

function isSignatureField(name: string): boolean {
  const lower = name.toLowerCase().replace(/[_\-.]/g, " ");
  return SIG_KEYWORDS.some((kw) => lower.includes(kw));
}

type FieldType = "text" | "checkbox" | "signature";

type MobileField = {
  id: string;
  name: string;
  type: FieldType;
  value: string;
  checked: boolean;
  signatureDataUrl?: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Step = "upload" | "filling" | "done";

function fieldIsFilled(field: MobileField) {
  if (field.type === "checkbox") return field.checked;
  if (field.type === "signature") return Boolean(field.signatureDataUrl);
  return field.value.trim() !== "";
}

function humanizeFieldName(name: string) {
  return name
    .replace(/[_\-.]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function inputTypeFor(label: string): "text" | "email" | "tel" {
  const lower = label.toLowerCase();
  if (lower.includes("email") || lower.includes("e-mail")) return "email";
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("tel")) return "tel";
  return "text";
}

function inputModeFor(label: string): "text" | "email" | "tel" | "numeric" {
  const lower = label.toLowerCase();
  if (lower.includes("email") || lower.includes("e-mail")) return "email";
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("tel")) return "tel";
  if (lower.includes("postcode") || lower.includes("zip") || lower.includes("tfn") || lower.includes("abn") || lower.includes("medicare")) return "numeric";
  return "text";
}

function toEditorField(field: MobileField): EditorField {
  if (field.type === "checkbox") {
    return {
      id: field.id,
      type: "checkbox",
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      page: field.page,
      checked: field.checked,
    };
  }

  if (field.type === "signature") {
    return {
      id: field.id,
      type: "signature",
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      page: field.page,
      value: field.value,
      fontSize: 14,
      signatureDataUrl: field.signatureDataUrl,
    };
  }

  return {
    id: field.id,
    type: "text",
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    page: field.page,
    value: field.value,
    fontSize: 12,
  };
}

function pageCountFromFields(fields: MobileField[]) {
  if (fields.length === 0) return 1;
  return Math.max(...fields.map((field) => field.page)) + 1;
}

const PREVIEW_MAX_WIDTH = 1000;

function drawImageInRect(
  ctx: CanvasRenderingContext2D,
  dataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = Math.min(w / img.width, h / img.height);
        const dw = img.width * ratio;
        const dh = img.height * ratio;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      } catch {
        // Skip the signature rather than lose the preview.
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

/**
 * Best-effort page 1 preview for the download gate. Renders the raw page with
 * pdf.js, then composites filled values on top. Field coordinates come from
 * detectAcroFormFields in top-left-origin PDF points (the same space the
 * editor overlay uses), so scaling by the viewport scale is safe. Compositing
 * is skipped on rotated pages; any failure returns null and the gate falls
 * back to its watermarked placeholder. Never calls /api/fill-pdf.
 */
async function renderMobilePreviewDataUrl(
  pdfBytes: ArrayBuffer,
  fields: MobileField[]
): Promise<string | null> {
  try {
    const pdfjs = await loadPdfjsClient();
    const pdf = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    if (!baseViewport.width || !baseViewport.height) return null;
    const scale = Math.min(2, PREVIEW_MAX_WIDTH / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({
      canvasContext: ctx,
      viewport,
    } as Parameters<typeof page.render>[0]).promise;

    if ((page.rotate ?? 0) % 360 === 0) {
      for (const field of fields) {
        if (field.page !== 0 || !fieldIsFilled(field)) continue;
        const x = field.x * scale;
        const y = field.y * scale;
        const w = field.width * scale;
        const h = field.height * scale;
        try {
          if (field.type === "checkbox" && field.checked) {
            ctx.strokeStyle = "#111827";
            ctx.lineWidth = Math.max(1.5, h * 0.12);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x + w * 0.22, y + h * 0.55);
            ctx.lineTo(x + w * 0.42, y + h * 0.75);
            ctx.lineTo(x + w * 0.78, y + h * 0.28);
            ctx.stroke();
          } else if (field.type === "signature" && field.signatureDataUrl) {
            await drawImageInRect(ctx, field.signatureDataUrl, x, y, w, h);
          } else if (field.type === "text" && field.value.trim() !== "") {
            const fontSize = Math.max(9, Math.min(12 * scale, h * 0.7));
            ctx.fillStyle = "#111827";
            ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
            ctx.textBaseline = "middle";
            ctx.fillText(field.value, x + 2 * scale, y + h / 2, Math.max(w - 4 * scale, 10));
          }
        } catch {
          // Skip a field rather than lose the whole preview.
        }
      }
    }

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function MobileFiller() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fields, setFields] = useState<MobileField[]>([]);
  const [hasAcroForm, setHasAcroForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedSignatureSource, setSavedSignatureSource] = useState<"account" | "device" | null>(null);
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [activeSigFieldId, setActiveSigFieldId] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [showDownloadGate, setShowDownloadGate] = useState(false);
  const [downloadPreviewUrl, setDownloadPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoCaptureInputRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const applyLocalFallback = () => {
      const local = loadLocalSignature();
      if (local) {
        setSavedSignature(local);
        setSavedSignatureSource("device");
      }
    };
    fetch("/api/signature")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.signatureDataUrl) {
          setSavedSignature(d.signatureDataUrl);
          setSavedSignatureSource("account");
        } else {
          applyLocalFallback();
        }
      })
      .catch(applyLocalFallback);
  }, []);

  useEffect(() => {
    if (!pdfBytes) return;
    saveFieldsToLocalStorage(fields.map(toEditorField));
  }, [fields, pdfBytes]);

  const showToast = useCallback((msg: string, ms = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  const scrollToNextEmpty = useCallback(() => {
    const next = fields.find((field) => !fieldIsFilled(field));
    if (!next) {
      showToast("Every detected field is filled");
      return;
    }
    fieldRefs.current[next.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [fields, showToast]);

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);

    try {
      const upload = await normalizeDocumentUpload(file);
      const bytes = upload.pdfBytes;
      setFileName(upload.fileName);
      setPdfBytes(bytes);
      await savePdfToIndexedDB(bytes);
      saveFileNameToLocalStorage(upload.fileName);
      savePageToLocalStorage(0);

      const detected = upload.skipAcroFormDetection
        ? []
        : await detectAcroFormFields(bytes).catch(() => []);
      if (detected.length > 0) {
        const nextFields = detected.map((f) => ({
          id: f.name,
          name: f.name,
          type: isSignatureField(f.name) ? "signature" as const : f.type,
          value: f.value ?? "",
          checked: false,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
        }));
        setHasAcroForm(true);
        setFields(nextFields);
        saveFieldsToLocalStorage(nextFields.map(toEditorField));
      } else {
        setHasAcroForm(false);
        setFields([]);
        saveFieldsToLocalStorage([]);
      }

      if (upload.skipAcroFormDetection && typeof window !== "undefined") {
        if (upload.sourceType === "image") {
          window.sessionStorage.setItem("qf-photo-capture-source", "1");
        }
        window.location.assign("/editor?advanced=1");
        return;
      }

      setStep("filling");
    } catch (error) {
      setPdfBytes(null);
      const message = error instanceof Error ? error.message : "This file could not be opened. Try a different file.";
      showToast(message, 5000);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (isCleanablePhoto(file)) {
      setPendingPhoto(file);
      return;
    }
    void handleFile(file);
  }, [handleFile]);

  const handleAutoFill = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        showToast("Sign in and save your profile first");
        return;
      }
      const profile = await res.json();
      if (!profile?.fullName) {
        showToast("No profile saved. Add your details in Profile first.");
        return;
      }

      const mode = autofillModeFromFlag(process.env.NEXT_PUBLIC_QUICKFILL_AUTOFILL_MODE);
      const result = runProfileAutofill(fields, profile, mode);
      setFields(result.fields as MobileField[]);
      trackAutofillShadowReport(result, { surface: "mobile", hasAcroForm });
      showToast(result.matched > 0 ? `Auto-filled ${result.matched} field${result.matched > 1 ? "s" : ""}` : "No matching fields found");
    } catch {
      showToast("Failed to load profile");
    }
  }, [fields, hasAcroForm, showToast]);

  // ── Signature
  const openSignatureModal = useCallback((fieldId: string) => {
    setActiveSigFieldId(fieldId);
    setSigModalOpen(true);
  }, []);

  const handleSignatureSave = useCallback(async (dataUrl: string) => {
    // Always remember on this device so anonymous users keep their
    // signature across sessions; account save stays best-effort.
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
      // Already applied locally even if account save fails.
    }

    if (activeSigFieldId) {
      setFields((prev) => prev.map((f) =>
        f.id === activeSigFieldId ? { ...f, signatureDataUrl: dataUrl, value: "Signed" } : f
      ));
    }
    setSigModalOpen(false);
    setActiveSigFieldId(null);
  }, [activeSigFieldId]);

  const handleSignatureUseExisting = useCallback(() => {
    if (activeSigFieldId && savedSignature) {
      setFields((prev) => prev.map((f) =>
        f.id === activeSigFieldId ? { ...f, signatureDataUrl: savedSignature, value: "Signed" } : f
      ));
    }
    setSigModalOpen(false);
    setActiveSigFieldId(null);
  }, [activeSigFieldId, savedSignature]);

  const handleSignatureDelete = useCallback(async () => {
    clearLocalSignature();
    setSavedSignature(null);
    setSavedSignatureSource(null);
    try {
      // Best-effort account cleanup; anonymous users get a harmless 401.
      await fetch("/api/signature", { method: "DELETE" });
    } catch {
      // Local clear already succeeded
    }
    setSigModalOpen(false);
    setActiveSigFieldId(null);
  }, []);

  const openDownloadGate = useCallback(() => {
    setDownloadPreviewUrl(null);
    setShowDownloadGate(true);
    if (!pdfBytes) return;
    void renderMobilePreviewDataUrl(pdfBytes, fields).then((url) => {
      if (url) setDownloadPreviewUrl(url);
    });
  }, [pdfBytes, fields]);

  const handleDownload = useCallback(async () => {
    if (!pdfBytes) return;
    trackEvent("download_attempt", {
      surface: "mobile",
      fieldCount: fields.length,
      pageCount: pageCountFromFields(fields),
      hasAcroForm,
    });
    setIsDownloading(true);
    try {
      // Determine Pro status. Fail safe: any error or non-ok response treats
      // the user as non-Pro, same as the desktop editor.
      let isPro = false;
      let canSaveFillHistory = false;
      try {
        const usageRes = await fetch("/api/usage");
        if (usageRes.ok) {
          const usage = await usageRes.json();
          isPro = Boolean(usage.isPro || usage.tier === "pro" || usage.tier === "business");
          canSaveFillHistory = !usage.guest && !usage.qa;
        }
      } catch {
        // Treated as non-Pro below.
      }

      // Non-Pro users always see the gate. Never call fill-pdf before payment.
      if (!isPro) {
        trackEvent("download_gate_shown", { source: "mobile_filler" });
        openDownloadGate();
        return;
      }

      const editorFields = fields.map(toEditorField);
      const fd = new FormData();
      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");
      fd.append("fields", JSON.stringify(editorFields));
      fd.append("pageScales", JSON.stringify([]));
      fd.append("hasAcroForm", String(hasAcroForm));

      const fillRes = await fetch("/api/fill-pdf", { method: "POST", body: fd });
      if (!fillRes.ok) {
        if (fillRes.status === 402) {
          // Server-side entitlement safety net.
          trackEvent("download_gate_shown", { source: "mobile_api_402_safety" });
          openDownloadGate();
          return;
        }
        const errBody = await fillRes.json().catch(() => ({ error: "Server error" }));
        throw new Error(errBody.error || `Server error ${fillRes.status}`);
      }

      const resultBuf = await fillRes.arrayBuffer();
      const blob = new Blob([resultBuf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filledDocumentFilename(fileName);
      a.click();
      URL.revokeObjectURL(url);

      if (canSaveFillHistory) {
        try {
          await fetch("/api/fills", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: fileName, filledAt: new Date().toISOString(), fieldCount: fields.length, pageCount: pageCountFromFields(fields) }),
          });
        } catch {
          // Non-critical.
        }
      }

      trackEvent("download_success", {
        surface: "mobile",
        pro: true,
        fieldCount: fields.length,
        pageCount: pageCountFromFields(fields),
      });
      setStep("done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed";
      showToast(`Download failed: ${message}`, 5000);
    } finally {
      setIsDownloading(false);
    }
  }, [pdfBytes, fields, fileName, hasAcroForm, showToast, openDownloadGate]);

  const handleReset = useCallback(() => {
    void clearEditorState();
    setStep("upload");
    setFileName("");
    setPdfBytes(null);
    setFields([]);
    setHasAcroForm(false);
    setShowDownloadGate(false);
    setDownloadPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const filledCount = fields.filter(fieldIsFilled).length;
  const allFilled = fields.length > 0 && filledCount === fields.length;

  if (step === "upload") {
    return (
      <div className="flex min-h-[calc(100svh-64px)] flex-col items-center justify-center px-6 pb-8">
        <Toast msg={toast} />
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
          <FileText className="h-8 w-8 text-accent" />
        </div>
        <h1 className="mb-2 text-center text-2xl font-bold text-text">Finish paperwork fast</h1>
        <p className="mb-8 max-w-xs text-center text-sm leading-relaxed text-text-muted">
          Upload a PDF, JPG, or PNG. Add text, ticks, signatures, and dates, then download your finished document.
        </p>

        <input ref={fileInputRef} type="file" accept={DOCUMENT_FILE_INPUT_ACCEPT} className="hidden" onChange={handleFilePick} />
        <input
          ref={photoCaptureInputRef}
          type="file"
          accept={IMAGE_CAPTURE_ACCEPT}
          capture="environment"
          className="hidden"
          onChange={handleFilePick}
          aria-label="Take photo"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-accent py-4 text-base font-semibold text-white shadow-lg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {isLoading ? "Reading file..." : "Choose file"}
        </button>
        <button
          type="button"
          onClick={() => photoCaptureInputRef.current?.click()}
          disabled={isLoading}
          className="mt-3 flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-4 text-base font-semibold text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-60 sm:hidden"
        >
          <Camera className="h-5 w-5" />
          Take photo
        </button>
        <p className="mt-4 text-xs text-text-muted">PDF, JPG, or PNG, up to {PDF_UPLOAD_MAX_LABEL}</p>

        {pendingPhoto && (
          <PhotoCleanupModal
            file={pendingPhoto}
            onConfirm={(cleanedFile) => {
              setPendingPhoto(null);
              void handleFile(cleanedFile);
            }}
            onCancel={() => setPendingPhoto(null)}
          />
        )}

        <div className="mt-10 w-full max-w-sm rounded-2xl border border-border bg-surface-alt p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">Works well for</p>
          <div className="flex flex-col gap-2 text-sm text-text-muted">
            {["Everyday paperwork", "Applications", "Agreements", "Worksheets"].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex min-h-[calc(100svh-64px)] flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
          <Download className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-text">All done!</h1>
        <p className="mb-8 text-sm text-text-muted">Your filled PDF has been downloaded.</p>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <RotateCcw className="h-4 w-4" />
          Fill another PDF
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100svh-64px)] flex-col bg-surface-alt/40">
      <Toast msg={toast} />

      <div className="sticky top-16 z-30 border-b border-border bg-surface">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={handleReset} className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-alt">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{fileName}</p>
            {fields.length > 0 && (
              <p className="text-xs text-text-muted">{filledCount} of {fields.length} filled</p>
            )}
          </div>
          {fields.length > 0 && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${allFilled ? "bg-green-50 text-green-700" : "bg-accent/10 text-accent"}`}>
              {allFilled ? "Ready" : "In progress"}
            </span>
          )}
        </div>

        {fields.length > 0 && (
          <>
            <div className="h-1 bg-surface-alt">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${Math.round((filledCount / fields.length) * 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 py-3">
              <button
                onClick={handleAutoFill}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold text-text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <UserCheck className="h-4 w-4" />
                Auto-fill
              </button>
              <button
                onClick={scrollToNextEmpty}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold text-text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <ArrowDown className="h-4 w-4" />
                Next empty
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 px-4 py-5 pb-36">
        {!hasAcroForm || fields.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
            <FileText className="mx-auto mb-3 h-8 w-8 text-text-muted" />
            <p className="mb-1 text-sm font-semibold text-text">Need to place fields manually?</p>
            <p className="text-xs leading-relaxed text-text-muted">
              Open the full editor with this same PDF to add text, boxes, signatures, dates, and ticks wherever you need them.
            </p>
            <div className="mt-5 grid gap-2">
              <a
                href="/editor?advanced=1"
                className="flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                Open full editor
              </a>
              <Link
                href="/templates"
                className="flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text-muted transition-colors hover:bg-surface-alt"
              >
                Try a template instead
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {fields.map((field) => (
              <FieldCard
                key={field.id}
                field={field}
                isFilled={fieldIsFilled(field)}
                setRef={(node) => { fieldRefs.current[field.id] = node; }}
                onTextChange={(val) => setFields((prev) => prev.map((f) => f.id === field.id ? { ...f, value: val } : f))}
                onCheckboxToggle={() => setFields((prev) => prev.map((f) => f.id === field.id ? { ...f, checked: !f.checked } : f))}
                onSignatureTap={() => openSignatureModal(field.id)}
              />
            ))}
          </div>
        )}
      </div>

      {hasAcroForm && fields.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-10px_30px_rgba(15,23,42,0.12)]">
          <div className={allFilled ? "grid" : "grid grid-cols-[0.9fr_1.1fr] gap-2"}>
            {!allFilled && (
              <button
                onClick={scrollToNextEmpty}
                className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface-alt py-4 text-sm font-semibold text-text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <ArrowDown className="h-4 w-4" />
                Next
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-base font-semibold text-white shadow-lg transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {isDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              {isDownloading ? "Saving..." : "Download PDF"}
            </button>
          </div>
        </div>
      )}

      <DownloadPreviewGate
        open={showDownloadGate}
        onClose={() => setShowDownloadGate(false)}
        previewDataUrl={downloadPreviewUrl}
        fileName={fileName}
        checkoutSource="download_preview_gate_mobile"
      />

      <SignatureModal
        open={sigModalOpen}
        onClose={() => { setSigModalOpen(false); setActiveSigFieldId(null); }}
        onSave={handleSignatureSave}
        onDelete={handleSignatureDelete}
        existingSignature={savedSignature}
        signatureSource={savedSignatureSource}
        useMode
        onUseExisting={handleSignatureUseExisting}
      />
    </div>
  );
}

function FieldCard({
  field,
  isFilled,
  setRef,
  onTextChange,
  onCheckboxToggle,
  onSignatureTap,
}: {
  field: MobileField;
  isFilled: boolean;
  setRef: (node: HTMLDivElement | null) => void;
  onTextChange: (val: string) => void;
  onCheckboxToggle: () => void;
  onSignatureTap: () => void;
}) {
  const label = humanizeFieldName(field.name);
  const pageTag = field.page > 0 ? `p.${field.page + 1}` : null;

  return (
    <div ref={setRef} className={`rounded-xl border bg-surface p-4 shadow-sm ${isFilled ? "border-green-200" : "border-border"}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-2">
          {isFilled && <CheckCircle2 className="h-4 w-4 text-green-600" />}
          {pageTag && <span className="text-[10px] text-text-muted/60">{pageTag}</span>}
        </div>
      </div>

      {field.type === "checkbox" && (
        <button
          onClick={onCheckboxToggle}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-alt px-3 py-3 text-left"
        >
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${field.checked ? "border-accent bg-accent" : "border-border bg-surface"}`}>
            {field.checked ? <CheckSquare className="h-4 w-4 text-white" /> : <Square className="h-4 w-4 text-text-muted" />}
          </div>
          <span className="text-sm font-medium text-text">{field.checked ? "Checked" : "Tap to check"}</span>
        </button>
      )}

      {field.type === "text" && (
        <input
          type={inputTypeFor(label)}
          inputMode={inputModeFor(label)}
          value={field.value}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Type here"
          enterKeyHint="next"
          className="w-full rounded-xl border border-border bg-surface-alt px-3 py-3 text-text outline-none transition-colors focus:border-accent focus:bg-white"
          style={{ fontSize: 16 }}
        />
      )}

      {field.type === "signature" && (
        <button
          onClick={onSignatureTap}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 transition-colors ${
            field.signatureDataUrl
              ? "border-green-300 bg-green-50"
              : "border-border bg-surface-alt hover:border-accent/50 hover:bg-accent/5"
          }`}
        >
          {field.signatureDataUrl ? (
            <img
              src={field.signatureDataUrl}
              alt="Signature"
              className="max-h-12 max-w-[220px] object-contain"
            />
          ) : (
            <>
              <PenTool className="h-4 w-4 text-text-muted" />
              <span className="text-sm font-medium text-text-muted">Tap to sign</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="fixed left-1/2 top-20 z-50 max-w-xs -translate-x-1/2 rounded-xl bg-gray-900/90 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg">
      {msg}
    </div>
  );
}
