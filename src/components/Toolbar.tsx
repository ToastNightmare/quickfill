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
  onAutoFill: () => void;
  mobile?: boolean;
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
}: ToolbarProps) {
  const showFontSize = selectedField && selectedField.type !== "checkbox";
  const currentFontSize = showFontSize
    ? (selectedField as { fontSize?: number }).fontSize ?? 14
    : null;

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

  return (
    <div className="sticky top-0 flex shrink-0 flex-col gap-1 border-r border-border bg-surface p-2 w-14 sm:w-48 h-full max-h-screen overflow-y-auto">
      <p className="hidden px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted sm:block">
        Place Fields
      </p>
      {tools.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => onToolSelect(activeTool === type ? null : type)}
          title={label}
          className={`flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors ${
            activeTool === type
              ? "bg-accent text-white shadow-sm"
              : "text-text-muted hover:bg-surface-alt hover:text-text"
          }`}
        >
          <Icon className="h-4.5 w-4.5 shrink-0" />
          <span className="hidden flex-1 sm:inline">{label}</span>
        </button>
      ))}

      {/* AI Auto-detect button */}
      <button
        onClick={onDetectFields}
        disabled={isDetecting}
        title="Auto-detect form fields with AI"
        className="flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-purple-50 hover:text-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDetecting ? (
          <div className="h-4.5 w-4.5 shrink-0 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
        ) : (
          <Sparkles className="h-4.5 w-4.5 shrink-0" />
        )}
        <span className="hidden sm:inline">
          {isDetecting ? "Detecting..." : "Auto-detect"}
        </span>
      </button>

      <div className="my-1.5 h-px bg-border" />

      {/* Auto-fill from Profile */}
      <button
        onClick={onAutoFill}
        title="Auto-fill from saved profile"
        className="flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-green-50 hover:text-green-700 transition-colors"
      >
        <UserCheck className="h-4.5 w-4.5 shrink-0" />
        <span className="hidden sm:inline">Auto-fill Profile</span>
      </button>

      {/* Font Size selector */}
      {showFontSize && (
        <>
          <div className="my-1.5 h-px bg-border" />
          <p className="hidden px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted sm:block">
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

      <div className="my-1.5 h-px bg-border" />

      <p className="hidden px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted sm:block">
        Actions
      </p>
      <div className="flex flex-wrap gap-1 sm:flex-col">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="flex h-9 flex-1 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed sm:flex-initial"
        >
          <Undo2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Undo</span>
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="flex h-9 flex-1 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed sm:flex-initial"
        >
          <Redo2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Redo</span>
        </button>
      </div>
      <button
        onClick={onClear}
        title="Clear All"
        className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Clear All</span>
      </button>

    </div>
  );
}
