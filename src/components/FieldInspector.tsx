"use client";

import { X, Minus, Plus } from "lucide-react";
import type { EditorField } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  text: "T Text",
  checkbox: "\u2610 Checkbox",
  signature: "\u270D Signature",
  date: "\uD83D\uDCC5 Date",
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

  return (
    <div
      className="fixed z-50 w-44"
      style={{ top: position.y, left: position.x }}
    >
      <div className="rounded-lg border border-[#e5e7eb] bg-white p-3 shadow-lg">
        {/* Row 1: Type badge + close */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {TYPE_LABELS[field.type] ?? field.type}
          </span>
          <button
            onClick={onDeselect}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Row 2: Font size stepper */}
        {showFontSize && fontSize !== null && (
          <div className="mt-2 flex items-center gap-1.5">
            <button
              onClick={() => onUpdate(field.id, { fontSize: Math.max(8, fontSize - 1) } as Partial<EditorField>)}
              className="flex h-6 w-6 items-center justify-center rounded border border-[#e5e7eb] text-gray-500 hover:bg-gray-50 transition-colors"
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
              className="h-6 w-10 rounded border border-[#e5e7eb] text-center text-xs text-gray-700 outline-none focus:border-blue-400"
            />
            <button
              onClick={() => onUpdate(field.id, { fontSize: Math.min(72, fontSize + 1) } as Partial<EditorField>)}
              className="flex h-6 w-6 items-center justify-center rounded border border-[#e5e7eb] text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <Plus className="h-3 w-3" />
            </button>
            <span className="text-[10px] text-gray-400">px</span>
          </div>
        )}

        {/* Row 3: Delete field */}
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
            borderTop: "6px solid white",
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.08))",
          }}
        />
      </div>
    </div>
  );
}
