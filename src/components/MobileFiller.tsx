"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, FileText, UserCheck, Download,
  ChevronLeft, CheckSquare, Square, RotateCcw,
  Loader2, PenTool,
} from "lucide-react";
import { detectAcroFormFields } from "@/lib/pdf-utils";
import { SignatureModal } from "@/components/SignatureModal";

// ── Profile matcher ─────────────────────────────────────────────────────────
const PROFILE_MATCHERS: { key: string; keywords: string[] }[] = [
  { key: "fullName",      keywords: ["name", "full name", "fullname", "given name", "applicant"] },
  { key: "email",         keywords: ["email", "e-mail", "email address"] },
  { key: "phone",         keywords: ["phone", "telephone", "mobile", "tel", "contact number"] },
  { key: "street",        keywords: ["address", "street", "address line 1", "address1"] },
  { key: "addressLine2",  keywords: ["address line 2", "address2", "apt", "unit", "suite"] },
  { key: "city",          keywords: ["city", "suburb", "town", "locality"] },
  { key: "state",         keywords: ["state", "territory", "province", "region"] },
  { key: "postcode",      keywords: ["postcode", "post code", "zip", "postal", "post"] },
  { key: "abn",           keywords: ["abn", "business number"] },
  { key: "organisation",  keywords: ["organisation", "organization", "company", "employer"] },
];
const SIG_KEYWORDS = ["signature", "sign here", "signed", "sig", "esign", "e-sign"];

function matchProfileKey(name: string): string | null {
  const lower = name.toLowerCase().replace(/[_\-\.]/g, " ");
  for (const { key, keywords } of PROFILE_MATCHERS) {
    for (const kw of keywords) { if (lower.includes(kw)) return key; }
  }
  return null;
}

function isSignatureField(name: string): boolean {
  const lower = name.toLowerCase().replace(/[_\-\.]/g, " ");
  return SIG_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Types ───────────────────────────────────────────────────────────────────
type FieldType = "text" | "checkbox" | "signature";

type MobileField = {
  id: string;
  name: string;
  type: FieldType;
  value: string;
  checked: boolean;
  signatureDataUrl?: string;
  page: number;
  x: number; y: number; width: number; height: number;
};

type Step = "upload" | "filling" | "done";

// ── Component ───────────────────────────────────────────────────────────────
export function MobileFiller() {
  const [step, setStep]               = useState<Step>("upload");
  const [fileName, setFileName]       = useState("");
  const [pdfBytes, setPdfBytes]       = useState<ArrayBuffer | null>(null);
  const [fields, setFields]           = useState<MobileField[]>([]);
  const [hasAcroForm, setHasAcroForm] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toast, setToast]             = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [sigModalOpen, setSigModalOpen]     = useState(false);
  const [activeSigFieldId, setActiveSigFieldId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved signature on mount
  useEffect(() => {
    fetch("/api/signature")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.signatureDataUrl) setSavedSignature(d.signatureDataUrl); })
      .catch(() => {});
  }, []);

  const showToast = useCallback((msg: string, ms = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Please upload a PDF file");
      return;
    }
    setIsLoading(true);
    setFileName(file.name);
    const bytes = await file.arrayBuffer();
    setPdfBytes(bytes);

    try {
      const detected = await detectAcroFormFields(bytes);
      if (detected.length > 0) {
        setHasAcroForm(true);
        setFields(detected.map((f) => ({
          id: f.name,
          name: f.name,
          type: isSignatureField(f.name) ? "signature" : f.type,
          value: f.value ?? "",
          checked: false,
          page: f.page,
          x: f.x, y: f.y, width: f.width, height: f.height,
        })));
      } else {
        setHasAcroForm(false);
        setFields([]);
      }
    } catch {
      setHasAcroForm(false);
      setFields([]);
    }

    setIsLoading(false);
    setStep("filling");
  }, [showToast]);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Auto-fill from profile ─────────────────────────────────────────────────
  const handleAutoFill = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) { showToast("Sign in and save your profile first"); return; }
      const profile = await res.json();
      if (!profile?.fullName) { showToast("No profile saved, go to Profile to set one up"); return; }

      let matched = 0;
      setFields((prev) => prev.map((f) => {
        if (f.type !== "text") return f;
        const key = matchProfileKey(f.name);
        if (key && profile[key]) { matched++; return { ...f, value: profile[key] }; }
        return f;
      }));
      showToast(matched > 0 ? `Auto-filled ${matched} field${matched > 1 ? "s" : ""}` : "No matching fields found");
    } catch {
      showToast("Failed to load profile");
    }
  }, [showToast]);

  // ── Signature ──────────────────────────────────────────────────────────────
  const openSignatureModal = useCallback((fieldId: string) => {
    setActiveSigFieldId(fieldId);
    setSigModalOpen(true);
  }, []);

  const handleSignatureSave = useCallback(async (dataUrl: string) => {
    // Save to account
    try {
      await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: dataUrl }),
      });
      setSavedSignature(dataUrl);
    } catch { /* apply locally even if save fails */ }

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

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!pdfBytes) return;
    setIsDownloading(true);
    try {
      let isPro = false;
      const usageRes = await fetch("/api/usage");
      if (usageRes.ok) {
        const usage = await usageRes.json();
        isPro = usage.isPro;
        if (!isPro && usage.used >= usage.limit) {
          showToast("Free limit reached, upgrade to Pro for unlimited fills", 5000);
          setIsDownloading(false);
          return;
        }
      }

      // Map to EditorField shape
      const editorFields = fields.map((f) => {
        if (f.type === "checkbox") {
          return { id: f.id, type: "checkbox" as const, x: f.x, y: f.y, width: f.width, height: f.height, page: f.page, checked: f.checked };
        }
        if (f.type === "signature") {
          return { id: f.id, type: "signature" as const, x: f.x, y: f.y, width: f.width, height: f.height, page: f.page, value: f.value, fontSize: 14, signatureDataUrl: f.signatureDataUrl };
        }
        return { id: f.id, type: "text" as const, x: f.x, y: f.y, width: f.width, height: f.height, page: f.page, value: f.value, fontSize: 12 };
      });

      // Use server-side fill API (same as desktop), avoids WinAnsi browser crash
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
      try {
        await fetch("/api/fills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: fileName, filledAt: new Date().toISOString(), fieldCount: fields.length, pageCount: 1 }),
        });
      } catch { /* non-critical */ }

      if (!isPro) showToast("Downloaded with QuickFill watermark, upgrade Pro to remove it", 5000);
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
    setStep("upload");
    setFileName("");
    setPdfBytes(null);
    setFields([]);
    setHasAcroForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const filledCount = fields.filter((f) =>
    f.type === "checkbox" ? f.checked : f.type === "signature" ? !!f.signatureDataUrl : f.value.trim() !== ""
  ).length;

  // ── Upload ─────────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100svh-64px)] px-6 pb-8">
        <Toast msg={toast} />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mb-5">
          <FileText className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2 text-center">Fill a PDF</h1>
        <p className="text-text-muted text-sm text-center mb-8 max-w-xs leading-relaxed">
          Upload any PDF form. We'll detect fillable fields automatically, just type and download.
        </p>

        <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFilePick} />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-accent py-4 text-base font-semibold text-white shadow-lg hover:bg-accent-hover disabled:opacity-60 transition-colors"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {isLoading ? "Reading PDF..." : "Choose PDF"}
        </button>
        <p className="mt-4 text-xs text-text-muted">PDF files only, up to 50MB</p>

        <div className="mt-10 w-full max-w-sm rounded-2xl border border-border bg-surface-alt p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">Works best with</p>
          <div className="flex flex-col gap-2 text-sm text-text-muted">
            {["ATO tax forms", "Medicare & Centrelink", "Rental applications", "Council & permit forms"].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-accent/60 shrink-0" />
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100svh-64px)] px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 mb-5">
          <Download className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">All done!</h1>
        <p className="text-text-muted text-sm mb-8">Your filled PDF has been downloaded.</p>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Fill another PDF
        </button>
      </div>
    );
  }

  // ── Filling ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-[calc(100svh-64px)]">
      <Toast msg={toast} />

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 sticky top-16 z-30">
        <button onClick={handleReset} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-alt transition-colors text-text-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-text">{fileName}</p>
          {fields.length > 0 && (
            <p className="text-xs text-text-muted">{filledCount} of {fields.length} filled</p>
          )}
        </div>
        {fields.length > 0 && (
          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            {filledCount === fields.length ? "Ready" : "In progress"}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {fields.length > 0 && (
        <div className="h-1 bg-surface-alt">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${Math.round((filledCount / fields.length) * 100)}%` }}
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 px-4 py-5 pb-36">

        {/* Auto-fill strip */}
        {fields.some((f) => f.type === "text") && (
          <button
            onClick={handleAutoFill}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-medium text-text-muted hover:bg-surface-alt transition-colors mb-5"
          >
            <UserCheck className="h-4 w-4 text-green-600" />
            Auto-fill from Profile
          </button>
        )}

        {/* No fields */}
        {!hasAcroForm || fields.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface-alt p-6 text-center">
            <FileText className="h-8 w-8 text-text-muted mx-auto mb-3" />
            <p className="text-sm font-semibold text-text mb-1">Flat PDF detected</p>
            <p className="text-xs text-text-muted leading-relaxed">
              This file does not expose standard fields. You can still use the full editor to place text, boxes, signatures, and ticks manually.
            </p>
            <div className="mt-5 grid gap-2">
              <Link
                href="/editor?advanced=1"
                className="flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                Open full editor
              </Link>
              <Link
                href="/templates"
                className="flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text-muted hover:bg-surface transition-colors"
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
                onTextChange={(val) => setFields((prev) => prev.map((f) => f.id === field.id ? { ...f, value: val } : f))}
                onCheckboxToggle={() => setFields((prev) => prev.map((f) => f.id === field.id ? { ...f, checked: !f.checked } : f))}
                onSignatureTap={() => openSignatureModal(field.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sticky download bar */}
      {hasAcroForm && fields.length > 0 && (
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] z-30">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-base font-semibold text-white shadow-lg hover:bg-accent-hover disabled:opacity-60 transition-colors"
        >
          {isDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          {isDownloading ? "Saving..." : "Download Filled PDF"}
        </button>
      </div>
      )}

      {/* Signature modal */}
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

// ── Field card ──────────────────────────────────────────────────────────────
function FieldCard({
  field,
  onTextChange,
  onCheckboxToggle,
  onSignatureTap,
}: {
  field: MobileField;
  onTextChange: (val: string) => void;
  onCheckboxToggle: () => void;
  onSignatureTap: () => void;
}) {
  const label = field.name.replace(/[_\-\.]/g, " ");
  const pageTag = field.page > 0 ? `p.${field.page + 1}` : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </label>
        {pageTag && <span className="text-[10px] text-text-muted/60 ml-2">{pageTag}</span>}
      </div>

      {field.type === "checkbox" && (
        <button
          onClick={onCheckboxToggle}
          className="flex items-center gap-3 w-full py-1"
        >
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-colors shrink-0 ${field.checked ? "border-accent bg-accent" : "border-border bg-surface"}`}>
            {field.checked ? <CheckSquare className="h-4 w-4 text-white" /> : <Square className="h-4 w-4 text-text-muted" />}
          </div>
          <span className="text-sm text-text">{field.checked ? "Checked" : "Tap to check"}</span>
        </button>
      )}

      {field.type === "text" && (
        <input
          type="text"
          value={field.value}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Type here..."
          className="w-full rounded-lg border border-border bg-surface-alt px-3 py-3 text-text outline-none focus:border-accent focus:bg-white transition-colors"
          style={{ fontSize: 16 }}
        />
      )}

      {field.type === "signature" && (
        <button
          onClick={onSignatureTap}
          className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-4 transition-colors ${
            field.signatureDataUrl
              ? "border-green-300 bg-green-50"
              : "border-border bg-surface-alt hover:border-accent/50 hover:bg-accent/5"
          }`}
        >
          {field.signatureDataUrl ? (
            <img
              src={field.signatureDataUrl}
              alt="Signature"
              className="max-h-12 max-w-[200px] object-contain"
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

// ── Toast ───────────────────────────────────────────────────────────────────
function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-gray-900/90 px-4 py-2.5 text-sm font-medium text-white shadow-lg text-center max-w-xs">
      {msg}
    </div>
  );
}
