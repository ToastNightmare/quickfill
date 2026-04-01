"use client";

import { X, Trash2, Type, CheckSquare, PenTool, Calendar } from "lucide-react";
import type { EditorField } from "@/lib/types";

const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 24, 36];

const TYPE_CONFIG = {
  text: { icon: Type, label: "Text", color: "bg-blue-100 text-blue-700" },
  checkbox: { icon: CheckSquare, label: "Checkbox", color: "bg-green-100 text-green-700" },
  signature: { icon: PenTool, label: "Signature", color: "bg-purple-100 text-purple-700" },
  date: { icon: Calendar, label: "Date", color: "bg-amber-100 text-amber-700" },
} as const;

interface FieldInspectorProps {
  field: EditorField;
  onUpdate: (id: string, updates: Partial<EditorField>) => void;
  onDelete: (id: string) => void;
  onDeselect: () => void;
  position: { x: number; y: number };
}

export function FieldInspector({ field, onUpdate, onDelete, onDeselect, position }: FieldInspectorProps) {
  const config = TYPE_CONFIG[field.type];
  const Icon = config.icon;
  const showFontSize = field.type !== "checkbox";
  const fontSize = showFontSize ? (field as { fontSize?: number }).fontSize ?? 14 : null;

  const valuePreview =
    field.type === "checkbox"
      ? (field.checked ? "Checked" : "Unchecked")
      : field.value || "Empty";

  return (
    <div
      className="fixed z-50 w-48 rounded-xl border border-border bg-white p-3 shadow-xl"
      style={{ top: position.y, left: position.x }}
    >
      {/* Header: type badge + close */}
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.color}`}>
          <Icon className="h-3 w-3" />
          {config.label}
        </span>
        <button
          onClick={onDeselect}
          className="flex h-5 w-5 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
          aria-label="Deselect"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Value preview */}
      <p className="truncate text-xs text-text-muted mb-2" title={valuePreview}>
        {valuePreview}
      </p>

      {/* Font size selector */}
      {showFontSize && (
        <div className="mb-2">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Font Size
          </label>
          <select
            value={fontSize ?? 14}
            onChange={(e) =>
              onUpdate(field.id, { fontSize: Number(e.target.value) } as Partial<EditorField>)
            }
            className="mt-0.5 h-7 w-full rounded-md border border-border bg-white px-1.5 text-xs text-text outline-none focus:border-accent"
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Delete button */}
      <button
        onClick={() => onDelete(field.id)}
        className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
    </div>
  );
}
