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
} from "lucide-react";
import type { ToolType } from "@/lib/types";

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
}: ToolbarProps) {
  return (
    <div className="flex shrink-0 flex-col gap-1 border-r border-border bg-surface p-2 w-14 sm:w-48">
      <p className="hidden px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-text-muted sm:block">
        Tools
      </p>
      {tools.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => onToolSelect(activeTool === type ? null : type)}
          title={label}
          className={`flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors ${
            activeTool === type
              ? "bg-accent text-white"
              : "text-text-muted hover:bg-surface-alt hover:text-text"
          }`}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}

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

      <div className="mt-auto">
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
