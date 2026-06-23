"use client";

import { useState, type ReactNode } from "react";
import {
  Type,
  CheckSquare,
  PenTool,
  Calendar,
  Minus,
  Plus,
  Trash2,
  MousePointer2,
  Sparkles,
  UserCheck,
  Eraser,
  Copy,
  Pencil,
  ChevronDown,
  ChevronUp,
  SquareSplitHorizontal,
} from "lucide-react";
import type { CheckboxStamp, CombField, EditorField, FieldLayerDirection, SignatureField, ToolType, WhiteoutField } from "@/lib/types";

const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 24, 36];

const TOOL_META: Record<ToolType, { icon: typeof Type; label: string; hint: string; color: string }> = {
  select: { icon: MousePointer2, label: "Select", hint: "Select existing QuickFill fields to move, resize, duplicate, or delete them.", color: "text-text-muted" },
  text: { icon: Type, label: "Text Field", hint: "Tap or drag on the PDF to place a text field.", color: "text-blue-500" },
  checkbox: { icon: CheckSquare, label: "Checkbox", hint: "Tap a box to place a tick, then tap the field to change it.", color: "text-violet-500" },
  signature: { icon: PenTool, label: "Signature", hint: "Tap where the signature should go, then draw or reuse your saved signature.", color: "text-pink-500" },
  date: { icon: Calendar, label: "Date", hint: "Tap where the date should go. Today's date is added first.", color: "text-amber-500" },
  box: { icon: SquareSplitHorizontal, label: "Box Field", hint: "Drag across character boxes for TFN, ABN, Medicare, and similar forms.", color: "text-cyan-500" },
  whiteout: { icon: Eraser, label: "Whiteout", hint: "Drag over text you want to cover. QuickFill samples the paper color.", color: "text-gray-500" },
  line: { icon: Pencil, label: "Line", hint: "Line defaults will appear here when the line tool is available.", color: "text-emerald-500" },
  eraser: { icon: Eraser, label: "Eraser", hint: "Eraser defaults will appear here when the eraser tool is available.", color: "text-red-500" },
};

interface ContextPanelProps {
  activeTool: ToolType;
  selectedField: EditorField | null;
  onToolCancel: () => void;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
  onFieldDelete: (id: string) => void;
  onFieldDeselect: () => void;
  onFieldEdit?: (id: string) => void;
  onFieldDuplicate?: (id: string) => void;
  onStampChange: (stamp: CheckboxStamp) => void;
  onSignatureRequest: (fieldId: string) => void;
  onAutoFill: () => void;
  onDetectFields: () => void;
  isDetecting: boolean;
  whiteoutColor?: string | null;
  onWhiteoutColorChange?: (color: string) => void;
}

function dispatchLayerMove(fieldId: string, direction: FieldLayerDirection) {
  window.dispatchEvent(new CustomEvent("quickfill:move-field-layer", { detail: { fieldId, direction } }));
}

function FieldIcon({ type, className }: { type: EditorField["type"]; className?: string }) {
  if (type === "checkbox") return <CheckSquare className={className} />;
  if (type === "signature") return <PenTool className={className} />;
  if (type === "date") return <Calendar className={className} />;
  if (type === "whiteout") return <Eraser className={className} />;
  if (type === "comb") return <SquareSplitHorizontal className={className} />;
  return <Type className={className} />;
}

function fieldLabel(type: EditorField["type"]) {
  if (type === "checkbox") return "Checkbox";
  if (type === "signature") return "Signature";
  if (type === "date") return "Date";
  if (type === "whiteout") return "Whiteout";
  if (type === "comb") return "Box Field";
  return "Text Field";
}

function fieldColor(type: EditorField["type"]) {
  if (type === "checkbox") return "text-violet-500";
  if (type === "signature") return "text-pink-500";
  if (type === "date") return "text-amber-500";
  if (type === "whiteout") return "text-gray-500";
  if (type === "comb") return "text-cyan-500";
  return "text-blue-500";
}

export function ContextPanel({
  activeTool,
  selectedField,
  onToolCancel,
  onFieldUpdate,
  onFieldDelete,
  onFieldDeselect,
  onFieldEdit,
  onFieldDuplicate,
  onStampChange,
  onSignatureRequest,
  onAutoFill,
  onDetectFields,
  isDetecting,
  whiteoutColor,
  onWhiteoutColorChange,
}: ContextPanelProps) {
  const [sizeExpanded, setSizeExpanded] = useState(false);
  const [charCountExpanded, setCharCountExpanded] = useState(false);

  void onAutoFill;
  void onDetectFields;
  void isDetecting;
  void Sparkles;
  void UserCheck;

  if (selectedField) {
    const fieldType = selectedField.type;

    return (
      <>
        <MobileFieldSheet
          selectedField={selectedField}
          onFieldUpdate={onFieldUpdate}
          onFieldDelete={onFieldDelete}
          onFieldDeselect={onFieldDeselect}
          onFieldEdit={onFieldEdit}
          onFieldDuplicate={onFieldDuplicate}
          onStampChange={onStampChange}
          onSignatureRequest={onSignatureRequest}
          charCountExpanded={charCountExpanded}
          onCharCountExpandedChange={setCharCountExpanded}
        />
        <Panel>
          <Section>
            <div className={`flex items-center gap-2 ${fieldColor(fieldType)}`}>
              <FieldIcon type={fieldType} className="h-4 w-4 shrink-0" />
              <p className="text-sm font-bold text-text">{fieldLabel(fieldType)} selected</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              Adjust this field here. Changes autosave locally in this browser.
            </p>
          </Section>

          <Divider />
          <LayerControls selectedField={selectedField} />
          <Divider />

          {fieldType === "checkbox" && <CheckboxControls selectedField={selectedField} onStampChange={onStampChange} />}
          {fieldType === "whiteout" && <WhiteoutControls selectedField={selectedField} onFieldUpdate={onFieldUpdate} />}
          {fieldType === "signature" && <SignatureControls selectedField={selectedField} onSignatureRequest={onSignatureRequest} />}
          {(fieldType === "text" || fieldType === "date") && <FontSizeControls selectedField={selectedField} onFieldUpdate={onFieldUpdate} />}
          {fieldType === "comb" && (
            <CombControls
              selectedField={selectedField}
              expanded={charCountExpanded}
              onExpandedChange={setCharCountExpanded}
              onFieldUpdate={onFieldUpdate}
            />
          )}

          {selectedField.type !== "checkbox" && selectedField.type !== "whiteout" && (
            <>
              <SizeControls
                selectedField={selectedField}
                expanded={sizeExpanded}
                onExpandedChange={setSizeExpanded}
                onFieldUpdate={onFieldUpdate}
              />
              <Divider />
            </>
          )}

          <Section>
            {onFieldDuplicate && (
              <button
                onClick={() => onFieldDuplicate(selectedField.id)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
              >
                <Copy className="h-4 w-4 shrink-0" />
                Duplicate
              </button>
            )}
            <button
              onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              Delete Field
            </button>
          </Section>
        </Panel>
      </>
    );
  }

  if (activeTool !== "select") {
    const { icon: Icon, label, hint, color } = TOOL_META[activeTool];
    return (
      <Panel>
        <Section>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-surface-alt ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="mt-3">
            <p className="text-sm font-bold text-text">{label} active</p>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{hint}</p>
          </div>
        </Section>

        {activeTool === "whiteout" && onWhiteoutColorChange && (
          <>
            <Divider />
            <Section label="Default Color">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={whiteoutColor || "#ffffff"}
                  onChange={(event) => onWhiteoutColorChange(event.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-white p-1"
                />
                <div className="flex-1">
                  <p className="text-xs font-medium text-text">{whiteoutColor || "#ffffff"}</p>
                  <p className="text-[10px] text-text-muted">Override auto-sampled color</p>
                </div>
              </div>
            </Section>
          </>
        )}

        <Divider />
        <Section>
          <button
            onClick={onToolCancel}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
          >
            Cancel
          </button>
        </Section>
      </Panel>
    );
  }

  return (
    <Panel>
      <Section>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-alt text-text-muted">
          <MousePointer2 className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-semibold text-text">Select Tool</p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Select existing QuickFill fields to move, resize, duplicate, or delete them. The original document stays locked.
        </p>
      </Section>
    </Panel>
  );
}

function MobileFieldSheet({
  selectedField,
  onFieldUpdate,
  onFieldDelete,
  onFieldDeselect,
  onFieldEdit,
  onFieldDuplicate,
  onStampChange,
  onSignatureRequest,
  charCountExpanded,
  onCharCountExpandedChange,
}: {
  selectedField: EditorField;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
  onFieldDelete: (id: string) => void;
  onFieldDeselect: () => void;
  onFieldEdit?: (id: string) => void;
  onFieldDuplicate?: (id: string) => void;
  onStampChange: (stamp: CheckboxStamp) => void;
  onSignatureRequest: (fieldId: string) => void;
  charCountExpanded: boolean;
  onCharCountExpandedChange: (value: boolean) => void;
}) {
  return (
    <div
      className="fixed bottom-[8.25rem] left-3 right-3 z-30 max-h-[42svh] overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl sm:hidden"
      data-testid="mobile-field-sheet"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div className={`flex min-w-0 items-center gap-2 ${fieldColor(selectedField.type)}`}>
          <FieldIcon type={selectedField.type} className="h-4 w-4 shrink-0" />
          <p className="truncate text-sm font-bold text-text">{fieldLabel(selectedField.type)} selected</p>
        </div>
        <button
          onClick={onFieldDeselect}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
        >
          Done
        </button>
      </div>

      {selectedField.type === "checkbox" && <CheckboxControls selectedField={selectedField} onStampChange={onStampChange} />}
      {selectedField.type === "whiteout" && <WhiteoutControls selectedField={selectedField} onFieldUpdate={onFieldUpdate} />}
      {selectedField.type === "signature" && <SignatureControls selectedField={selectedField} onSignatureRequest={onSignatureRequest} />}
      {(selectedField.type === "text" || selectedField.type === "date") && <FontSizeControls selectedField={selectedField} onFieldUpdate={onFieldUpdate} />}
      {selectedField.type === "comb" && (
        <CombControls
          selectedField={selectedField}
          expanded={charCountExpanded}
          onExpandedChange={onCharCountExpandedChange}
          onFieldUpdate={onFieldUpdate}
        />
      )}

      <Section>
        <div className="grid grid-cols-2 gap-2">
          {(selectedField.type === "text" || selectedField.type === "date") && onFieldEdit && (
            <button
              onClick={() => onFieldEdit(selectedField.id)}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/5 text-sm font-semibold text-accent hover:bg-accent/10"
              data-testid="mobile-field-edit"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          {onFieldDuplicate && (
            <button
              onClick={() => onFieldDuplicate(selectedField.id)}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </button>
          )}
          <button
            onClick={() => { onFieldDelete(selectedField.id); onFieldDeselect(); }}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-semibold text-red-600 hover:bg-red-100"
            data-testid="mobile-field-delete"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </Section>
    </div>
  );
}

function LayerControls({ selectedField }: { selectedField: EditorField }) {
  const note = selectedField.type === "whiteout"
    ? "Whiteout remains behind fill fields. These buttons reorder whiteout patches."
    : "Whiteout stays behind this field. These buttons reorder fill fields.";

  return (
    <Section label="Layer">
      <div className="grid grid-cols-2 gap-2">
        <LayerButton label="Back" onClick={() => dispatchLayerMove(selectedField.id, "back")} />
        <LayerButton label="Backward" onClick={() => dispatchLayerMove(selectedField.id, "backward")} />
        <LayerButton label="Forward" onClick={() => dispatchLayerMove(selectedField.id, "forward")} />
        <LayerButton label="Front" onClick={() => dispatchLayerMove(selectedField.id, "front")} />
      </div>
      <p className="mt-2 text-xs leading-5 text-text-muted">{note}</p>
    </Section>
  );
}

function LayerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border bg-surface-alt px-2 py-2 text-xs font-semibold text-text-muted transition-colors hover:border-accent hover:text-text"
    >
      {label}
    </button>
  );
}

function CheckboxControls({ selectedField, onStampChange }: { selectedField: EditorField; onStampChange: (stamp: CheckboxStamp) => void }) {
  if (selectedField.type !== "checkbox") return null;
  const stamp: CheckboxStamp = selectedField.stamp ?? (selectedField.checked ? "tick" : "none");
  return (
    <Section label="Stamp">
      <div className="grid grid-cols-3 gap-2">
        <StampCard active={stamp === "tick"} onClick={() => onStampChange("tick")} char="T" label="Tick" />
        <StampCard active={stamp === "cross"} onClick={() => onStampChange("cross")} char="X" label="Cross" />
        <StampCard active={stamp === "none"} onClick={() => onStampChange("none")} char="-" label="None" />
      </div>
    </Section>
  );
}

function WhiteoutControls({ selectedField, onFieldUpdate }: { selectedField: EditorField; onFieldUpdate: (id: string, updates: Partial<EditorField>) => void }) {
  if (selectedField.type !== "whiteout") return null;
  const whiteoutField = selectedField as WhiteoutField;
  return (
    <Section label="Fill Color">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={whiteoutField.fillColor}
          onChange={(event) => onFieldUpdate(selectedField.id, { fillColor: event.target.value } as Partial<EditorField>)}
          className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-white p-1"
        />
        <div className="flex-1">
          <p className="text-xs font-medium text-text">{whiteoutField.fillColor}</p>
          <p className="text-[10px] text-text-muted">Pick a different cover color</p>
        </div>
      </div>
    </Section>
  );
}

function SignatureControls({ selectedField, onSignatureRequest }: { selectedField: EditorField; onSignatureRequest: (fieldId: string) => void }) {
  if (selectedField.type !== "signature") return null;
  const sigField = selectedField as SignatureField;
  const isSigned = Boolean(sigField.signatureDataUrl);
  return (
    <Section label="Signature">
      {isSigned && sigField.signatureDataUrl ? (
        <div className="mb-3 flex min-h-[80px] items-center justify-center rounded-xl border border-green-200 bg-white p-3 shadow-inner">
          <img src={sigField.signatureDataUrl} alt="Signature" className="max-h-16 max-w-full object-contain" />
        </div>
      ) : (
        <div className="mb-3 flex min-h-[80px] items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-alt p-4 text-center">
          <div>
            <PenTool className="mx-auto mb-1.5 h-6 w-6 text-text-muted" />
            <p className="text-xs font-medium text-text-muted">Not signed yet</p>
          </div>
        </div>
      )}
      <button
        onClick={() => onSignatureRequest(selectedField.id)}
        className={isSigned
          ? "flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt"
          : "flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"}
      >
        <PenTool className="h-4 w-4" />
        {isSigned ? "Re-sign" : "Sign Now"}
      </button>
    </Section>
  );
}

function FontSizeControls({ selectedField, onFieldUpdate }: { selectedField: EditorField; onFieldUpdate: (id: string, updates: Partial<EditorField>) => void }) {
  const fontSize = (selectedField as { fontSize?: number }).fontSize ?? 14;
  const prevSize = FONT_SIZES.slice().reverse().find((size) => size < fontSize);
  const nextSize = FONT_SIZES.find((size) => size > fontSize);
  return (
    <Section label="Font Size">
      <div className="flex items-center gap-2">
        <button
          onClick={() => prevSize && onFieldUpdate(selectedField.id, { fontSize: prevSize } as Partial<EditorField>)}
          disabled={!prevSize}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:bg-surface-alt disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-surface-alt py-2 text-sm font-semibold tabular-nums text-text">
          {fontSize}px
        </div>
        <button
          onClick={() => nextSize && onFieldUpdate(selectedField.id, { fontSize: nextSize } as Partial<EditorField>)}
          disabled={!nextSize}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:bg-surface-alt disabled:opacity-30"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </Section>
  );
}

function CombControls({
  selectedField,
  expanded,
  onExpandedChange,
  onFieldUpdate,
}: {
  selectedField: EditorField;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
}) {
  if (selectedField.type !== "comb") return null;
  const combField = selectedField as CombField;
  const charCount = combField.charCount ?? 9;
  const currentCellWidth = combField.cellWidth ?? Math.round(selectedField.width / charCount);

  return (
    <>
      <Section>
        <button
          onClick={() => onExpandedChange(!expanded)}
          className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-text-muted transition-colors hover:text-text"
        >
          Character Count
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {expanded && (
          <>
            <select
              value={charCount}
              onChange={(event) => {
                const newCount = parseInt(event.target.value, 10);
                if (Number.isFinite(newCount) && newCount > 0 && newCount <= 30) {
                  onFieldUpdate(selectedField.id, {
                    charCount: newCount,
                    cellPositions: undefined,
                    cellWidths: undefined,
                  } as Partial<EditorField>);
                }
              }}
              className="mt-2 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium text-text focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {[8, 9, 10, 11, 12, 15, 16, 20, 30].map((count) => (
                <option key={count} value={count}>{count} characters</option>
              ))}
            </select>
            <p className="mt-2 text-xs text-text-muted">Common: 9 TFN, 11 ABN, 10 Medicare</p>
          </>
        )}
      </Section>

      <Divider />
      <RangeControl
        label="Cell Width"
        min={12}
        max={50}
        value={currentCellWidth}
        suffix="px"
        onChange={(newWidth) => onFieldUpdate(selectedField.id, {
          cellWidth: newWidth,
          width: newWidth * charCount,
          cellPositions: undefined,
          cellWidths: undefined,
        } as Partial<EditorField>)}
      />
      <Divider />
      <RangeControl
        label="X Offset"
        min={-20}
        max={20}
        value={combField.offsetX ?? 0}
        suffix="px"
        onChange={(offsetX) => onFieldUpdate(selectedField.id, { offsetX } as Partial<EditorField>)}
      />
      <Divider />
      <RangeControl
        label="Char Offset"
        min={-10}
        max={10}
        value={combField.charOffsetX ?? 0}
        suffix="px"
        onChange={(charOffsetX) => onFieldUpdate(selectedField.id, { charOffsetX } as Partial<EditorField>)}
      />
      <Divider />
      <Section>
        <p className="text-center text-xs text-text-muted">{combField.value?.replace(/ +$/, "").length || 0} / {charCount} characters filled</p>
      </Section>
    </>
  );
}

function RangeControl({ label, min, max, value, suffix, onChange }: { label: string; min: number; max: number; value: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <Section>
      <label className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(event) => onChange(parseInt(event.target.value, 10))}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-surface-alt accent-accent"
        />
        <span className="w-10 text-right text-xs text-text-muted">{value}{suffix}</span>
      </div>
    </Section>
  );
}

function SizeControls({
  selectedField,
  expanded,
  onExpandedChange,
  onFieldUpdate,
}: {
  selectedField: EditorField;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
}) {
  return (
    <Section>
      <button
        onClick={() => onExpandedChange(!expanded)}
        className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-text-muted transition-colors hover:text-text"
      >
        Size
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="mt-2 flex gap-2">
          <SizeInput
            label="W"
            value={selectedField.width}
            min={20}
            onChange={(value) => {
              if (selectedField.type === "signature") {
                const ratio = selectedField.height / selectedField.width;
                onFieldUpdate(selectedField.id, { width: value, height: Math.round(value * ratio) } as Partial<EditorField>);
              } else {
                onFieldUpdate(selectedField.id, { width: value } as Partial<EditorField>);
              }
            }}
          />
          <SizeInput
            label="H"
            value={selectedField.height}
            min={10}
            onChange={(value) => {
              if (selectedField.type === "signature") {
                const ratio = selectedField.width / selectedField.height;
                onFieldUpdate(selectedField.id, { height: value, width: Math.round(value * ratio) } as Partial<EditorField>);
              } else {
                onFieldUpdate(selectedField.id, { height: value } as Partial<EditorField>);
              }
            }}
          />
        </div>
      )}
    </Section>
  );
}

function SizeInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <label className="text-[10px] text-text-muted">{label}</label>
      <input
        type="number"
        min={min}
        max={2000}
        value={Math.round(value)}
        onChange={(event) => onChange(Math.max(min, parseInt(event.target.value, 10) || min))}
        className="w-full rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="hidden h-full w-64 flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-surface sm:flex">
      {children}
    </div>
  );
}

function Section({ children, label }: { children: ReactNode; label?: string }) {
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
  return <div className="mx-4 h-px flex-shrink-0 bg-border" />;
}

function StampCard({ active, onClick, char, label }: { active: boolean; onClick: () => void; char: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition-colors ${
        active
          ? "border-accent bg-accent/5 text-accent"
          : "border-border bg-surface text-text-muted hover:border-accent/40 hover:bg-surface-alt"
      }`}
    >
      <span className="text-xl font-bold leading-none">{char}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
