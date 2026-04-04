"use client";

import { X, Minus, Plus, Lock, Unlock, Trash2 } from "lucide-react";
import type { EditorField } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  text: "Text Field",
  checkbox: "Checkbox",
  signature: "Signature",
  date: "Date",
};

interface FieldInspectorProps {
  field: EditorField;
  onUpdate: (id: string, updates: Partial<EditorField>) => void;
  onDelete: (id: string) => void;
  onDeselect: () => void;
  position: { x: number; y: number };
}

export function FieldInspector({ field, onUpdate, onDelete, onDeselect, position }: FieldInspectorProps) {
  const showFontSize = field.type !== "checkbox";
  const fontSize = showFontSize ? (field as { fontSize?: number }).fontSize ?? 14 : null;
  const isSnapped = field.snapped ?? false;

  // ── Mobile: bottom sheet ────────────────────────────────────────────────────
  const mobileSheet = (
    <div className="sm:hidden fixed inset-x-0 bottom-0 z-50 pb-safe">
      {/* Scrim */}
      <div
        className="fixed inset-0 bg-black/30"
        onClick={onDeselect}
      />
      {/* Sheet */}
      <div className="relative rounded-t-2xl border-t border-border bg-surface px-4 pt-3 pb-8 shadow-2xl">
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-text">
              {TYPE_LABELS[field.type] ?? field.type}
            </span>
            {isSnapped && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                <Lock className="h-3 w-3" />
                Snapped
              </span>
            )}
          </div>
          <button
            onClick={onDeselect}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-alt text-text-muted hover:text-text transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Detach snapped */}
        {isSnapped && (
          <button
            onClick={() => onUpdate(field.id, { snapped: false, snapBounds: undefined } as Partial<EditorField>)}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium text-text-muted hover:bg-surface-alt transition-colors"
          >
            <Unlock className="h-4 w-4" />
            Detach from box
          </button>
        )}

        {/* Font size */}
        {showFontSize && fontSize !== null && (
          <div className="mb-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Font Size</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onUpdate(field.id, { fontSize: Math.max(8, fontSize - 2) } as Partial<EditorField>)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:bg-surface-alt transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-surface-alt py-2.5 text-sm font-semibold text-text">
                {fontSize}px
              </div>
              <button
                onClick={() => onUpdate(field.id, { fontSize: Math.min(72, fontSize + 2) } as Partial<EditorField>)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:bg-surface-alt transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Delete */}
        <button
          onClick={() => { onDelete(field.id); onDeselect(); }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Delete Field
        </button>
      </div>
    </div>
  );

  // ── Desktop: floating tooltip (unchanged) ───────────────────────────────────
  const desktopTooltip = (
    <div
      className="hidden sm:block fixed z-50 w-44"
      style={{ top: position.y, left: position.x }}
    >
      <div className="rounded-lg border border-border bg-surface p-3 shadow-lg">
        {/* Row 1: Type badge + snapped indicator + close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-medium text-text-muted">
              {TYPE_LABELS[field.type] ?? field.type}
            </span>
            {isSnapped && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">
                <Lock className="h-2.5 w-2.5" />
                Snapped
              </span>
            )}
          </div>
          <button
            onClick={onDeselect}
            className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-surface-alt hover:text-text-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Row 2: Detach button for snapped fields */}
        {isSnapped && (
          <button
            onClick={() => onUpdate(field.id, { snapped: false, snapBounds: undefined } as Partial<EditorField>)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
          >
            <Unlock className="h-2.5 w-2.5" />
            Detach from box
          </button>
        )}

        {/* Row 3: Font size stepper */}
        {showFontSize && fontSize !== null && (
          <div className="mt-2 flex items-center gap-1.5">
            <button
              onClick={() => onUpdate(field.id, { fontSize: Math.max(8, fontSize - 1) } as Partial<EditorField>)}
              className="flex h-6 w-6 items-center justify-center rounded border border-border text-text-muted hover:bg-surface-alt transition-colors"
            >
              <Minus className="h-3 w-3" />
            </button>
            <input
              type="number"
              value={fontSize}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 6 && v <= 72) {
                  onUpdate(field.id, { fontSize: v } as Partial<EditorField>);
                }
              }}
              className="h-6 w-10 rounded border border-border text-center text-xs text-text outline-none focus:border-blue-400"
            />
            <button
              onClick={() => onUpdate(field.id, { fontSize: Math.min(72, fontSize + 1) } as Partial<EditorField>)}
              className="flex h-6 w-6 items-center justify-center rounded border border-border text-text-muted hover:bg-surface-alt transition-colors"
            >
              <Plus className="h-3 w-3" />
            </button>
            <span className="text-[10px] text-text-muted">px</span>
          </div>
        )}

        {/* Row 4: Delete field */}
        <button
          onClick={() => onDelete(field.id)}
          className="mt-2 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
        >
          Delete field
        </button>
      </div>

      {/* Triangle pointer pointing down */}
      <div className="flex justify-center">
        <div
          className="h-0 w-0"
          style={{
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "6px solid var(--color-surface)",
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.08))",
          }}
        />
      </div>
    </div>
  );

  return (
    <>
      {mobileSheet}
      {desktopTooltip}
    </>
  );
}
