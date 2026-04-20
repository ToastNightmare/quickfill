"use client";

import { useState } from "react";
import {
  Type, CheckSquare, PenTool, Calendar,
  Minus, Plus, Trash2, MousePointer2,
  Sparkles, UserCheck, Eraser, Grid3X3, Copy,
  ChevronDown, ChevronUp, SquareSplitHorizontal,
} from "lucide-react";
import type { EditorField, ToolType, SignatureField } from "@/lib/types";
import type { CheckboxStamp } from "@/lib/types";

const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 24, 36];

// Grid presets for Australian government forms
const GRID_PRESETS = [
  { label: "ABN (11 digits)", value: 11 },
  { label: "TFN (9 digits)", value: 9 },
  { label: "Medicare (10 chars)", value: 10 },
  { label: "USI (16 chars)", value: 16 },
  { label: "Custom", value: "custom" },
];

const TOOL_META: Record<ToolType, { icon: typeof Type; label: string; hint: string; color: string }> = {
  text:      { icon: Type,        label: "Text Field",  hint: "Click anywhere on the PDF to place a text field. It will snap to form boxes automatically.",      color: "text-blue-500" },
  checkbox:  { icon: CheckSquare, label: "Checkbox",    hint: "Click anywhere on the PDF to stamp a tick or cross. Click again to cycle or clear.",              color: "text-violet-500" },
  signature: { icon: PenTool,     label: "Signature",   hint: "Click the PDF to place a signature field. You can draw or reuse a saved signature.",              color: "text-pink-500" },
  date:      { icon: Calendar,    label: "Date",        hint: "Click the PDF to place a date field. Today's date is pre-filled, edit it after placing.",        color: "text-amber-500" },
  grid:      { icon: Grid3X3,     label: "Grid",        hint: "Drag across individual character boxes to place a grid field. Auto-fills from profile if matched.", color: "text-emerald-500" },
  comb:      { icon: SquareSplitHorizontal, label: "Comb", hint: "Drag to place a comb field for numbers like TFN, ABN, Medicare. Each cell holds one character.", color: "text-cyan-500" },
  whiteout:  { icon: Eraser,      label: "Whiteout",    hint: "Drag to draw a rectangle over unwanted text. It will sample the background color automatically.", color: "text-gray-500" },
};

interface ContextPanelProps {
  activeTool: ToolType | null;
  selectedField: EditorField | null;
  onToolCancel: () => void;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
  onFieldDelete: (id: string) => void;
  onFieldDeselect: () => void;
  onFieldDuplicate?: (id: string) => void;
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
  onFieldDuplicate,
  onStampChange,
  onSignatureRequest,
  onAutoFill,
  onDetectFields,
  isDetecting,
}: ContextPanelProps) {
  const [sizeExpanded, setSizeExpanded] = useState(false);
  const [charCountExpanded, setCharCountExpanded] = useState(false);

  // ── Field selected ALWAYS takes priority (even if activeTool hasn't cleared yet)
  if (selectedField) {
    const fieldType = selectedField.type;

    const TypeIcon =
      fieldType === "checkbox" ? CheckSquare :
      fieldType === "signature" ? PenTool :
      fieldType === "date" ? Calendar :
      fieldType === "whiteout" ? Eraser :
      fieldType === "grid" ? Grid3X3 : Type;

    const typeLabel =
      fieldType === "checkbox" ? "Checkbox" :
      fieldType === "signature" ? "Signature" :
      fieldType === "date" ? "Date" :
      fieldType === "whiteout" ? "Whiteout" :
      fieldType === "grid" ? "Character Grid" : "Text Field";

    const typeColor =
      fieldType === "checkbox" ? "text-violet-500" :
      fieldType === "signature" ? "text-pink-500" :
      fieldType === "date" ? "text-amber-500" :
      fieldType === "whiteout" ? "text-gray-500" :
      fieldType === "grid" ? "text-emerald-500" : "text-blue-500";

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

        {/* Grid field controls */}
        {fieldType === "grid" && (() => {
          const gridField = selectedField as import("@/lib/types").GridField;
          const charCount = gridField.charCount ?? 11;
          const isCustom = !GRID_PRESETS.find(p => p.value === charCount);
          
          return (
            <>
              <Section>
                <button
                  onClick={() => setCharCountExpanded(v => !v)}
                  className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-text-muted hover:text-text transition-colors"
                >
                  Character Count
                  {charCountExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {charCountExpanded && (
                  <>
                    <select
                      value={isCustom ? "custom" : charCount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "custom") {
                          // Keep current count, user will type manually
                          return;
                        }
                        const newCount = parseInt(val, 10);
                        if (!isNaN(newCount) && newCount > 0 && newCount <= 50) {
                          onFieldUpdate(selectedField.id, { charCount: newCount } as Partial<EditorField>);
                        }
                      }}
                      className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium text-text focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      {GRID_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {isCustom && (
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={charCount}
                        onChange={(e) => {
                          const newCount = parseInt(e.target.value, 10);
                          if (!isNaN(newCount) && newCount > 0 && newCount <= 50) {
                            onFieldUpdate(selectedField.id, { charCount: newCount } as Partial<EditorField>);
                          }
                        }}
                        className="mt-2 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium text-text focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="Custom count (1-50)"
                      />
                    )}
                  </>
                )}
              </Section>
              
              <Divider />
              <Section>
                <p className="text-xs text-text-muted text-center">{gridField.value?.length || 0} / {charCount} characters filled</p>
              </Section>
            </>
          );
        })()}

        {/* Comb field controls */}
        {fieldType === "comb" && (() => {
          const combField = selectedField as import("@/lib/types").CombField;
          const charCount = combField.charCount ?? 9;
          
          return (
            <>
              <Section>
                <button
                  onClick={() => setCharCountExpanded(v => !v)}
                  className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-text-muted hover:text-text transition-colors"
                >
                  Character Count
                  {charCountExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {charCountExpanded && (
                  <>
                    <select
                      value={charCount}
                      onChange={(e) => {
                        const newCount = parseInt(e.target.value, 10);
                        if (!isNaN(newCount) && newCount > 0 && newCount <= 30) {
                          onFieldUpdate(selectedField.id, { charCount: newCount } as Partial<EditorField>);
                        }
                      }}
                      className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium text-text focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      {[8, 9, 10, 11, 12, 15, 16, 20, 30].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "character" : "characters"}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-text-muted">
                      Common: 9 (TFN), 11 (ABN), 10 (Medicare)
                    </p>
                  </>
                )}
              </Section>
              
              <Divider />
              <Section>
                <p className="text-xs text-text-muted text-center">{combField.value?.length || 0} / {charCount} characters filled</p>
              </Section>
            </>
          );
        })()}

        {/* Size inputs — not for checkbox or whiteout */}
        {selectedField.type !== "checkbox" && selectedField.type !== "whiteout" && (
          <>
            <Section>
              <button
                onClick={() => setSizeExpanded(v => !v)}
                className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-text-muted hover:text-text transition-colors"
              >
                Size
                {sizeExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {sizeExpanded && (
                <div className="flex gap-2 mt-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-[10px] text-text-muted">W</label>
                    <input
                      type="number"
                      min={20}
                      max={2000}
                      value={Math.round(selectedField.width)}
                      onChange={(e) => {
                        const val = Math.max(20, parseInt(e.target.value) || 20);
                        if (selectedField.type === "signature") {
                          const ratio = selectedField.height / selectedField.width;
                          onFieldUpdate(selectedField.id, { width: val, height: Math.round(val * ratio) } as Partial<EditorField>);
                        } else {
                          onFieldUpdate(selectedField.id, { width: val } as Partial<EditorField>);
                        }
                      }}
                      className="w-full rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-[10px] text-text-muted">H</label>
                    <input
                      type="number"
                      min={10}
                      max={2000}
                      value={Math.round(selectedField.height)}
                      onChange={(e) => {
                        const val = Math.max(10, parseInt(e.target.value) || 10);
                        if (selectedField.type === "signature") {
                          const ratio = selectedField.width / selectedField.height;
                          onFieldUpdate(selectedField.id, { height: val, width: Math.round(val * ratio) } as Partial<EditorField>);
                        } else {
                          onFieldUpdate(selectedField.id, { height: val } as Partial<EditorField>);
                        }
                      }}
                      className="w-full rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </Section>
            <Divider />
          </>
        )}

        <Section>
          {onFieldDuplicate && (
            <button
              onClick={() => onFieldDuplicate(selectedField.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
            >
              <Copy className="h-4 w-4 shrink-0" />
              Duplicate
            </button>
          )}
          <button
            onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors mt-2"
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

        {activeTool === "grid" && (
          <>
            <Divider />
            <Section label="Quick Presets">
              <div className="space-y-1.5">
                <p className="text-xs text-text-muted mb-2">Drag across the character boxes on your PDF. After placing, set the character count in the panel.</p>
                <div className="text-[10px] text-text-muted/70 bg-surface-alt rounded-lg p-2">
                  <p className="font-medium mb-1">Common Australian forms:</p>
                  <ul className="space-y-0.5">
                    <li>• ABN: 11 digits</li>
                    <li>• TFN: 9 digits</li>
                    <li>• Medicare: 10 chars</li>
                    <li>• USI: 16 chars</li>
                  </ul>
                </div>
              </div>
            </Section>
          </>
        )}

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
