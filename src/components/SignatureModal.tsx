"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Trash2, RotateCcw } from "lucide-react";
import { useSignaturePad } from "./SignaturePad";

interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  onDelete?: () => void;
  existingSignature?: string | null;
  /** If true, show "Use Signature" instead of "Save Signature" */
  useMode?: boolean;
  /** Called when user wants to use the existing saved signature */
  onUseExisting?: () => void;
}

export function SignatureModal({
  open,
  onClose,
  onSave,
  onDelete,
  existingSignature,
  useMode,
  onUseExisting,
}: SignatureModalProps) {
  const [mode, setMode] = useState<"view" | "draw">(
    existingSignature ? "view" : "draw"
  );
  const [saving, setSaving] = useState(false);
  const [padWidth, setPadWidth] = useState(400);

  // Responsive pad width
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const w = Math.min(window.innerWidth - 64, 480);
      setPadWidth(Math.max(280, w));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  const { canvasElement, clear, toDataURL, hasContent } = useSignaturePad({
    width: padWidth,
    height: 180,
  });

  // Reset mode when modal opens
  useEffect(() => {
    if (open) {
      setMode(existingSignature ? "view" : "draw");
    }
  }, [open, existingSignature]);

  // Clear pad whenever draw mode becomes active (open fresh or Re-sign)
  useEffect(() => {
    if (mode === "draw") {
      setTimeout(() => clear(), 30);
    }
  }, [mode, clear]);

  const handleSave = useCallback(async () => {
    const dataUrl = toDataURL();
    if (!dataUrl) return;

    setSaving(true);
    try {
      await onSave(dataUrl);
    } finally {
      setSaving(false);
    }
  }, [toDataURL, onSave]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
    } finally {
      setSaving(false);
    }
  }, [onDelete]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal panel - bottom sheet on mobile, centered on desktop */}
      <div
        className="relative z-10 w-full sm:w-auto sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-surface shadow-2xl animate-fade-in"
        style={{ isolation: "isolate" }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-text">
            {mode === "view" ? "Your Signature" : "Sign here"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {mode === "view" && existingSignature ? (
            <div className="flex flex-col items-center gap-4">
              {/* Signature preview */}
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-alt p-4 w-full min-h-[120px]">
                <img
                  src={existingSignature}
                  alt="Your saved signature"
                  className="max-h-[100px] max-w-full object-contain"
                  draggable={false}
                />
              </div>

              {/* Actions */}
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                {useMode && onUseExisting && (
                  <button
                    onClick={onUseExisting}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                  >
                    Use Signature
                  </button>
                )}
                <button
                  onClick={() => {
                    setMode("draw");
                    clear();
                  }}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-text hover:bg-surface-alt transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                  {existingSignature ? "Replace" : "Draw New"}
                </button>
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {/* Drawing area */}
              <div
                className="relative w-full overflow-hidden rounded-xl border-2 border-border bg-white shadow-inner"
                style={{ cursor: "crosshair" }}
              >
                {canvasElement}
                {!hasContent && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <p className="text-sm text-text-muted/40 select-none">Draw your signature here</p>
                    <p className="text-xs text-text-muted/30 select-none">Use your mouse or finger</p>
                  </div>
                )}
                {/* Bottom line like a real signature line */}
                <div className="absolute bottom-8 left-6 right-6 h-px bg-border/60 pointer-events-none" />
              </div>

              {/* Actions */}
              <div className="flex w-full gap-2">
                <button
                  onClick={handleSave}
                  disabled={!hasContent || saving}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
                >
                  {saving ? "Saving..." : useMode ? "Save & Use" : "Save Signature"}
                </button>
                <button
                  onClick={clear}
                  title="Clear and redraw"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                {existingSignature && (
                  <button
                    onClick={() => setMode("view")}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:bg-surface-alt transition-colors"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile drag handle hint */}
        <div className="flex justify-center pb-3 sm:hidden">
          <div className="h-1 w-8 rounded-full bg-border" />
        </div>
      </div>
    </div>
  );
}
