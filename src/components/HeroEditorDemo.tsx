"use client";

import { useEffect, useState } from "react";
import {
  Upload,
  FileText,
  User,
  Check,
  Download,
  Type,
  SquareSplitHorizontal,
  CheckSquare,
  PenTool,
  Calendar,
  Eraser,
  Undo2,
  Magnet,
  Trash2,
  Save,
  RotateCcw,
  Sparkles,
} from "lucide-react";

function HeroEditorDemo() {
  const [stageIndex, setStageIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const demoStages = [
    "Upload PDF",
    "Place fields",
    "Type details",
    "Snap aligned",
    "Download ready",
  ];
  const activeStage = prefersReducedMotion ? demoStages.length - 1 : stageIndex;
  const hasFields = activeStage >= 1;
  const hasTyped = activeStage >= 2;
  const hasAligned = activeStage >= 3;
  const hasDownloaded = activeStage >= 4;
  const fieldTools = [
    { label: "Text Field", icon: Type },
    { label: "Box Field", icon: SquareSplitHorizontal },
    { label: "Checkbox", icon: CheckSquare },
    { label: "Signature", icon: PenTool },
    { label: "Date", icon: Calendar },
    { label: "Whiteout", icon: Eraser },
  ];
  const actions = [
    { label: "Undo", icon: Undo2 },
    { label: "Snap On", icon: Magnet },
    { label: "Clear Fields", icon: Trash2 },
    { label: "Save Progress", icon: Save },
    { label: "Start Over", icon: RotateCcw },
  ];
  const demoFields = [
    { label: "Full name", value: "Alex Sample" },
    { label: "Address", value: "42 Example Road" },
    { label: "Email", value: "alex@example.com" },
    { label: "Date", value: "12 Jun 2026" },
  ];
  const statusItems: Array<[string, boolean]> = [
    ["Fields placed", hasFields],
    ["Details typed", hasTyped],
    ["Snap aligned", hasAligned],
    ["Completed PDF ready", hasDownloaded],
  ];

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const interval = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % demoStages.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, [demoStages.length, prefersReducedMotion]);

  return (
    <div
      className="mx-auto mt-12 max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#111827] text-left shadow-2xl shadow-black/25"
      aria-label="QuickFill editor workflow demo"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 bg-navy-light px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm text-gray-300">
          <FileText className="h-4 w-4 shrink-0 text-accent" />
          <span>QuickFill</span>
          <span>/</span>
          <span className="truncate font-semibold text-white">sample-application.pdf</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 font-semibold text-gray-200">
            100%
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/15 px-2 py-1 font-semibold text-blue-100">
            <Magnet className="h-3.5 w-3.5" />
            Snap on
          </span>
          <span
            className={`rounded-md px-2 py-1 font-semibold motion-safe:transition-colors motion-safe:duration-500 ${
              hasDownloaded ? "bg-emerald-500 text-white" : "bg-white/10 text-gray-200"
            }`}
          >
            {hasDownloaded ? "5 of 5 filled" : `${Math.min(activeStage + 1, 5)} of 5 filling`}
          </span>
        </div>
      </div>

      <div className="grid bg-[#151b28] lg:grid-cols-[190px_minmax(0,1fr)_230px]">
        <aside className="border-b border-white/10 bg-surface p-3 lg:border-b-0 lg:border-r lg:border-border">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Place Fields
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {fieldTools.map(({ label, icon: Icon }, index) => (
              <button
                key={label}
                type="button"
                tabIndex={-1}
                className={`flex h-8 items-center gap-2 rounded-lg border px-2 text-xs font-semibold shadow-sm motion-safe:transition-colors motion-safe:duration-500 motion-reduce:transition-none ${
                  hasFields && index === 0 && activeStage === 1
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface-alt text-text-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          <div className="mx-1 my-3 h-px bg-border" />
          <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Actions
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {actions.map(({ label, icon: Icon }) => {
              const isSnap = label === "Snap On";

              return (
                <button
                  key={label}
                  type="button"
                  tabIndex={-1}
                  className={`flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-medium motion-safe:transition-colors motion-safe:duration-500 motion-reduce:transition-none ${
                    isSnap && hasAligned
                      ? "border border-accent bg-accent text-white shadow-sm"
                      : "text-text-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            tabIndex={-1}
            className={`mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-xs font-semibold text-white shadow-sm motion-safe:transition-all motion-safe:duration-500 motion-reduce:transition-none ${
              hasDownloaded ? "shadow-lg shadow-accent/30 ring-2 ring-accent/25" : ""
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        </aside>

        <div className="relative overflow-hidden bg-[#dfe6f1] p-4 sm:p-5 lg:min-h-[520px]">
          <div
            className={`absolute left-5 top-5 z-20 rounded-lg border border-accent/25 bg-white px-3 py-2 text-xs font-semibold text-text shadow-lg shadow-slate-900/10 motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
              activeStage >= 0 ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
            }`}
          >
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-accent" />
              sample-application.pdf uploaded
            </div>
          </div>

          <div
            className={`absolute right-5 top-5 z-20 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm motion-safe:transition-all motion-safe:duration-500 motion-reduce:transition-none ${
              hasAligned
                ? "border-accent/30 bg-blue-50 text-blue-700 opacity-100"
                : "border-border bg-white text-text-muted opacity-0"
            }`}
          >
            snap ready
          </div>

          <div className="relative mx-auto w-full max-w-[470px] rounded-sm bg-white px-7 py-8 text-text shadow-xl shadow-slate-900/20 sm:px-9">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent">
                  Generic demo form
                </p>
                <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-text">
                  Sample application form
                </h3>
              </div>
              <span className="rounded border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Page 1
              </span>
            </div>

            <div className="relative mt-6 space-y-5">
              <div
                className={`pointer-events-none absolute left-[31%] top-0 h-[280px] w-px bg-accent/45 motion-safe:transition-opacity motion-safe:duration-500 ${
                  hasAligned ? "opacity-100 motion-safe:animate-pulse" : "opacity-0"
                }`}
              />
              <div
                className={`pointer-events-none absolute left-0 right-0 top-[103px] h-px bg-accent/45 motion-safe:transition-opacity motion-safe:duration-500 ${
                  hasAligned ? "opacity-100 motion-safe:animate-pulse" : "opacity-0"
                }`}
              />
              <div
                className={`pointer-events-none absolute left-0 right-0 top-[169px] h-px bg-accent/45 motion-safe:transition-opacity motion-safe:duration-500 ${
                  hasAligned ? "opacity-100 motion-safe:animate-pulse" : "opacity-0"
                }`}
              />

              {demoFields.map((field, index) => (
                <div key={field.label} className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-4">
                  <p className="text-sm font-semibold text-text">{field.label}</p>
                  <div className="relative h-11 rounded border border-slate-300 bg-white">
                    <div
                      className={`absolute inset-0 rounded border-2 px-3 py-2 text-sm font-semibold text-navy motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
                        hasFields
                          ? hasAligned
                            ? "translate-x-0 border-accent bg-blue-50"
                            : index % 2 === 0
                              ? "-translate-x-1 border-accent/80 bg-white"
                              : "translate-x-1 border-accent/80 bg-white"
                          : "scale-95 border-transparent opacity-0"
                      }`}
                    >
                      <span
                        className={`inline-block max-w-0 overflow-hidden whitespace-nowrap motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
                          hasTyped ? "max-w-[220px] opacity-100" : "opacity-0"
                        }`}
                        style={{ transitionDelay: hasTyped ? `${index * 120}ms` : "0ms" }}
                      >
                        {field.value}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-4">
                <p className="text-sm font-semibold text-text">Consent</p>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded border-2 text-accent motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
                      hasFields ? "border-accent bg-blue-50 opacity-100" : "border-transparent opacity-0"
                    }`}
                  >
                    {hasTyped && <Check className="h-5 w-5" />}
                  </div>
                  <span className="text-xs text-text-muted">I confirm these sample details are correct.</span>
                </div>
              </div>
            </div>

            <div
              className={`mt-7 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
                hasDownloaded
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 opacity-100"
                  : "border-transparent bg-transparent text-transparent opacity-0"
              }`}
            >
              <Check className="h-4 w-4" />
              Completed PDF ready
            </div>
          </div>
        </div>

        <aside className="border-t border-white/10 bg-surface p-4 lg:border-l lg:border-t-0 lg:border-border">
          <div className="rounded-lg border border-border bg-surface-alt p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Inspector
            </p>
            <div className="mt-3 flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full motion-safe:transition-colors motion-safe:duration-500 ${
                  hasDownloaded ? "bg-emerald-600 text-white" : "bg-accent text-white"
                }`}
              >
                {hasDownloaded ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </span>
              <div>
                <h3 className="text-base font-bold text-text">
                  {hasDownloaded ? "Ready to download" : demoStages[activeStage]}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  Marketing preview only. Your real PDF keeps its own page layout.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {statusItems.map(([label, done]) => (
              <div key={label} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full motion-safe:transition-colors motion-safe:duration-500 ${
                    done ? "bg-emerald-600 text-white" : "bg-surface-alt text-text-muted"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-text-muted">{label}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default HeroEditorDemo;
