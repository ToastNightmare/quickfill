"use client";

import { useState } from "react";
import {
  Type,
  CheckSquare,
  PenTool,
  Calendar,
  Undo2,
  Redo2,
  Trash2,
  Download,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import type { ToolType, EditorField } from "@/lib/types";

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
}

const tools: { type: ToolType; icon: typeof Type; label: string; shortcut: string }[] = [
  { type: "text", icon: Type, label: "Text Field", shortcut: "T" },
  { type: "checkbox", icon: CheckSquare, label: "Checkbox", shortcut: "C" },
  { type: "signature", icon: PenTool, label: "Signature", shortcut: "S" },
  { type: "date", icon: Calendar, label: "Date", shortcut: "D" },
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
}: ToolbarProps) {
  const [showShortcuts, setShowShortcuts] = useState(false);

  const showFontSize = selectedField && selectedField.type !== "checkbox";
  const currentFontSize = showFontSize
    ? (selectedField as { fontSize?: number }).fontSize ?? 14
    : null;

  return (
    <div className="flex shrink-0 flex-col gap-1 border-r border-border bg-surface p-2 w-14 sm:w-48">
      <p className="hidden px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-text-muted sm:block">
        Tools
      </p>
      {tools.map(({ type, icon: Icon, label, shortcut }) => (
        <button
          key={type}
          onClick={() => onToolSelect(activeTool === type ? null : type)}
          title={`${label} (${shortcut})`}
          className={`flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors ${
            activeTool === type
              ? "bg-accent text-white"
              : "text-text-muted hover:bg-surface-alt hover:text-text"
          }`}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="hidden flex-1 sm:inline">{label}</span>
          <kbd
            className={`hidden rounded px-1.5 py-0.5 text-[10px] font-mono sm:inline ${
              activeTool === type ? "bg-white/20" : "bg-surface-alt"
            }`}
          >
            {shortcut}
          </kbd>
        </button>
      ))}

      {/* AI Auto-detect button */}
      <button
        onClick={onDetectFields}
        disabled={isDetecting}
        title="Auto-detect form fields with AI"
        className="flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-purple-50 hover:text-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDetecting ? (
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
        ) : (
          <Sparkles className="h-5 w-5 shrink-0" />
        )}
        <span className="hidden sm:inline">
          {isDetecting ? "Detecting..." : "Auto-detect"}
        </span>
      </button>

      {/* Font Size selector */}
      {showFontSize && (
        <>
          <div className="my-2 h-px bg-border" />
          <p className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted sm:block">
            Font Size
          </p>
          <select
            value={currentFontSize ?? 14}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text outline-none focus:border-accent"
            title="Font Size"
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </>
      )}

      <div className="my-2 h-px bg-border" />

      <p className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted sm:block">
        Actions
      </p>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo"
        className="flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 className="h-5 w-5 shrink-0" />
        <span className="hidden sm:inline">Undo</span>
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo"
        className="flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Redo2 className="h-5 w-5 shrink-0" />
        <span className="hidden sm:inline">Redo</span>
      </button>
      <button
        onClick={onClear}
        title="Clear All"
        className="flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
      >
        <Trash2 className="h-5 w-5 shrink-0" />
        <span className="hidden sm:inline">Clear All</span>
      </button>

      <div className="mt-auto flex flex-col gap-2">
        {/* Shortcuts help */}
        <div className="relative">
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            title="Keyboard Shortcuts"
            className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
          >
            <HelpCircle className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Shortcuts</span>
          </button>
          {showShortcuts && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-border bg-surface p-4 shadow-xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Keyboard Shortcuts
              </p>
              <div className="space-y-2 text-sm">
                {[
                  ["T", "Text field"],
                  ["C", "Checkbox"],
                  ["S", "Signature"],
                  ["D", "Date"],
                  ["Del / \u232b", "Remove selected"],
                  ["Esc", "Deselect"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-text-muted">{desc}</span>
                    <kbd className="rounded bg-surface-alt px-1.5 py-0.5 text-xs font-mono">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onDownload}
          disabled={isDownloading}
          title="Download PDF"
          className="flex h-11 w-full items-center gap-2 rounded-lg bg-accent px-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          <Download className="h-5 w-5 shrink-0" />
          <span className="hidden sm:inline">
            {isDownloading ? "Building..." : "Download PDF"}
          </span>
        </button>
      </div>
    </div>
  );
}
