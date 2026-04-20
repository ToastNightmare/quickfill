"use client";

import { Type, CheckSquare, PenTool, Calendar, X, Trash2, Minus, Plus, MousePointer2, Eraser, Grid3X3, SquareSplitHorizontal } from "lucide-react";
import type { EditorField, ToolType } from "@/lib/types";
import type { CheckboxStamp } from "@/lib/types";

const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 24, 36];

const TOOL_META: Record<ToolType, { icon: typeof Type; label: string; hint: string }> = {
  text:      { icon: Type,        label: "Text Field",  hint: "Click the PDF to place a text field" },
  checkbox:  { icon: CheckSquare, label: "Checkbox",    hint: "Click to stamp a tick or cross" },
  signature: { icon: PenTool,     label: "Signature",   hint: "Click the PDF to place a signature field" },
  date:      { icon: Calendar,    label: "Date",        hint: "Click the PDF to place a date field" },
  grid:      { icon: Grid3X3,     label: "Grid",        hint: "Drag across character boxes to place a grid field" },
  comb:      { icon: SquareSplitHorizontal, label: "Comb", hint: "Drag to place a comb field for numbers like TFN, ABN" },
  whiteout:  { icon: Eraser,      label: "Whiteout",    hint: "Drag to draw a rectangle to cover text" },
};

interface ContextBarProps {
  activeTool: ToolType | null;
  selectedField: EditorField | null;
  onToolCancel: () => void;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
  onFieldDelete: (id: string) => void;
  onFieldDeselect: () => void;
  onStampChange: (stamp: CheckboxStamp) => void;
}

export function ContextBar({
  activeTool,
  selectedField,
  onToolCancel,
  onFieldUpdate,
  onFieldDelete,
  onFieldDeselect,
  onStampChange,
}: ContextBarProps) {

  // Nothing happening — hide
  if (!activeTool && !selectedField) return null;

  // ── Tool active ──────────────────────────────────────────────────────────
  if (activeTool && !selectedField) {
    const { icon: Icon, label, hint } = TOOL_META[activeTool];
    return (
      <Bar>
        <div className="flex items-center gap-2 text-accent">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <span className="text-xs text-text-muted">{hint}</span>
        <Spacer />
        <CancelBtn onClick={onToolCancel} />
      </Bar>
    );
  }

  // ── Field selected ───────────────────────────────────────────────────────
  if (selectedField) {
    const fieldType = selectedField.type;

    if (fieldType === "checkbox") {
      const stamp: CheckboxStamp =
        (selectedField as { stamp?: CheckboxStamp }).stamp ??
        (selectedField.checked ? "tick" : "none");

      return (
        <Bar>
          <CheckSquare className="h-4 w-4 text-accent shrink-0" />
          <span className="text-sm font-semibold text-text">Checkbox</span>
          <div className="w-px h-4 bg-border" />
          {/* Stamp selector */}
          <div className="flex items-center gap-1">
            <StampBtn active={stamp === "tick"}  onClick={() => onStampChange("tick")}  label="✓" title="Tick" />
            <StampBtn active={stamp === "cross"} onClick={() => onStampChange("cross")} label="✕" title="Cross" />
            <StampBtn active={stamp === "none"}  onClick={() => onStampChange("none")}  label="Clear" title="Clear stamp" small />
          </div>
          <Spacer />
          <DeleteBtn onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }} />
          <CancelBtn onClick={onFieldDeselect} />
        </Bar>
      );
    }

    // Whiteout is static - just show delete option
    if (fieldType === "whiteout") {
      return (
        <Bar>
          <Eraser className="h-4 w-4 text-accent shrink-0" />
          <span className="text-sm font-semibold text-text">Whiteout</span>
          <div className="w-px h-4 bg-border" />
          <span className="text-xs text-text-muted">Static block - use Undo if misplaced</span>
          <Spacer />
          <DeleteBtn onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }} />
          <CancelBtn onClick={onFieldDeselect} />
        </Bar>
      );
    }

    // Grid field
    if (fieldType === "grid") {
      const gridField = selectedField as import("@/lib/types").GridField;
      const charCount = gridField.charCount ?? 11;
      
      return (
        <Bar>
          <Grid3X3 className="h-4 w-4 text-accent shrink-0" />
          <span className="text-sm font-semibold text-text">Character Grid</span>
          <div className="w-px h-4 bg-border" />
          <span className="text-xs text-text-muted">{charCount} slots</span>
          <Spacer />
          <DeleteBtn onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }} />
          <CancelBtn onClick={onFieldDeselect} />
        </Bar>
      );
    }

    // Comb field
    if (fieldType === "comb") {
      const combField = selectedField as import("@/lib/types").CombField;
      const charCount = combField.charCount ?? 9;
      
      return (
        <Bar>
          <SquareSplitHorizontal className="h-4 w-4 text-accent shrink-0" />
          <span className="text-sm font-semibold text-text">Comb</span>
          <div className="w-px h-4 bg-border" />
          <span className="text-xs text-text-muted">{charCount} cells</span>
          <Spacer />
          <DeleteBtn onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }} />
          <CancelBtn onClick={onFieldDeselect} />
        </Bar>
      );
    }

    // Text / date / signature
    const fontSize = (selectedField as { fontSize?: number }).fontSize ?? 14;
    const prevSize = FONT_SIZES.slice().reverse().find((s) => s < fontSize);
    const nextSize = FONT_SIZES.find((s) => s > fontSize);

    const typeLabel =
      fieldType === "signature" ? "Signature" :
      fieldType === "date" ? "Date" : "Text Field";

    const TypeIcon =
      fieldType === "signature" ? PenTool :
      fieldType === "date" ? Calendar : Type;

    return (
      <Bar>
        <TypeIcon className="h-4 w-4 text-accent shrink-0" />
        <span className="text-sm font-semibold text-text">{typeLabel}</span>
        <div className="w-px h-4 bg-border" />
        {/* Font size */}
        <div className="flex items-center gap-1">
          <IconBtn
            onClick={() => prevSize && onFieldUpdate(selectedField.id, { fontSize: prevSize } as Partial<EditorField>)}
            disabled={!prevSize}
            title="Smaller text"
          >
            <Minus className="h-3.5 w-3.5" />
          </IconBtn>
          <span className="min-w-[40px] text-center text-xs tabular-nums font-medium text-text select-none">
            {fontSize}px
          </span>
          <IconBtn
            onClick={() => nextSize && onFieldUpdate(selectedField.id, { fontSize: nextSize } as Partial<EditorField>)}
            disabled={!nextSize}
            title="Larger text"
          >
            <Plus className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
        <Spacer />
        <DeleteBtn onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }} />
        <CancelBtn onClick={onFieldDeselect} />
      </Bar>
    );
  }

  return null;
}

// ── Primitives ───────────────────────────────────────────────────────────────

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-alt px-4 py-2 flex-shrink-0 min-h-[40px]">
      {children}
    </div>
  );
}

function Spacer() {
  return <div className="flex-1" />;
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Dismiss"
      className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text transition-colors"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Delete field"
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
    >
      <Trash2 className="h-3.5 w-3.5" />
      <span>Delete</span>
    </button>
  );
}

function StampBtn({
  active, onClick, label, title, small,
}: {
  active: boolean; onClick: () => void; label: string; title: string; small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 items-center justify-center rounded-md px-2 text-sm font-bold transition-colors
        ${active ? "bg-accent text-white shadow-sm" : "text-text-muted hover:bg-surface hover:text-text"}
        ${small ? "text-xs font-medium" : ""}
      `}
    >
      {label}
    </button>
  );
}

function IconBtn({
  children, onClick, disabled, title,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

// Keep MousePointer2 import used for future idle state
void MousePointer2;
