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
} from "lucide-react";
import type { ToolType, EditorField } from "@/lib/types";
import { Minimap } from "@/components/Minimap";
import type { RefObject } from "react";

const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 24, 36];

interface ToolbarProps {
  activeTool: ToolType | null;
  onToolSelect: (tool: ToolType | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDownload: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDownloading: boolean;
  selectedField: EditorField | null;
  onFontSizeChange: (size: number) => void;
  onDetectFields: () => void;
  isDetecting: boolean;
  onAutoFill: () => void;
  mobile?: boolean;
  // Minimap props (desktop only)
  minimapCanvas?: HTMLCanvasElement | null;
  viewerRef?: RefObject<HTMLDivElement | null>;
  zoom?: number;
  onMinimapRefresh?: () => void;
}

const tools: { type: ToolType; icon: typeof Type; label: string }[] = [
  { type: "text", icon: Type, label: "Text Field" },
  { type: "checkbox", icon: CheckSquare, label: "Checkbox" },
  { type: "signature", icon: PenTool, label: "Signature" },
  { type: "date", icon: Calendar, label: "Date" },
];

export function Toolbar({
  activeTool,
  onToolSelect,
  onUndo,
  onRedo,
  onClear,
  onDownload,
  canUndo,
  canRedo,
  isDownloading,
  selectedField,
  onFontSizeChange,
  onDetectFields,
  isDetecting,
  onAutoFill,
  mobile,
  minimapCanvas,
  viewerRef,
  zoom,
  onMinimapRefresh,
}: ToolbarProps) {
  const showFontSize = selectedField && selectedField.type !== "checkbox";
  const currentFontSize = showFontSize
    ? (selectedField as { fontSize?: number }).fontSize ?? 14
    : null;

  // ── Mobile bottom bar ──────────────────────────────────────────────────────
  if (mobile) {
    return (
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2 overflow-x-auto border-t border-border bg-surface px-3 py-2 pb-safe">
        {tools.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            onClick={() => onToolSelect(activeTool === type ? null : type)}
            title={label}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTool === type
                ? "bg-accent text-white shadow-sm"
                : "text-text-muted hover:bg-surface-alt hover:text-text"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <div className="w-px h-5 bg-border shrink-0" />
        <button onClick={onUndo} disabled={!canUndo} title="Undo" className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-surface-alt disabled:opacity-30 transition-colors">
          <Undo2 className="h-4 w-4" />
        </button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo" className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-surface-alt disabled:opacity-30 transition-colors">
          <Redo2 className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-border shrink-0" />
        <button
          onClick={onDetectFields}
          disabled={isDetecting}
          title="Auto-detect fields"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-alt hover:text-text disabled:opacity-50 transition-colors"
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
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
        >
          <UserCheck className="h-4 w-4" />
          Auto-fill
        </button>
        <div className="w-px h-5 bg-border shrink-0" />
        <button
          onClick={onDownload}
          disabled={isDownloading}
          title="Download PDF"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          {isDownloading ? "Saving..." : "Download"}
        </button>
      </div>
    );
  }

  // ── Desktop sidebar ─────────────────────────────────────────────────────────
  const showMinimap = !!(minimapCanvas && viewerRef && zoom !== undefined);

  return (
    <div className="sticky top-0 flex shrink-0 flex-col border-r border-border bg-surface w-16 sm:w-64 h-full max-h-screen overflow-y-auto">

      {/* ── Place Fields ─────────────────────────────────────────────────── */}
      <div className="px-3 pt-4 pb-2">
        <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted hidden sm:block">
          Place Fields
        </p>
        <div className="flex flex-col gap-0.5">
          {tools.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => onToolSelect(activeTool === type ? null : type)}
              title={label}
              className={`flex h-10 items-center gap-3 rounded-lg px-2 text-sm font-medium transition-colors ${
                activeTool === type
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-muted hover:bg-surface-alt hover:text-text"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-3 h-px bg-border" />

      {/* ── AI Tools ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-3">
        <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted hidden sm:block">
          AI Tools
        </p>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={onDetectFields}
            disabled={isDetecting}
            title="Auto-detect form fields"
            className="flex h-10 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-accent/10 hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDetecting ? (
              <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {isDetecting ? "Detecting..." : "Auto-detect"}
            </span>
          </button>

          <button
            onClick={onAutoFill}
            title="Auto-fill from saved profile"
            className="flex h-10 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-green-50 hover:text-green-700 transition-colors"
          >
            <UserCheck className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Auto-fill Profile</span>
          </button>
        </div>
      </div>

      {/* ── Font Size (conditional) ───────────────────────────────────────── */}
      {showFontSize && (
        <>
          <div className="mx-3 h-px bg-border" />
          <div className="px-3 py-3">
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted hidden sm:block">
              Font Size
            </p>
            <select
              value={currentFontSize ?? 14}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-text outline-none focus:border-accent"
              title="Font Size"
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="mx-3 h-px bg-border" />

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="px-3 py-3">
        <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted hidden sm:block">
          Actions
        </p>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex h-9 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
            className="flex h-9 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Redo2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              Redo
              <kbd className="text-[10px] text-text-muted/60 font-mono bg-surface-alt px-1 py-0.5 rounded">⌃⇧Z</kbd>
            </span>
          </button>
          <button
            onClick={onClear}
            title="Clear All"
            className="flex h-9 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Clear All</span>
          </button>
        </div>
      </div>

      <div className="mx-3 h-px bg-border" />

      {/* ── Download ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-3">
        <button
          onClick={onDownload}
          disabled={isDownloading}
          title="Download filled PDF"
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60 transition-colors shadow-sm"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">
            {isDownloading ? "Saving..." : "Download PDF"}
          </span>
        </button>
      </div>

      {/* ── Overview (Minimap) — pinned to bottom ────────────────────────── */}
      {showMinimap && (
        <>
          <div className="mx-3 h-px bg-border" />
          <div className="px-3 py-3 hidden sm:block">
            <div className="flex items-center gap-1.5 px-1 pb-2">
              <Map className="h-3 w-3 text-text-muted" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Overview
              </p>
            </div>
            <div className="rounded-lg overflow-hidden border border-border bg-surface-alt">
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
        </>
      )}

    </div>
  );
}
