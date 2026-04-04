"use client";

import { Trash2, Minus, Plus } from "lucide-react";
import type { EditorField } from "@/lib/types";
import type { CheckboxStamp } from "@/lib/types";

interface FieldToolbarProps {
  field: EditorField;
  zoom: number;
  viewerRect: DOMRect | null;
  onUpdate: (id: string, updates: Partial<EditorField>) => void;
  onDelete: (id: string) => void;
  onDeselect: () => void;
  onStampChange?: (stamp: CheckboxStamp) => void;
}

const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 24, 36];
const BAR_H = 36; // height of the bar in px
const GAP = 6;    // gap between bar and field top

export function FieldToolbar({
  field,
  zoom,
  viewerRect,
  onUpdate,
  onDelete,
  onDeselect,
  onStampChange,
}: FieldToolbarProps) {
  if (!viewerRect) return null;

  const zoomFactor = zoom / 100;

  // Position the bar above the field
  const fieldLeft = viewerRect.left + field.x * zoomFactor;
  const fieldTop  = viewerRect.top  + field.y * zoomFactor;
  const fieldW    = field.width * zoomFactor;

  // Estimate bar width per type
  const barW = field.type === "checkbox" ? 192 : 160;

  // Centre bar over field, clamp to viewport
  let left = fieldLeft + fieldW / 2 - barW / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - barW - 8));

  // Prefer above; if not enough room, go below
  let top = fieldTop - BAR_H - GAP;
  if (top < 72) top = viewerRect.top + field.y * zoomFactor + field.height * zoomFactor + GAP;

  const currentStamp: CheckboxStamp =
    field.type === "checkbox"
      ? ((field as { stamp?: CheckboxStamp }).stamp ?? (field.checked ? "tick" : "none"))
      : "none";

  const currentFontSize =
    field.type !== "checkbox"
      ? ((field as { fontSize?: number }).fontSize ?? 14)
      : null;

  const prevSize = currentFontSize
    ? FONT_SIZES.slice().reverse().find((s) => s < currentFontSize) ?? FONT_SIZES[0]
    : null;
  const nextSize = currentFontSize
    ? FONT_SIZES.find((s) => s > currentFontSize) ?? FONT_SIZES[FONT_SIZES.length - 1]
    : null;

  return (
    <>
      {/* Scrim — deselects on outside click */}
      <div
        className="fixed inset-0 z-40"
        onMouseDown={onDeselect}
        style={{ background: "transparent" }}
      />

      {/* Toolbar bar */}
      <div
        className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-border bg-surface shadow-lg px-1"
        style={{ top, left, height: BAR_H }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {field.type === "checkbox" ? (
          <>
            {/* Stamp options */}
            <BarBtn
              active={currentStamp === "tick"}
              onClick={() => onStampChange?.("tick")}
              title="Tick"
            >
              <span className="text-base font-bold leading-none">✓</span>
            </BarBtn>
            <BarBtn
              active={currentStamp === "cross"}
              onClick={() => onStampChange?.("cross")}
              title="Cross"
            >
              <span className="text-base font-bold leading-none">✕</span>
            </BarBtn>
            <BarBtn
              active={currentStamp === "none"}
              onClick={() => onStampChange?.("none")}
              title="Clear stamp"
            >
              <span className="text-xs font-medium text-text-muted">Clear</span>
            </BarBtn>
            <div className="w-px h-5 bg-border mx-0.5" />
            <BarBtn onClick={() => { onDelete(field.id); onDeselect(); }} title="Delete" danger>
              <Trash2 className="h-3.5 w-3.5" />
            </BarBtn>
          </>
        ) : (
          <>
            {/* Font size controls */}
            <BarBtn
              onClick={() => prevSize && onUpdate(field.id, { fontSize: prevSize } as Partial<EditorField>)}
              disabled={!prevSize || currentFontSize === FONT_SIZES[0]}
              title="Smaller"
            >
              <Minus className="h-3.5 w-3.5" />
            </BarBtn>
            <span className="min-w-[36px] text-center text-xs tabular-nums text-text-muted select-none px-1">
              {currentFontSize}px
            </span>
            <BarBtn
              onClick={() => nextSize && onUpdate(field.id, { fontSize: nextSize } as Partial<EditorField>)}
              disabled={!nextSize || currentFontSize === FONT_SIZES[FONT_SIZES.length - 1]}
              title="Larger"
            >
              <Plus className="h-3.5 w-3.5" />
            </BarBtn>
            <div className="w-px h-5 bg-border mx-0.5" />
            <BarBtn onClick={() => { onDelete(field.id); onDeselect(); }} title="Delete" danger>
              <Trash2 className="h-3.5 w-3.5" />
            </BarBtn>
          </>
        )}
      </div>
    </>
  );
}

function BarBtn({
  children,
  onClick,
  title,
  active,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed
        ${active ? "bg-accent text-white" : ""}
        ${danger && !active ? "text-red-500 hover:bg-red-50" : ""}
        ${!active && !danger ? "text-text-muted hover:bg-surface-alt hover:text-text" : ""}
      `}
    >
      {children}
    </button>
  );
}
