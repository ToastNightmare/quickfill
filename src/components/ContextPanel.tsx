"use client";

import {
  Type, CheckSquare, PenTool, Calendar,
  Minus, Plus, Trash2, MousePointer2,
  Sparkles, UserCheck,
} from "lucide-react";
import type { EditorField, ToolType, SignatureField } from "@/lib/types";
import type { CheckboxStamp } from "@/lib/types";

const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 24, 36];

const TOOL_META: Record<ToolType, { icon: typeof Type; label: string; hint: string; color: string }> = {
  text:      { icon: Type,        label: "Text Field",  hint: "Click anywhere on the PDF to place a text field. It will snap to form boxes automatically.",      color: "text-blue-500" },
  checkbox:  { icon: CheckSquare, label: "Checkbox",    hint: "Click anywhere on the PDF to stamp a tick or cross. Click again to cycle or clear.",              color: "text-violet-500" },
  signature: { icon: PenTool,     label: "Signature",   hint: "Click the PDF to place a signature field. You can draw or reuse a saved signature.",              color: "text-pink-500" },
  date:      { icon: Calendar,    label: "Date",        hint: "Click the PDF to place a date field. Today's date is pre-filled, edit it after placing.",        color: "text-amber-500" },
};

interface ContextPanelProps {
  activeTool: ToolType | null;
  selectedField: EditorField | null;
  onToolCancel: () => void;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
  onFieldDelete: (id: string) => void;
  onFieldDeselect: () => void;
  onStampChange: (stamp: CheckboxStamp) => void;
  onSignatureRequest: (fieldId: string) => void;
  onAutoFill: () => void;
  onDetectFields: () => void;
  isDetecting: boolean;
}

export function ContextPanel({
  activeTool,
  selectedField,
  onToolCancel,
  onFieldUpdate,
  onFieldDelete,
  onFieldDeselect,
  onStampChange,
  onSignatureRequest,
  onAutoFill,
  onDetectFields,
  isDetecting,
}: ContextPanelProps) {

  // ── Field selected ALWAYS takes priority (even if activeTool hasn't cleared yet)
  if (selectedField) {
    const fieldType = selectedField.type;

    const TypeIcon =
      fieldType === "checkbox" ? CheckSquare :
      fieldType === "signature" ? PenTool :
      fieldType === "date" ? Calendar : Type;

    const typeLabel =
      fieldType === "checkbox" ? "Checkbox" :
      fieldType === "signature" ? "Signature" :
      fieldType === "date" ? "Date" : "Text Field";

    const typeColor =
      fieldType === "checkbox" ? "text-violet-500" :
      fieldType === "signature" ? "text-pink-500" :
      fieldType === "date" ? "text-amber-500" : "text-blue-500";

    return (
      <Panel>
        {/* Field type header */}
        <Section>
          <div className={`flex items-center gap-2 ${typeColor}`}>
            <TypeIcon className="h-4 w-4 shrink-0" />
            <p className="text-sm font-bold text-text">{typeLabel} selected</p>
          </div>
        </Section>

        <Divider />

        {/* Checkbox stamp controls */}
        {fieldType === "checkbox" && (() => {
          const stamp: CheckboxStamp =
            (selectedField as { stamp?: CheckboxStamp }).stamp ??
            (selectedField.checked ? "tick" : "none");
          return (
            <Section label="Stamp">
              <div className="grid grid-cols-3 gap-2">
                <StampCard active={stamp === "tick"}  onClick={() => onStampChange("tick")}  char="✓" label="Tick" />
                <StampCard active={stamp === "cross"} onClick={() => onStampChange("cross")} char="✕" label="Cross" />
                <StampCard active={stamp === "none"}  onClick={() => onStampChange("none")}  char="○" label="None" />
              </div>
            </Section>
          );
        })()}

        {/* Signature controls */}
        {fieldType === "signature" && (() => {
          const sigField = selectedField as SignatureField;
          const isSigned = !!sigField.signatureDataUrl;
          return (
            <Section label="Signature">
              {isSigned ? (
                <>
                  {/* Preview, generous height, white bg */}
                  <div className="mb-3 flex items-center justify-center rounded-xl border border-green-200 bg-white p-3 min-h-[96px] shadow-inner">
                    <img
                      src={sigField.signatureDataUrl}
                      alt="Signature"
                      className="max-h-20 max-w-full object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <p className="text-xs text-green-700 font-medium">Signed</p>
                  </div>
                  <button
                    onClick={() => onSignatureRequest(selectedField.id)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-text-muted hover:bg-surface-alt transition-colors"
                  >
                    <PenTool className="h-4 w-4" />
                    Re-sign
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-alt p-4 min-h-[96px]">
                    <div className="text-center">
                      <PenTool className="h-6 w-6 text-text-muted mx-auto mb-1.5" />
                      <p className="text-xs font-medium text-text-muted">Not signed yet</p>
                      <p className="text-[10px] text-text-muted/60 mt-0.5">Click below to sign</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onSignatureRequest(selectedField.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                  >
                    <PenTool className="h-4 w-4" />
                    Sign Now
                  </button>
                </>
              )}
            </Section>
          );
        })()}

        {/* Font size controls, text and date only */}
        {(fieldType === "text" || fieldType === "date") && (() => {
          const fontSize = (selectedField as { fontSize?: number }).fontSize ?? 14;
          const prevSize = FONT_SIZES.slice().reverse().find((s) => s < fontSize);
          const nextSize = FONT_SIZES.find((s) => s > fontSize);
          return (
            <Section label="Font Size">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => prevSize && onFieldUpdate(selectedField.id, { fontSize: prevSize } as Partial<EditorField>)}
                  disabled={!prevSize}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-alt transition-colors disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-surface-alt py-2 text-sm font-semibold text-text tabular-nums">
                  {fontSize}px
                </div>
                <button
                  onClick={() => nextSize && onFieldUpdate(selectedField.id, { fontSize: nextSize } as Partial<EditorField>)}
                  disabled={!nextSize}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-alt transition-colors disabled:opacity-30"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </Section>
          );
        })()}

        <Divider />

        <Section>
          <button
            onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete Field
          </button>
        </Section>
      </Panel>
    );
  }

  // ── Tool active (only when no field is selected) ─────────────────────────
  if (activeTool) {
    const { icon: Icon, label, hint, color } = TOOL_META[activeTool];
    return (
      <Panel>
        <Section>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-surface-alt ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="mt-3">
            <p className="text-sm font-bold text-text">{label} active</p>
            <p className="mt-1.5 text-xs text-text-muted leading-relaxed">{hint}</p>
          </div>
        </Section>

        <Divider />

        <Section>
          <button
            onClick={onToolCancel}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
          >
            Cancel
          </button>
        </Section>
      </Panel>
    );
  }

  // ── Idle state ─────────────────────────────────────────────────────────────
  return (
    <Panel>
      <Section>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-alt text-text-muted">
          <MousePointer2 className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-semibold text-text">Nothing selected</p>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">
          Click a tool on the left to start placing fields, or click an existing field to edit it.
        </p>
      </Section>

      <Divider />

      <Section label="Quick Actions">
        <button
          onClick={onAutoFill}
          className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
        >
          <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
          Auto-fill from Profile
        </button>
        <button
          onClick={onDetectFields}
          disabled={isDetecting}
          className="mt-2 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-50"
        >
          {isDetecting
            ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent shrink-0" />
            : <Sparkles className="h-4 w-4 text-accent shrink-0" />
          }
          {isDetecting ? "Detecting..." : "Auto-detect Fields"}
        </button>
      </Section>
    </Panel>
  );
}

// ── Primitives ───────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden sm:flex flex-col w-64 flex-shrink-0 h-full border-l border-border bg-surface overflow-y-auto">
      {children}
    </div>
  );
}

function Section({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="px-4 py-4">
      {label && (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-border flex-shrink-0" />;
}

function StampCard({
  active, onClick, char, label,
}: {
  active: boolean; onClick: () => void; char: string; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition-colors
        ${active
          ? "border-accent bg-accent/5 text-accent"
          : "border-border bg-surface hover:border-accent/40 hover:bg-surface-alt text-text-muted"
        }`}
    >
      <span className="text-xl font-bold leading-none">{char}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
