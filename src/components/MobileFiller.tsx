"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload,
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
import { PDF_UPLOAD_MAX_BYTES, PDF_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";

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
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [activeSigFieldId, setActiveSigFieldId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/signature")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.signatureDataUrl) setSavedSignature(d.signatureDataUrl); })
      .catch(() => {});
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
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Please upload a PDF file");
      return;
    }

    if (file.size > PDF_UPLOAD_MAX_BYTES) {
      showToast(`This PDF is too large. Please use a file under ${PDF_UPLOAD_MAX_LABEL}.`, 5000);
      return;
    }

    setIsLoading(true);
    setFileName(file.name);

    try {
      const bytes = await file.arrayBuffer();
      setPdfBytes(bytes);
      await savePdfToIndexedDB(bytes);
      saveFileNameToLocalStorage(file.name);
      savePageToLocalStorage(0);

      const detected = await detectAcroFormFields(bytes).catch(() => []);
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

      setStep("filling");
    } catch {
      setPdfBytes(null);
      showToast("This PDF could not be opened. Try a different file.", 5000);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
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
    try {
      await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: dataUrl }),
      });
      setSavedSignature(dataUrl);
    } catch {
      // Apply locally even if account save fails.
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

  const handleDownload = useCallback(async () => {
    if (!pdfBytes) return;
    setIsDownloading(true);
    try {
      let isPro = false;
      let canSaveFillHistory = false;
      const usageRes = await fetch("/api/usage");
      if (usageRes.ok) {
        const usage = await usageRes.json();
        isPro = usage.isPro;
        canSaveFillHistory = !usage.guest && !usage.qa;
        if (!isPro && usage.used >= usage.limit) {
          showToast("Free limit reached, upgrade to Pro for unlimited fills", 5000);
          setIsDownloading(false);
          return;
        }
      }

      const editorFields = fields.map(toEditorField);
      const fd = new FormData();
      fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "input.pdf");
      fd.append("fields", JSON.stringify(editorFields));
      fd.append("pageScales", JSON.stringify([]));
      fd.append("hasAcroForm", String(hasAcroForm));
      fd.append("addWatermark", String(!isPro));

      const fillRes = await fetch("/api/fill-pdf", { method: "POST", body: fd });
      if (!fillRes.ok) {
        const errBody = await fillRes.json().catch(() => ({ error: "Server error" }));
        throw new Error(errBody.error || `Server error ${fillRes.status}`);
      }

      const resultBuf = await fillRes.arrayBuffer();
      const blob = new Blob([resultBuf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + "-filled.pdf";
      a.click();
      URL.revokeObjectURL(url);

      await fetch("/api/usage", { method: "POST" });
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

      if (!isPro) showToast("Downloaded with QuickFill watermark. Pro removes it.", 5000);
      else setStep("done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed";
      showToast(
        message.includes("Free fill limit")
          ? "Free fill limit reached. Upgrade to Pro for unlimited downloads."
          : `Download failed: ${message}`,
        5000
      );
    } finally {
      setIsDownloading(false);
    }
  }, [pdfBytes, fields, fileName, hasAcroForm, showToast]);

  const handleReset = useCallback(() => {
    void clearEditorState();
    setStep("upload");
    setFileName("");
    setPdfBytes(null);
    setFields([]);
    setHasAcroForm(false);
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
          Upload a PDF, add text, ticks, signatures, and dates, then download your finished document.
        </p>

        <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFilePick} />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-accent py-4 text-base font-semibold text-white shadow-lg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {isLoading ? "Reading PDF..." : "Choose PDF"}
        </button>
        <p className="mt-4 text-xs text-text-muted">PDF files only, up to {PDF_UPLOAD_MAX_LABEL}</p>

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

      <SignatureModal
        open={sigModalOpen}
        onClose={() => { setSigModalOpen(false); setActiveSigFieldId(null); }}
        onSave={handleSignatureSave}
        existingSignature={savedSignature}
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
