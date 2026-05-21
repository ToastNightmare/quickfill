"use client";

import {
  Type,
  CheckSquare,
  PenTool,
  Calendar,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Sparkles,
  UserCheck,
  Map,
  Save,
  Eraser,
  Magnet,
  HelpCircle,
  RotateCcw,
  SquareSplitHorizontal,
} from "lucide-react";
import type { ToolType, EditorField } from "@/lib/types";
import { Minimap } from "@/components/Minimap";
import type { RefObject } from "react";
import { useState, useEffect } from "react";

interface ToolbarProps {
  activeTool: ToolType | null;
  onToolSelect: (tool: ToolType | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDownload: () => void;
  onSaveProgress?: () => void;
  onStartOver?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDownloading: boolean;
  selectedField: EditorField | null;
  onFontSizeChange: (size: number) => void;
  onDetectFields: () => void;
  isDetecting: boolean;
  onAutoFill: () => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
  onShowHelp?: () => void;
  mobile?: boolean;
  fields?: EditorField[];
  minimapCanvas?: HTMLCanvasElement | null;
  viewerRef?: RefObject<HTMLDivElement | null>;
  zoom?: number;
  onMinimapRefresh?: () => void;
}

const tools: { type: ToolType; icon: typeof Type; label: string; shortLabel: string; title: string }[] = [
  { type: "text", icon: Type, label: "Text Field", shortLabel: "Text", title: "Text field: tap or drag to place" },
  { type: "comb", icon: SquareSplitHorizontal, label: "Box Field", shortLabel: "Box", title: "Box field: drag across character boxes" },
  { type: "checkbox", icon: CheckSquare, label: "Checkbox", shortLabel: "Tick", title: "Checkbox: tap to place a tick or cross" },
  { type: "signature", icon: PenTool, label: "Signature", shortLabel: "Sign", title: "Signature field: tap to place" },
  { type: "date", icon: Calendar, label: "Date", shortLabel: "Date", title: "Date field: tap or drag to place" },
  { type: "whiteout", icon: Eraser, label: "Whiteout", shortLabel: "Erase", title: "Whiteout: drag over text to cover it" },
];

function isPaidUsage(data: { isPro?: boolean; tier?: string | null } | null): boolean {
  const tier = data?.tier ?? "free";
  return Boolean(data?.isPro || tier === "pro" || tier === "business");
}

export function Toolbar({
  activeTool,
  onToolSelect,
  onUndo,
  onRedo,
  onClear,
  onDownload,
  onSaveProgress,
  onStartOver,
  canUndo,
  canRedo,
  isDownloading,
  selectedField,
  onFontSizeChange,
  onDetectFields,
  isDetecting,
  onAutoFill,
  snapEnabled,
  onSnapToggle,
  onShowHelp,
  mobile,
  fields,
  minimapCanvas,
  viewerRef,
  zoom,
  onMinimapRefresh,
}: ToolbarProps) {
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const fieldCount = fields?.length ?? 0;

  void selectedField;
  void onFontSizeChange;
  void onDetectFields;
  void isDetecting;
  void onAutoFill;
  void Sparkles;
  void UserCheck;

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setIsPro(isPaidUsage(data)))
      .catch(() => setIsPro(false));
  }, []);

  if (mobile) {
    return (
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface/95 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),10px)] shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur">
        {activeTool && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2">
            <p className="min-w-0 text-xs font-semibold text-accent">
              Tap the PDF to place {tools.find((tool) => tool.type === activeTool)?.shortLabel.toLowerCase() ?? "field"}
            </p>
            <button
              onClick={() => onToolSelect(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-text-muted hover:bg-surface hover:text-text"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 pr-1">
            {tools.map(({ type, icon: Icon, shortLabel, title }) => (
              <button
                key={type}
                onClick={() => onToolSelect(activeTool === type ? null : type)}
                title={title}
                className={`flex h-12 min-w-[58px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-semibold transition-colors ${
                  activeTool === type
                    ? "border-accent bg-accent text-white shadow-sm"
                    : "border-border bg-surface-alt text-text-muted hover:border-accent hover:text-accent"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{shortLabel}</span>
              </button>
            ))}
          </div>

          <button
            onClick={onDownload}
            disabled={isDownloading}
            title="Download PDF"
            className="flex h-12 min-w-[108px] shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-sm font-bold text-white shadow-sm hover:bg-accent-hover disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {isDownloading ? "Saving" : "Download"}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-5 gap-2">
          <IconButton onClick={onUndo} disabled={!canUndo} title="Undo" icon={Undo2} />
          <IconButton onClick={onRedo} disabled={!canRedo} title="Redo" icon={Redo2} />
          <IconButton
            onClick={onSnapToggle}
            title={snapEnabled ? "Snap is on" : "Snap is off"}
            icon={Magnet}
            active={snapEnabled}
          />
          {onSaveProgress ? (
            <IconButton onClick={onSaveProgress} title="Save progress" icon={Save} />
          ) : (
            <IconButton onClick={onClear} title="Clear fields" icon={Trash2} disabled={fieldCount === 0} danger />
          )}
          {onShowHelp ? (
            <IconButton onClick={onShowHelp} title="Help" icon={HelpCircle} />
          ) : onStartOver ? (
            <IconButton onClick={onStartOver} title="Start over" icon={RotateCcw} />
          ) : (
            <IconButton onClick={onClear} title="Clear fields" icon={Trash2} disabled={fieldCount === 0} danger />
          )}
        </div>

        {isPro === true && (
          <div className="pointer-events-none absolute right-3 top-[-10px] rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            Pro
          </div>
        )}
      </div>
    );
  }

  const showMinimap = !!(minimapCanvas && viewerRef && zoom !== undefined);

  return (
    <div className="flex h-full w-16 flex-col border-r border-border bg-surface sm:w-64">
      <div className="flex min-h-0 flex-shrink flex-col gap-px overflow-y-auto px-2 pb-2 pt-3">
        <p className="hidden px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted sm:block">
          Place Fields
        </p>
        {tools.map(({ type, icon: Icon, label, title }) => (
          <button
            key={type}
            onClick={() => onToolSelect(activeTool === type ? null : type)}
            title={title}
            className={`flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-semibold shadow-sm transition-colors ${
              activeTool === type
                ? "border border-accent bg-accent text-white"
                : "border border-border bg-surface-alt text-text-muted hover:border-accent hover:text-accent"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}

        <div className="mx-1 my-1 h-px bg-border" />

        <p className="hidden px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted sm:block">
          Actions
        </p>
        <DesktopActionButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" icon={Undo2} label="Undo" shortcut="Ctrl+Z" />
        <DesktopActionButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" icon={Redo2} label="Redo" shortcut="Ctrl+Shift+Z" />
        <button
          onClick={onSnapToggle}
          title="Toggle snap detection for structured forms"
          className={`flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-semibold transition-colors ${
            snapEnabled
              ? "border border-accent bg-accent text-white shadow-sm"
              : "border border-border bg-surface-alt text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          <Magnet className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{snapEnabled ? "Snap On" : "Snap Off"}</span>
        </button>
        <button
          onClick={onClear}
          title="Clear Fields"
          className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Clear Fields</span>
        </button>

        {fieldCount > 0 && (
          <p className="hidden px-2 py-1 text-[10px] text-text-muted sm:block">
            {fieldCount} field{fieldCount !== 1 ? "s" : ""} placed
          </p>
        )}

        <div className="mx-1 my-1 h-px bg-border" />

        {onSaveProgress && (
          <button
            onClick={onSaveProgress}
            title="Save Progress"
            className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
          >
            <Save className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Save Progress</span>
          </button>
        )}

        {onStartOver && (
          <button
            onClick={onStartOver}
            title="Clear all fields and start fresh"
            className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Start Over</span>
          </button>
        )}

        <button
          onClick={onDownload}
          disabled={isDownloading}
          title="Download filled PDF"
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{isDownloading ? "Saving..." : "Download PDF"}</span>
        </button>
      </div>

      {isPro === true ? (
        <div className="border-t border-border px-2 py-2">
          <span className="hidden rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent sm:inline-block">
            PRO
          </span>
        </div>
      ) : isPro === false ? (
        <div className="hidden border-t border-border px-2 py-2 sm:block">
          <a href="/pricing" className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white">
            Upgrade to Pro
          </a>
        </div>
      ) : (
        <div className="hidden border-t border-border px-2 py-2 sm:block" aria-hidden="true" />
      )}

      {onShowHelp && (
        <div className="mt-auto border-t border-border p-2">
          <button
            onClick={onShowHelp}
            title="Show tutorial"
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {showMinimap && (
        <div className="hidden min-h-0 flex-col border-t border-border px-2 pb-2 sm:flex" style={{ height: "240px", flexShrink: 0 }}>
          <div className="flex flex-shrink-0 items-center gap-1.5 px-1 py-2">
            <Map className="h-3 w-3 text-text-muted" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Overview</p>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface-alt">
            <Minimap
              sourceCanvas={minimapCanvas!}
              viewerRef={viewerRef!}
              pageWidth={800}
              pageHeight={1100}
              zoom={zoom!}
              onRequestRefresh={onMinimapRefresh}
              inline
            />
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  icon: Icon,
  title,
  onClick,
  disabled,
  active,
  danger,
}: {
  icon: typeof Type;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-10 items-center justify-center rounded-xl border text-text-muted transition-colors disabled:opacity-30 ${
        active
          ? "border-accent bg-accent text-white"
          : danger
            ? "border-border bg-surface-alt hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            : "border-border bg-surface-alt hover:border-accent hover:text-accent"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function DesktopActionButton({
  icon: Icon,
  label,
  title,
  shortcut,
  onClick,
  disabled,
}: {
  icon: typeof Type;
  label: string;
  title: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden flex-1 items-center justify-between sm:flex">
        {label}
        <kbd className="rounded bg-surface-alt px-1 py-0.5 font-mono text-[10px] text-text-muted/60">{shortcut}</kbd>
      </span>
    </button>
  );
}
