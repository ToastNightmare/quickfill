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
  Grid3X3,
  RotateCcw,
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
  // Minimap props (desktop only)
  minimapCanvas?: HTMLCanvasElement | null;
  viewerRef?: RefObject<HTMLDivElement | null>;
  zoom?: number;
  onMinimapRefresh?: () => void;
}

const tools: { type: ToolType; icon: typeof Type; label: string; title: string }[] = [
  { type: "text", icon: Type, label: "Text Field", title: "Text field: click and drag to place" },
  { type: "checkbox", icon: CheckSquare, label: "Checkbox", title: "Checkbox: click to place a tick or cross" },
  { type: "signature", icon: PenTool, label: "Signature", title: "Signature field: draw or type your signature" },
  { type: "date", icon: Calendar, label: "Date", title: "Date field: click and drag to place" },
  { type: "grid", icon: Grid3X3, label: "Grid", title: "Character grid: for individual letter/number boxes" },
  { type: "whiteout", icon: Eraser, label: "Whiteout", title: "Whiteout: cover pre-printed text with background colour" },
];

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
  const showFontSize = selectedField && selectedField.type !== "checkbox";
  const currentFontSize = showFontSize
    ? (selectedField as { fontSize?: number }).fontSize ?? 14
    : null;
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((data) => setIsPro(data.isPro))
      .catch(() => setIsPro(false));
  }, []);

  // ── Mobile bottom bar ──────────────────────────────────────────────────────
  if (mobile) {
    return (
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2 overflow-x-auto border-t border-border bg-surface px-3 pt-2 pb-[max(env(safe-area-inset-bottom),8px)]">
        {tools.map(({ type, icon: Icon, label, title }) => (
          <button
            key={type}
            onClick={() => onToolSelect(activeTool === type ? null : type)}
            title={title}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTool === type
                ? "bg-accent text-white border-accent border"
                : "text-text-muted border border-border hover:border-accent hover:text-accent"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <div className="w-px h-6 bg-border shrink-0" />
        <button
          onClick={onSnapToggle}
          title="Toggle snap detection for structured forms"
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-semibold transition-colors ${
            snapEnabled
              ? "bg-accent text-white border-accent border shadow-sm"
              : "text-text-muted border border-border hover:border-accent hover:text-accent"
          }`}
        >
          <Magnet className="h-3.5 w-3.5" />
          Snap {snapEnabled ? "On" : "Off"}
        </button>
        <div className="w-px h-6 bg-border shrink-0" />
        <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="shrink-0 rounded-full p-2.5 text-text-muted border border-border hover:border-accent hover:text-accent disabled:opacity-30 transition-colors">
          <Undo2 className="h-4 w-4" />
        </button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className="shrink-0 rounded-full p-2.5 text-text-muted border border-border hover:border-accent hover:text-accent disabled:opacity-30 transition-colors">
          <Redo2 className="h-4 w-4" />
        </button>
        <div className="w-px h-6 bg-border shrink-0" />
        <button
          onClick={onDetectFields}
          disabled={isDetecting}
          title="Auto-detect fields"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-medium text-text-muted border border-border hover:border-accent hover:text-accent disabled:opacity-50 transition-colors"
        >
          {isDetecting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isDetecting ? "Detecting..." : "Detect"}
        </button>
        <button
          onClick={onAutoFill}
          title="Auto-fill from profile"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-medium text-text-muted border border-border hover:border-accent hover:text-accent transition-colors"
        >
          <UserCheck className="h-4 w-4" />
          Auto-fill
        </button>
        {onSaveProgress && (
          <>
            <div className="w-px h-6 bg-border shrink-0" />
            <button
              onClick={onSaveProgress}
              title="Save Progress"
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-medium text-text-muted border border-border hover:border-accent hover:text-accent transition-colors"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </>
        )}
        <div className="w-px h-6 bg-border shrink-0" />
        {isPro && (
          <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
            ✦ Pro
          </span>
        )}
        <div className="w-px h-6 bg-border shrink-0" />
        <button
          onClick={onDownload}
          disabled={isDownloading}
          title="Download PDF"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          {isDownloading ? "Saving..." : "Download"}
        </button>
        {onShowHelp && (
          <>
            <div className="w-px h-6 bg-border shrink-0" />
            <button
              onClick={onShowHelp}
              title="Show tutorial"
              className="shrink-0 rounded-full p-2.5 text-text-muted border border-border hover:border-accent hover:text-accent transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Desktop sidebar ─────────────────────────────────────────────────────────
  const showMinimap = !!(minimapCanvas && viewerRef && zoom !== undefined);

  return (
    <div className="flex flex-col border-r border-border bg-surface w-16 sm:w-64 h-full">

      {/* ── Fixed top: tools + actions ───────────────────────────────────── */}
      <div className="flex flex-col gap-px px-2 pt-3 pb-2 overflow-y-auto flex-shrink min-h-0">

        {/* Place Fields */}
        <p className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted hidden sm:block">
          Place Fields
        </p>
        {tools.map(({ type, icon: Icon, label, title }) => (
          <button
            key={type}
            onClick={() => onToolSelect(activeTool === type ? null : type)}
            title={title}
            className={`flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-semibold transition-colors shadow-sm ${
              activeTool === type
                ? "bg-accent text-white border border-accent"
                : "bg-surface-alt text-text-muted border border-border hover:border-accent hover:text-accent"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}

        <div className="my-1 h-px bg-border mx-1" />

        {/* Actions */}
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted hidden sm:block">
          Actions
        </p>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            Undo
            <kbd className="text-[10px] text-text-muted/60 font-mono bg-surface-alt px-1 py-0.5 rounded">⌃Z</kbd>
          </span>
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Redo2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            Redo
            <kbd className="text-[10px] text-text-muted/60 font-mono bg-surface-alt px-1 py-0.5 rounded">⌃⇧Z</kbd>
          </span>
        </button>
        <button
          onClick={onSnapToggle}
          title="Toggle snap detection for structured forms"
          className={`flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-semibold transition-colors ${
            snapEnabled
              ? "bg-accent text-white border-accent border shadow-sm"
              : "bg-surface-alt text-text-muted border border-border hover:border-accent hover:text-accent"
          }`}
        >
          <Magnet className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{snapEnabled ? "Snap On" : "Snap Off"}</span>
        </button>
        <button
          onClick={onClear}
          title="Clear Fields"
          className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Clear Fields</span>
        </button>

        {/* Field count indicator */}
        {fields && fields.length > 0 && (
          <p className="px-2 py-1 text-[10px] text-text-muted hidden sm:block">
            {fields.length} field{fields.length !== 1 ? "s" : ""} placed
          </p>
        )}

        <div className="my-1 h-px bg-border mx-1" />

        {/* Save Progress */}
        {onSaveProgress && (
          <button
            onClick={onSaveProgress}
            title="Save Progress"
            className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
          >
            <Save className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Save Progress</span>
          </button>
        )}

        {/* Start Over */}
        {onStartOver && (
          <button
            onClick={onStartOver}
            title="Clear all fields and start fresh"
            className="flex h-8 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Start Over</span>
          </button>
        )}

        {/* Download */}
        <button
          onClick={onDownload}
          disabled={isDownloading}
          title="Download filled PDF"
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60 transition-colors shadow-sm"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">
            {isDownloading ? "Saving..." : "Download PDF"}
          </span>
        </button>

      </div>

      {/* Pro indicator */}
      {isPro ? (
        <div className="px-2 py-2 border-t border-border">
          <span className="hidden sm:inline-block rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
            PRO
          </span>
        </div>
      ) : (
        <div className="px-2 py-2 border-t border-border hidden sm:block">
          <a href="/pricing" className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent hover:text-white transition-colors">
            Upgrade to Pro
          </a>
        </div>
      )}

      {/* Help button at bottom */}
      {onShowHelp && (
        <div className="mt-auto p-2 border-t border-border">
          <button
            onClick={onShowHelp}
            title="Show tutorial"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-alt hover:text-text transition-colors mx-auto"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Overview: flex-1, fills all remaining space ───────────────────── */}
      {showMinimap && (
        <div className="hidden sm:flex flex-col min-h-0 border-t border-border px-2 pb-2" style={{ height: "240px", flexShrink: 0 }}>
          <div className="flex items-center gap-1.5 px-1 py-2 flex-shrink-0">
            <Map className="h-3 w-3 text-text-muted" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Overview
            </p>
          </div>
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-border bg-surface-alt">
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
