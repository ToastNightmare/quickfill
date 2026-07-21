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
  Sparkles,
  UserCheck,
  Map,
  Save,
  FilePlus2,
  FileMinus2,
  PaintBucket,
  Magnet,
  HelpCircle,
  RotateCcw,
  SquareSplitHorizontal,
  MousePointer2,
  Pencil,
  Eraser,
  MoreHorizontal,
} from "lucide-react";
import type { ToolType, EditorField } from "@/lib/types";
import { Minimap } from "@/components/Minimap";
import type { RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";

interface ToolbarProps {
  activeTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDownload: () => void;
  onSaveProgress?: () => void;
  isSavingProgress?: boolean;
  onStartOver?: () => void;
  onAddPage?: () => void;
  isAddingPage?: boolean;
  onRemovePage?: () => void;
  canRemovePage?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isDownloading: boolean;
  selectedField: EditorField | null;
  onFontSizeChange: (size: number) => void;
  onDetectFields: () => void;
  isDetecting: boolean;
  onAutoFill: () => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
  onShowHelp?: () => void;
  mobile?: boolean;
  /** Mobile only: render nothing (e.g. while a field sheet or text edit owns the bottom of the screen). */
  hidden?: boolean;
  fields?: EditorField[];
  minimapCanvas?: HTMLCanvasElement | null;
  viewerRef?: RefObject<HTMLDivElement | null>;
  zoom?: number;
  onMinimapRefresh?: () => void;
}

const tools: { type: ToolType; icon: typeof Type; label: string; shortLabel: string; title: string }[] = [
  { type: "select", icon: MousePointer2, label: "Select", shortLabel: "Select", title: "Select fields" },
  { type: "text", icon: Type, label: "Text Field", shortLabel: "Text", title: "Text field: tap or drag to place" },
  { type: "box", icon: SquareSplitHorizontal, label: "Box Field", shortLabel: "Box", title: "Box field: drag across character boxes" },
  { type: "checkbox", icon: CheckSquare, label: "Checkbox", shortLabel: "Tick", title: "Checkbox: tap to place a tick or cross" },
  { type: "line", icon: Pencil, label: "Line", shortLabel: "Line", title: "Line: click to place a horizontal or vertical line" },
  { type: "mask-eraser", icon: Eraser, label: "Eraser", shortLabel: "Eraser", title: "Eraser: drag to erase parts of placed fields" },
  { type: "signature", icon: PenTool, label: "Signature", shortLabel: "Sign", title: "Signature field: tap to place" },
  { type: "date", icon: Calendar, label: "Date", shortLabel: "Date", title: "Date: tap to stamp today's date" },
  { type: "whiteout", icon: PaintBucket, label: "Whiteout", shortLabel: "Whiteout", title: "Whiteout: drag over text to cover it" },
];

const isPlacementTool = (tool: ToolType) => tool !== "select" && tool !== "eraser" && tool !== "mask-eraser";

function isPaidUsage(data: { isPro?: boolean; tier?: string | null } | null): boolean {
  const tier = data?.tier ?? "free";
  return Boolean(data?.isPro || tier === "pro" || tier === "business");
}

export function Toolbar({
  activeTool,
  onToolSelect,
  onUndo,
  onRedo,
  onClear,
  onDownload,
  onSaveProgress,
  isSavingProgress,
  onStartOver,
  onAddPage,
  isAddingPage,
  onRemovePage,
  canRemovePage,
  canUndo,
  canRedo,
  isDownloading,
  selectedField,
  onFontSizeChange,
  onDetectFields,
  isDetecting,
  onAutoFill,
  snapEnabled,
  onSnapToggle,
  onShowHelp,
  mobile,
  hidden,
  fields,
  minimapCanvas,
  viewerRef,
  zoom,
  onMinimapRefresh,
}: ToolbarProps) {
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const fieldCount = fields?.length ?? 0;

  void selectedField;
  void onFontSizeChange;
  void onDetectFields;
  void isDetecting;
  void onAutoFill;
  void Sparkles;
  void UserCheck;

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setIsPro(isPaidUsage(data)))
      .catch(() => setIsPro(false));
  }, []);

  if (mobile) {
    // A selected-field sheet or an active text edit replaces the toolbar so
    // the document keeps as much of the screen as possible.
    if (hidden) return null;
    const pageActionCount = [onAddPage, onRemovePage].filter(Boolean).length;
    const utilityGridColumns = pageActionCount === 2
      ? "grid-cols-4 min-[380px]:grid-cols-7"
      : pageActionCount === 1
        ? "grid-cols-3 min-[328px]:grid-cols-6"
        : "grid-cols-5";
    return (
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface/95 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),10px)] shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur">
        {isPlacementTool(activeTool) && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2">
            <p className="min-w-0 text-xs font-semibold text-accent">
              Tap the PDF to place {tools.find((tool) => tool.type === activeTool)?.shortLabel.toLowerCase() ?? "field"}
            </p>
            <button
              onClick={() => onToolSelect("select")}
              className="flex min-h-11 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-text-muted hover:bg-surface hover:text-text"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Full-width scrollable tool row. Download lives on its own row
            below so it can never crowd or overlap the tools. */}
        <div className="flex w-full gap-2 overflow-x-auto pb-1">
          {tools.map(({ type, icon: Icon, shortLabel, title }) => (
            <button
              key={type}
              onClick={() => onToolSelect(type)}
              title={title}
              className={`flex h-12 min-w-[58px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-semibold transition-colors ${
                activeTool === type
                  ? "border-accent bg-accent text-white shadow-sm"
                  : "border-border bg-surface-alt text-text-muted hover:border-accent hover:text-accent"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="whitespace-nowrap">{shortLabel}</span>
            </button>
          ))}
        </div>

        <div className={`mt-2 grid ${utilityGridColumns} gap-2`}>
          <IconButton onClick={onUndo} disabled={!canUndo} title="Undo" icon={Undo2} />
          <IconButton onClick={onRedo} disabled={!canRedo} title="Redo" icon={Redo2} />
          {onAddPage && (
            <IconButton
              onClick={onAddPage}
              title="Add a page from a PDF, JPG, or PNG"
              icon={FilePlus2}
              disabled={isAddingPage}
            />
          )}
          {onRemovePage && (
            <IconButton
              onClick={onRemovePage}
              title="Remove the current page"
              icon={FileMinus2}
              disabled={!canRemovePage}
              danger
            />
          )}
          <IconButton
            onClick={onSnapToggle}
            title={snapEnabled ? "Snap is on" : "Snap is off"}
            icon={Magnet}
            active={snapEnabled}
          />
          {onSaveProgress ? (
            <IconButton
              onClick={onSaveProgress}
              title="Save progress to your account. Local browser autosave is automatic."
              icon={Save}
              disabled={isSavingProgress}
            />
          ) : (
            <IconButton onClick={onClear} title="Clear fields" icon={Trash2} disabled={fieldCount === 0} danger />
          )}
          {onShowHelp && onStartOver ? (
            <MobileActionsMenu onShowHelp={onShowHelp} onStartOver={onStartOver} />
          ) : onShowHelp ? (
            <IconButton onClick={onShowHelp} title="Help" icon={HelpCircle} />
          ) : onStartOver ? (
            <IconButton onClick={onStartOver} title="Start over" icon={RotateCcw} />
          ) : (
            <IconButton onClick={onClear} title="Clear fields" icon={Trash2} disabled={fieldCount === 0} danger />
          )}
        </div>

        <button
          onClick={onDownload}
          disabled={isDownloading}
          title="Download PDF"
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 text-sm font-bold text-white shadow-sm hover:bg-accent-hover disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {isDownloading ? "Saving" : "Download PDF"}
        </button>

        {isPro === true && (
          <div className="pointer-events-none absolute right-3 top-[-10px] rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            Pro
          </div>
        )}
      </div>
    );
  }

  const showMinimap = !!(minimapCanvas && viewerRef && zoom !== undefined);

  return (
    <div className="flex h-full w-16 flex-col border-r border-border bg-surface sm:w-64">
      <div className="flex min-h-0 flex-shrink flex-col gap-px overflow-y-auto px-2 pb-2 pt-3">
        <p className="hidden px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted sm:block">
          Place Fields
        </p>
        {tools.map(({ type, icon: Icon, label, title }) => (
          <button
            key={type}
            onClick={() => onToolSelect(type)}
            title={title}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-semibold shadow-sm transition-colors xl:min-h-8 ${
              activeTool === type
                ? "border border-accent bg-accent text-white"
                : "border border-border bg-surface-alt text-text-muted hover:border-accent hover:text-accent"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}

        <div className="mx-1 my-1 h-px bg-border" />

        <p className="hidden px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted sm:block">
          Actions
        </p>
        <DesktopActionButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" icon={Undo2} label="Undo" shortcut="Ctrl+Z" />
        <DesktopActionButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" icon={Redo2} label="Redo" shortcut="Ctrl+Shift+Z" />
        <button
          onClick={onSnapToggle}
          title="Toggle snap detection for structured forms"
          className={`flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-semibold transition-colors xl:min-h-8 ${
            snapEnabled
              ? "border border-accent bg-accent text-white shadow-sm"
              : "border border-border bg-surface-alt text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          <Magnet className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{snapEnabled ? "Snap On" : "Snap Off"}</span>
        </button>
        <button
          onClick={onClear}
          title="Clear Fields"
          className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-red-50 hover:text-red-600 xl:min-h-8"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Clear Fields</span>
        </button>

        {fieldCount > 0 && (
          <p className="hidden px-2 py-1 text-[10px] text-text-muted sm:block">
            {fieldCount} field{fieldCount !== 1 ? "s" : ""} placed
          </p>
        )}

        <div className="mx-1 my-1 h-px bg-border" />

        {onAddPage && (
          <button
            onClick={onAddPage}
            disabled={isAddingPage}
            title="Add a page from a PDF, JPG, or PNG"
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60 xl:min-h-8"
          >
            <FilePlus2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{isAddingPage ? "Adding Page" : "Add Page"}</span>
          </button>
        )}

        {onRemovePage && (
          <button
            onClick={onRemovePage}
            disabled={!canRemovePage}
            title={canRemovePage ? "Remove the current page" : "You can't remove the only page"}
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted xl:min-h-8"
          >
            <FileMinus2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Remove Page</span>
          </button>
        )}

        {onSaveProgress && (
          <button
            onClick={onSaveProgress}
            disabled={isSavingProgress}
            title="Save progress to your account. Local browser autosave is automatic."
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text xl:min-h-8"
          >
            <Save className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{isSavingProgress ? "Saving Progress" : "Save Progress"}</span>
          </button>
        )}

        {onStartOver && (
          <button
            onClick={onStartOver}
            title="Clear all fields and start fresh"
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-red-50 hover:text-red-600 xl:min-h-8"
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Start Over</span>
          </button>
        )}

        <button
          onClick={onDownload}
          disabled={isDownloading}
          title="Download filled PDF"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60 xl:min-h-9"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{isDownloading ? "Saving..." : "Download PDF"}</span>
        </button>
      </div>

      {isPro === true ? (
        <div className="border-t border-border px-2 py-2">
          <span className="hidden rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent sm:inline-block">
            PRO
          </span>
        </div>
      ) : (
        <div className="hidden border-t border-border px-2 py-2 sm:block" aria-hidden="true" />
      )}

      {onShowHelp && (
        <div className="mt-auto border-t border-border p-2">
          <button
            onClick={onShowHelp}
            title="Show tutorial"
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-alt hover:text-text xl:h-8 xl:w-8"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {showMinimap && (
        <div className="hidden min-h-0 flex-col border-t border-border px-2 pb-2 sm:flex" style={{ height: "240px", flexShrink: 0 }}>
          <div className="flex flex-shrink-0 items-center gap-1.5 px-1 py-2">
            <Map className="h-3 w-3 text-text-muted" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Overview</p>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface-alt">
            <Minimap
              sourceCanvas={minimapCanvas!}
              viewerRef={viewerRef!}
              pageWidth={800}
              pageHeight={1100}
              zoom={zoom!}
              onRequestRefresh={onMinimapRefresh}
              inline
            />
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  icon: Icon,
  title,
  onClick,
  disabled,
  active,
  danger,
}: {
  icon: typeof Type;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex min-h-11 items-center justify-center rounded-xl border text-text-muted transition-colors disabled:opacity-30 ${
        active
          ? "border-accent bg-accent text-white"
          : danger
            ? "border-border bg-surface-alt hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            : "border-border bg-surface-alt hover:border-accent hover:text-accent"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function MobileActionsMenu({
  onShowHelp,
  onStartOver,
}: {
  onShowHelp: () => void;
  onStartOver: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    firstActionRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node | null)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const runAction = (action: () => void) => {
    setOpen(false);
    triggerRef.current?.focus();
    action();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        title="More actions"
        aria-label="More actions"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface-alt text-text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Actions"
          className="absolute bottom-full right-0 z-50 mb-2 w-40 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl"
        >
          <button
            ref={firstActionRef}
            type="button"
            onClick={() => runAction(onShowHelp)}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text focus:bg-surface-alt focus:text-text"
          >
            <HelpCircle className="h-4 w-4" />
            Help
          </button>
          <button
            type="button"
            onClick={() => runAction(onStartOver)}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-text-muted transition-colors hover:bg-red-50 hover:text-red-600 focus:bg-red-50 focus:text-red-600"
          >
            <RotateCcw className="h-4 w-4" />
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}

function DesktopActionButton({
  icon: Icon,
  label,
  title,
  shortcut,
  onClick,
  disabled,
}: {
  icon: typeof Type;
  label: string;
  title: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-30 xl:min-h-8"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden flex-1 items-center justify-between sm:flex">
        {label}
        <kbd className="rounded bg-surface-alt px-1 py-0.5 font-mono text-[10px] text-text-muted/60">{shortcut}</kbd>
      </span>
    </button>
  );
}
