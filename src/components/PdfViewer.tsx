"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Stage, Layer, Rect, Text, Group, Transformer, Image as KonvaImage, Line } from "react-konva";
import type Konva from "konva";
import type { EditorField, PlacementToolType, SignatureField, CheckboxStamp, WhiteoutField, CombField, ToolDefaultState, LineField, LineOrientation } from "@/lib/types";
import { todayDateStamp, DATE_STAMP_PLACEHOLDER } from "@/lib/date-stamp";
import { clampSignatureOpacity, clampSignatureRotation } from "@/lib/signature-transform";
import { detectSnapBox, detectAllBoxes, snapCredibilityScore, floodFillCell, detectCombCells, detectCombCellsV2 } from "@/lib/snap-detect";
import type { SnapResult, CombDetectResult } from "@/lib/snap-detect";
import { backspaceCombCharacter, getCombCursorIndex, insertCombCharacter, moveCombCursor } from "@/lib/comb-input";
import { createEditorFieldId } from "@/lib/field-ids";
import { loadPdfjsClient } from "@/lib/pdfjs-client";
import { MASK_ERASE_FILL, addEraserMask, brushIntersectField, interpolateMaskPath, isMaskErasable, maskCacheConfig } from "@/lib/eraser-mask";
import {
  GESTURE_PLACEMENT_SUPPRESS_MS,
  anchoredScrollPosition,
  clampPdfRenderScale,
  clampGestureZoom,
  gestureZoomMax,
  gestureZoom,
  shouldSuppressTouchPlacement,
  touchDistance,
  touchMidpoint,
  type GesturePoint,
} from "@/lib/pinch-zoom";
import {
  LOCAL_FIELD_SUGGESTION_MAX_BOXES,
  prepareLocalFieldDetectionSnapshot,
  type LocalFieldDetectionLifecycleEvent,
  type LocalFieldDetectionSnapshotKey,
} from "@/lib/local-field-suggestion-provider";
import {
  fitMultilineOverlayText,
  fitOverlayFontSize,
  fitOverlayTextPadding,
  sanitizeMultiline,
  STANDARD_OVERLAY_TEXT_HEIGHT_RATIO,
  standardOverlayTextHeightAtSize,
  type OverlayTextFontMetrics,
} from "@/lib/pdf-utils";
import { MediaOverlayLayer } from "@/components/MediaOverlayLayer";

type PdfActiveTool = PlacementToolType | "mask-eraser";
type DrawnFieldTool = Exclude<PlacementToolType, "box">;

let nextFieldSuggestionViewerInstanceId = 0;
const COMB_HIDDEN_INPUT_SENTINEL = "\u200b";

export interface PdfViewerHandle {
  getCanvasDataURL: () => string | null;
  getCanvasDimensions: () => { width: number; height: number };
  getCanvas: () => HTMLCanvasElement | null;
  getViewportDims: () => {
    width: number;
    height: number;
    pageIndex?: number;
  } | null;
  editField: (fieldId: string) => void;
  getCompositePreviewURL: () => Promise<string | null>;
  /** Recompute the fit-to-width scale from the current viewport size. */
  refit: () => void;
}

interface PdfViewerProps {
  pdfBytes: ArrayBuffer;
  currentPage: number;
  fields: EditorField[];
  activeTool: PdfActiveTool | null;
  selectedFieldId: string | null;
  onFieldAdd: (field: EditorField) => EditorField;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
  onFieldsSet: (fields: EditorField[]) => void;
  onFieldSelect: (id: string | null) => void;
  onFieldDelete: (id: string) => void;
  onFieldDuplicate?: (id: string) => void;
  onToolSelect: (tool: PdfActiveTool | null) => void;
  onPageScaleSet: (page: number, scale: number) => void;
  totalPages: number;
  onTotalPagesChange: (total: number) => void;
  zoom: number;
  highlightFieldIds?: Set<string>;
  onSignatureFieldPlaced?: (field: EditorField) => void;
  onSignatureRequest?: (fieldId: string) => void;
  onPageChange?: (page: number) => void;
  snapEnabled: boolean;
  keepRatio?: boolean;
  whiteoutColor?: string | null;
  onWhiteoutColorChange?: (color: string | null) => void;
  toolDefaults: ToolDefaultState;
  /** Reports the id of the field being inline text-edited (null when idle). */
  onEditingChange?: (fieldId: string | null) => void;
  /** Live readout while a pinch gesture is in progress; null when it ends. */
  onGestureZoomPreview?: (zoom: number | null) => void;
  /** Commits the final pinch zoom (clamped to the active rollout limit). */
  onGestureZoomCommit?: (zoom: number) => void;
  /** Optional QA-only publication of the existing full-page snap scan. */
  fieldSuggestionDocumentRevision?: number;
  onFieldSuggestionSnapshotEvent?: (event: LocalFieldDetectionLifecycleEvent) => void;
}

interface SnapPreview {
  x: number;
  y: number;
  width: number;
  height: number;
}

function scaleSnapResult(
  result: SnapResult | null,
  scale: number,
): SnapResult | null {
  if (!result || scale === 1) return result;
  return {
    x: result.x * scale,
    y: result.y * scale,
    width: result.width * scale,
    height: result.height * scale,
  };
}

function findPrecomputedSnap(
  boxes: readonly SnapResult[],
  displayX: number,
  displayY: number,
  renderRatio: number,
): SnapResult | null {
  if (boxes.length === 0) return null;
  const canvasX = displayX * renderRatio;
  const canvasY = displayY * renderRatio;
  const tolerance = 3 * renderRatio;
  const containing: SnapResult[] = [];
  for (const box of boxes) {
    if (
      canvasX >= box.x - tolerance &&
      canvasX <= box.x + box.width + tolerance &&
      canvasY >= box.y - tolerance &&
      canvasY <= box.y + box.height + tolerance
    ) {
      containing.push(box);
    }
  }
  if (containing.length === 0) return null;
  containing.sort(
    (left, right) =>
      snapCredibilityScore(left) - snapCredibilityScore(right),
  );
  const best = containing[0];
  if (best.width / Math.max(best.height, 1) > 10) return null;
  return scaleSnapResult(best, 1 / renderRatio);
}

function createLineField(
  base: Pick<EditorField, "id" | "x" | "y" | "page" | "snapped" | "snapBounds">,
  lineDefaults: ToolDefaultState["line"],
  viewportAtScale1: { width: number; height: number } | null,
  fieldW: number,
  fieldH: number
): LineField {
  const orientation = lineDefaults.orientation ?? "horizontal";
  const strokeWidth = lineDefaults.strokeWidth ?? 1;
  const isHorizontal = orientation !== "vertical";
  const pageW = viewportAtScale1?.width ?? fieldW;
  const pageH = viewportAtScale1?.height ?? Math.max(fieldH, 792);

  // For horizontal: spans full width at click y
  // For vertical: spans full height at click x
  return {
    ...base,
    type: "line",
    orientation,
    color: lineDefaults.color ?? "#000000",
    strokeWidth,
    width: isHorizontal ? pageW : strokeWidth,
    height: isHorizontal ? strokeWidth : pageH,
    x: isHorizontal ? 0 : base.x,
    y: isHorizontal ? base.y : 0,
  };
}

function isMobileEditorViewport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth < 768 ||
    window.matchMedia?.("(pointer: coarse)").matches === true ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
  );
}

function isPlacementTool(tool: PdfActiveTool | null): tool is PlacementToolType {
  return Boolean(tool && tool !== "mask-eraser");
}

/** Infer a sensible font size from field height */
function inferFontSize(boxHeight: number): number {
  // Use ~65% of box height for tighter fill, clamped to 8-36px
  const raw = Math.round(boxHeight * 0.65);
  return Math.max(8, Math.min(36, raw));
}

let editorOverlayMeasureContext: CanvasRenderingContext2D | null = null;

const editorOverlayFontMetrics: OverlayTextFontMetrics = {
  widthOfTextAtSize(text, fontSize) {
    if (
      !editorOverlayMeasureContext &&
      typeof document !== "undefined"
    ) {
      editorOverlayMeasureContext = document
        .createElement("canvas")
        .getContext("2d");
    }
    if (
      editorOverlayMeasureContext &&
      typeof editorOverlayMeasureContext.measureText === "function"
    ) {
      editorOverlayMeasureContext.font = `${fontSize}px Arial, sans-serif`;
      return editorOverlayMeasureContext.measureText(text).width;
    }
    return Array.from(text).length * fontSize * 0.5;
  },
  heightAtSize: standardOverlayTextHeightAtSize,
};

/** Sample background color from canvas, with fallback to white for dark/transparent pixels */
function sampleBackgroundColor(
  ctx: CanvasRenderingContext2D,
  canvasX: number,
  canvasY: number,
  canvasWidth: number,
  canvasHeight: number
): string {
  // Bounds check
  if (canvasX < 0 || canvasY < 0 || canvasX >= canvasWidth || canvasY >= canvasHeight) {
    return "#ffffff";
  }

  try {
    const pixel = ctx.getImageData(canvasX, canvasY, 1, 1).data;
    const [r, g, b, a] = pixel;

    // If transparent (alpha < 10), default to white
    if (a < 10) {
      return "#ffffff";
    }

    // Calculate brightness (simple luminance formula)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    // If too dark (brightness < 30), default to white since most form backgrounds are white
    if (brightness < 30) {
      return "#ffffff";
    }

    return `#${[r, g, b].map(c => c.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return "#ffffff";
  }
}

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer({
  pdfBytes,
  currentPage,
  fields,
  activeTool,
  selectedFieldId,
  onFieldAdd,
  onFieldUpdate,
  onFieldsSet,
  onFieldSelect,
  onFieldDelete,
  onFieldDuplicate,
  onToolSelect,
  onPageScaleSet,
  totalPages: _totalPages,
  onTotalPagesChange,
  zoom,
  highlightFieldIds,
  onSignatureFieldPlaced,
  onSignatureRequest,
  onPageChange,
  snapEnabled,
  keepRatio,
  whiteoutColor: whiteoutColorProp,
  onWhiteoutColorChange,
  toolDefaults,
  onEditingChange,
  onGestureZoomPreview,
  onGestureZoomCommit,
  fieldSuggestionDocumentRevision,
  onFieldSuggestionSnapshotEvent,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRenderRatioRef = useRef(1);
  const stageRef = useRef<Konva.Stage | null>(null);
  const combHiddenInputRef = useRef<HTMLInputElement>(null);
  const combMobileEnabled =
    process.env.NEXT_PUBLIC_QUICKFILL_COMB_MOBILE === "v1";
  const resetCombHiddenInput = useCallback(
    (input = combHiddenInputRef.current) => {
      if (!input) return;
      input.value = COMB_HIDDEN_INPUT_SENTINEL;
      input.setSelectionRange(
        COMB_HIDDEN_INPUT_SENTINEL.length,
        COMB_HIDDEN_INPUT_SENTINEL.length,
      );
    },
    [],
  );
  const focusCombHiddenInput = useCallback(() => {
    if (!combMobileEnabled) return;
    const input = combHiddenInputRef.current;
    if (!input) return;
    resetCombHiddenInput(input);
    input.focus({ preventScroll: true });
    resetCombHiddenInput(input);
  }, [combMobileEnabled, resetCombHiddenInput]);
  const [dimensions, setDimensions] = useState({ width: 800, height: 1100 });
  // fitScale: ratio from PDF points to base canvas pixels (before zoom)
  // Field coordinates are stored in PDF point space for consistency across resizes
  const [fitScale, setFitScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Store viewport dimensions at scale 1 for coordinate transformation
  const [viewportAtScale1, setViewportAtScale1] = useState<{
    width: number;
    height: number;
    pageIndex: number;
  } | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  // While capturing the download-gate preview, editor chrome (selection
  // outlines, transformer handles, mobile field borders) is suppressed so the
  // preview shows the finished document. Selection state itself is untouched.
  const [isCapturingPreview, setIsCapturingPreview] = useState(false);
  // Bumped by refit() and by the viewport ResizeObserver to force the render
  // effect to re-measure the container and recompute the fit scale.
  const [fitRequestId, setFitRequestId] = useState(0);
  const lastFitWidthRef = useRef<number | null>(null);
  const [snappedFieldId, setSnappedFieldId] = useState<string | null>(null);
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapPreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cursorStyle, setCursorStyle] = useState("default");
  const [snapPreviewOpacity, setSnapPreviewOpacity] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, fieldId: string } | null>(null);
  // Ref to the page wrapper (the context menu's positioning parent)
  const pageWrapRef = useRef<HTMLDivElement>(null);

  // Open the field context menu from DOM client coordinates.
  // Clamps to the visible viewport so the menu never renders off-screen
  // (e.g. when the editor is scrolled or the click is near a screen edge),
  // then converts to coordinates local to the page wrapper.
  const openFieldContextMenu = useCallback((clientX: number, clientY: number, fieldId: string) => {
    const wrap = pageWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const MENU_W = 150;
    const MENU_H = 120;
    const PAD = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = Math.max(PAD, Math.min(clientX, vw - MENU_W - PAD));
    const cy = Math.max(PAD, Math.min(clientY, vh - MENU_H - PAD));
    setContextMenu({ x: cx - rect.left, y: cy - rect.top, fieldId });
  }, []);
  // Line tool preview state
  const [linePreview, setLinePreview] = useState<{ x: number; y: number; orientation: LineOrientation } | null>(null);
  const [checkboxPreview, setCheckboxPreview] = useState<{ x: number; y: number } | null>(null);
  const [isMobileEditor, setIsMobileEditor] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [whiteoutColorInternal, setWhiteoutColorInternal] = useState<string | null>(null);
  const [maskCursor, setMaskCursor] = useState<{ x: number; y: number } | null>(null);
  const [maskPreviewFields, setMaskPreviewFields] = useState<EditorField[] | null>(null);
  // Use controlled whiteout color if provided, otherwise use internal state
  const whiteoutColor = whiteoutColorProp !== undefined ? whiteoutColorProp : whiteoutColorInternal;
  const setWhiteoutColor = (color: string | null) => {
    if (onWhiteoutColorChange) {
      onWhiteoutColorChange(color);
    } else {
      setWhiteoutColorInternal(color);
    }
  };
  const precomputedBoxesRef = useRef<SnapResult[]>([]);
  const fieldSuggestionViewerInstanceIdRef = useRef<number | null>(null);
  const fieldSuggestionRenderGenerationRef = useRef(0);
  const activeFieldSuggestionSnapshotRef = useRef<{
    key: Readonly<LocalFieldDetectionSnapshotKey>;
    scanDurationMs: number | null;
  } | null>(null);
  const emitFieldSuggestionSnapshotEvent = useCallback((event: LocalFieldDetectionLifecycleEvent) => {
    try {
      onFieldSuggestionSnapshotEvent?.(event);
    } catch {
      // Snapshot publication is optional and must never disturb PDF rendering.
    }
  }, [onFieldSuggestionSnapshotEvent]);
  const cancelFieldSuggestionSnapshot = useCallback((
    expectedKey?: Readonly<LocalFieldDetectionSnapshotKey> | null,
  ) => {
    const active = activeFieldSuggestionSnapshotRef.current;
    if (!active || (expectedKey && active.key !== expectedKey)) return;
    activeFieldSuggestionSnapshotRef.current = null;
    emitFieldSuggestionSnapshotEvent({
      status: "cancelled",
      key: active.key,
      scanDurationMs: active.scanDurationMs,
    });
  }, [emitFieldSuggestionSnapshotEvent]);
  const dragStartedRef = useRef(false);
  const mouseDownPos = useRef<{x: number, y: number} | null>(null);
  const isDragMove = useRef(false);
  const isMaskDragging = useRef(false);
  const preDragFieldsRef = useRef<EditorField[] | null>(null);
  const draftFieldsRef = useRef<EditorField[] | null>(null);
  const maskAddedRef = useRef(false);
  const lastMaskPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchEndAtRef = useRef(0);
  // --- Two-finger gesture state (pinch zoom + pan). Refs so native touch
  // listeners always see current values without re-attaching mid-gesture. ---
  const [isGesturing, setIsGesturing] = useState(false);
  const gestureRef = useRef<{
    startZoom: number;
    currentZoom: number;
    startDist: number;
    lastMid: GesturePoint;
    midX: number;
    midY: number;
  } | null>(null);
  const lastGestureEndAtRef = useRef(0);
  // Identifier of the finger left on screen when a gesture ends, so its
  // eventual touchend never places a field.
  const gestureTailTouchIdRef = useRef<number | null>(null);
  const gesturePreviewAtRef = useRef(0);
  const zoomPropRef = useRef(zoom);
  const cancelGestureRef = useRef<() => void>(() => {});
  // Scroll-restore intents consumed after the next successful render.
  const pendingRecenterRef = useRef(false);
  const coldLoadRecenterRef = useRef(false);
  const pendingScrollAnchorRef = useRef<{
    pageLocalX: number;
    pageLocalY: number;
    midX: number;
    midY: number;
    ratio: number;
  } | null>(null);
  const snapPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const nodeMapRef = useRef<Map<string, Konva.Group>>(new Map());
  
  // Drag-to-draw refs for Feature 1
  const dragStart = useRef<{x: number, y: number} | null>(null);
  const dragCurrent = useRef<{x: number, y: number} | null>(null);
  const isDragDrawing = useRef(false);
  const [drawRect, setDrawRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const pendingBoxCornerRef = useRef<{ x: number; y: number } | null>(
    null,
  );
  const pendingBoxCornerToolRef = useRef<PlacementToolType | null>(null);
  const [pendingBoxCorner, setPendingBoxCorner] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const cancelPendingBoxCorner = useCallback(() => {
    pendingBoxCornerRef.current = null;
    pendingBoxCornerToolRef.current = null;
    setPendingBoxCorner(null);
  }, []);
  const plantPendingBoxCorner = useCallback(
    (corner: { x: number; y: number }, tool: PlacementToolType) => {
      pendingBoxCornerRef.current = corner;
      pendingBoxCornerToolRef.current = tool;
      setPendingBoxCorner(corner);
    },
    [],
  );

  // Reset line preview when tool changes
  useEffect(() => {
    if (activeTool !== "line") {
      setLinePreview(null);
    }
    if (activeTool !== "checkbox") {
      setCheckboxPreview(null);
    }
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== "mask-eraser") return;

    onFieldSelect(null);
    setEditingFieldId(null);
    setHoveredFieldId(null);
    setContextMenu(null);
    trRef.current?.nodes([]);
    trRef.current?.getLayer()?.batchDraw();
  }, [activeTool, onFieldSelect]);

  useImperativeHandle(ref, () => ({
    getCanvasDataURL: () => canvasRef.current?.toDataURL("image/png") ?? null,
    getCanvasDimensions: () => dimensions,
    getCanvas: () => canvasRef.current,
    getViewportDims: () => viewportAtScale1,
    editField: (fieldId: string) => {
      const field = fields.find((candidate) => candidate.id === fieldId);
      if (!field) return;
      if (field.type === "comb") {
        if (!combMobileEnabled) return;
        onToolSelect(null);
        onFieldSelect(fieldId);
        focusCombHiddenInput();
        return;
      }
      if (field.type === "checkbox" || field.type === "signature" || field.type === "whiteout" || field.type === "line") {
        return;
      }
      onToolSelect(null);
      onFieldSelect(fieldId);
      setEditingFieldId(fieldId);
    },
    getCompositePreviewURL: async (): Promise<string | null> => {
      const pdfCanvas = canvasRef.current;
      const stage = stageRef.current;
      if (!pdfCanvas) return null;

      const width = pdfCanvas.width;
      const height = pdfCanvas.height;
      if (width === 0 || height === 0) return null;

      const offscreen = document.createElement("canvas");
      offscreen.width = width;
      offscreen.height = height;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(pdfCanvas, 0, 0);

      if (stage) {
        // Temporarily hide selection outlines and transformer handles so the
        // captured preview shows a finished document, not editor chrome. The
        // user's selection state is restored immediately after capture.
        setIsCapturingPreview(true);
        try {
          // Let React commit the suppressed props and Konva redraw the layer.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          await new Promise<void>((resolve) => {
            if (typeof requestAnimationFrame === "function") {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            } else {
              setTimeout(resolve, 50);
            }
          });
          const stageDataUrl = stage.toDataURL({ pixelRatio: 1 });
          if (stageDataUrl) {
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                if (canvasRenderRatioRef.current < 1) {
                  ctx.drawImage(img, 0, 0, width, height);
                } else {
                  ctx.drawImage(img, 0, 0);
                }
                resolve();
              };
              img.onerror = () => resolve();
              img.src = stageDataUrl;
            });
          }
        } finally {
          setIsCapturingPreview(false);
        }
      }

      return offscreen.toDataURL("image/png");
    },
    refit: () => {
      // Fit must fully reset the viewport: recompute scale, drop any stale
      // scroll/pan, and abandon in-flight gesture state.
      cancelFieldSuggestionSnapshot();
      cancelGestureRef.current();
      pendingScrollAnchorRef.current = null;
      pendingRecenterRef.current = true;
      setFitRequestId((id) => id + 1);
    },
  }));

  useEffect(() => {
    const updateMobileEditor = () => {
      setIsMobileEditor(isMobileEditorViewport());
      setIsCoarsePointer(
        window.matchMedia?.("(pointer: coarse)").matches === true,
      );
    };
    updateMobileEditor();

    const coarsePointer = window.matchMedia?.("(pointer: coarse)");
    window.addEventListener("resize", updateMobileEditor);
    coarsePointer?.addEventListener?.("change", updateMobileEditor);

    return () => {
      window.removeEventListener("resize", updateMobileEditor);
      coarsePointer?.removeEventListener?.("change", updateMobileEditor);
    };
  }, []);

  const zoomFactor = zoom / 100;
  const mobilePolishFlag =
    process.env.NEXT_PUBLIC_QUICKFILL_MOBILE_POLISH;
  const mobilePolishEnabled = mobilePolishFlag === "v1";
  const fieldFitEnabled =
    process.env.NEXT_PUBLIC_QUICKFILL_FIELD_FIT === "v1";
  const formFidelityEnabled =
    process.env.NEXT_PUBLIC_QUICKFILL_FORM_FIDELITY === "v1";
  const twoTapBoxPlacementEnabled =
    formFidelityEnabled && isCoarsePointer && activeTool === "box";
  const twoTapDrawToolsEnabled =
    process.env.NEXT_PUBLIC_QUICKFILL_TWO_TAP_TOOLS === "v1" &&
    isCoarsePointer &&
    (activeTool === "text" ||
      activeTool === "date" ||
      activeTool === "signature" ||
      activeTool === "whiteout");
  const twoTapPlacementEnabled =
    twoTapBoxPlacementEnabled || twoTapDrawToolsEnabled;
  const pendingCornerHint =
    activeTool === "text"
      ? "Tap the opposite corner to place the text field"
      : activeTool === "date"
        ? "Tap the opposite corner to place the date field"
        : activeTool === "signature"
          ? "Tap the opposite corner to place the signature field"
          : activeTool === "whiteout"
            ? "Tap the opposite corner to place the whiteout"
            : "Now tap the opposite corner";
  const gestureZoomLimit = gestureZoomMax(mobilePolishFlag);
  const createFieldId = useCallback(
    (prefix = "field") => createEditorFieldId(fields, prefix),
    [fields],
  );
  const maskEraserSize = toolDefaults["mask-eraser"].size ?? 48;
  const renderFields = maskPreviewFields ?? fields;
  const pageFields = renderFields.filter((f) => f.page === currentPage);
  const applyCombHiddenInputAction = useCallback(
    (
      action: "insert" | "backspace" | "left" | "right",
      insertedText = "",
    ) => {
      if (!combMobileEnabled || !selectedFieldId) return;
      const selectedComb = fields.find(
        (field) =>
          field.id === selectedFieldId &&
          field.page === currentPage &&
          field.type === "comb",
      ) as CombField | undefined;
      if (!selectedComb) return;

      const charCount = selectedComb.charCount ?? 9;
      const currentValue = selectedComb.value || "";
      const currentIndex = getCombCursorIndex(
        currentValue,
        charCount,
        selectedComb.cursorIndex,
      );

      if (action === "insert") {
        let nextValue = currentValue;
        let nextIndex = currentIndex;
        for (const character of Array.from(insertedText)) {
          const update = insertCombCharacter(
            nextValue,
            charCount,
            nextIndex,
            character,
          );
          nextValue = update.value;
          nextIndex = update.cursorIndex;
        }
        if (insertedText) {
          onFieldUpdate(
            selectedComb.id,
            { value: nextValue, cursorIndex: nextIndex } as Partial<EditorField>,
          );
        }
        return;
      }

      if (action === "backspace") {
        onFieldUpdate(
          selectedComb.id,
          backspaceCombCharacter(
            currentValue,
            charCount,
            currentIndex,
          ) as Partial<EditorField>,
        );
        return;
      }

      onFieldUpdate(
        selectedComb.id,
        {
          cursorIndex: moveCombCursor(
            currentValue,
            charCount,
            currentIndex,
            action,
          ),
        } as Partial<EditorField>,
      );
    },
    [
      combMobileEnabled,
      currentPage,
      fields,
      onFieldUpdate,
      selectedFieldId,
    ],
  );
  useEffect(() => {
    if (!combMobileEnabled || !selectedFieldId) return;
    const input = combHiddenInputRef.current;
    if (!input) return;

    const handleBeforeInput = (event: InputEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.inputType === "insertText" && event.data) {
        applyCombHiddenInputAction("insert", event.data);
      } else if (event.inputType === "deleteContentBackward") {
        applyCombHiddenInputAction("backspace");
      }
      resetCombHiddenInput(input);
    };

    input.addEventListener("beforeinput", handleBeforeInput);
    return () => {
      input.removeEventListener("beforeinput", handleBeforeInput);
    };
  }, [
    applyCombHiddenInputAction,
    combMobileEnabled,
    resetCombHiddenInput,
    selectedFieldId,
  ]);

  useEffect(() => {
    if (
      !twoTapPlacementEnabled ||
      (pendingBoxCornerRef.current &&
        pendingBoxCornerToolRef.current !== activeTool)
    ) {
      cancelPendingBoxCorner();
    }
  }, [activeTool, cancelPendingBoxCorner, twoTapPlacementEnabled]);
  const stagePointToPagePoint = useCallback(
    (pos: { x: number; y: number }) => {
      const effectiveScale = fitScale * zoomFactor;
      return { x: pos.x / effectiveScale, y: pos.y / effectiveScale };
    },
    [fitScale, zoomFactor],
  );

  const applyMaskAtStagePoint = useCallback(
    (pos: { x: number; y: number }) => {
      const draft = draftFieldsRef.current;
      if (!draft) return;

      const brushCenter = stagePointToPagePoint(pos);
      const brushHalfSize = maskEraserSize / 2 / (fitScale * zoomFactor);
      let changed = false;

      const next = draft.map((field) => {
        if (field.page !== currentPage || !isMaskErasable(field)) return field;

        const mask = brushIntersectField(brushCenter.x, brushCenter.y, brushHalfSize, field);
        if (!mask) return field;

        changed = true;
        return addEraserMask(field, mask);
      });

      if (changed) {
        draftFieldsRef.current = next;
        maskAddedRef.current = true;
        setMaskPreviewFields(next);
      }
    },
    [currentPage, fitScale, maskEraserSize, stagePointToPagePoint, zoomFactor],
  );

  const stopMaskDrag = useCallback(() => {
    if (!isMaskDragging.current) return;

    const draft = draftFieldsRef.current;
    if (maskAddedRef.current && draft) {
      onFieldsSet(draft);
    }

    isMaskDragging.current = false;
    preDragFieldsRef.current = null;
    draftFieldsRef.current = null;
    maskAddedRef.current = false;
    lastMaskPointRef.current = null;
    setMaskPreviewFields(null);
  }, [onFieldsSet]);

  const applyMaskAlongStagePath = useCallback(
    (pos: { x: number; y: number }) => {
      const last = lastMaskPointRef.current;
      if (!last) {
        applyMaskAtStagePoint(pos);
        lastMaskPointRef.current = { x: pos.x, y: pos.y };
        return;
      }

      const stepSize = Math.max(1, maskEraserSize * 0.4);

      for (const point of interpolateMaskPath(last, pos, stepSize)) {
        applyMaskAtStagePoint(point);
      }

      lastMaskPointRef.current = { x: pos.x, y: pos.y };
    },
    [applyMaskAtStagePoint, maskEraserSize],
  );

  useEffect(() => {
    const handleStopMaskDrag = () => stopMaskDrag();

    window.addEventListener("mouseup", handleStopMaskDrag);
    window.addEventListener("blur", handleStopMaskDrag);
    return () => {
      window.removeEventListener("mouseup", handleStopMaskDrag);
      window.removeEventListener("blur", handleStopMaskDrag);
    };
  }, [stopMaskDrag]);

  useEffect(() => {
    if (activeTool === "mask-eraser") return;

    stopMaskDrag();
    isMaskDragging.current = false;
    preDragFieldsRef.current = null;
    draftFieldsRef.current = null;
    maskAddedRef.current = false;
    lastMaskPointRef.current = null;
    setMaskPreviewFields(null);
    setMaskCursor(null);
  }, [activeTool, stopMaskDrag]);

  // Clear editing when field is deselected
  useEffect(() => {
    if (!selectedFieldId) setEditingFieldId(null);
  }, [selectedFieldId]);

  // On small screens, keep the inline text editor visible while typing.
  // The on-screen keyboard plus the fixed bottom toolbar can otherwise hide
  // the field being edited. Re-centres on visualViewport resize (keyboard
  // open/close) while an edit is active.
  // Report inline text-edit state so the editor page can free up screen
  // space (hide mobile toolbar/sheet) while the user is typing.
  useEffect(() => {
    onEditingChange?.(editingFieldId);
  }, [editingFieldId, onEditingChange]);

  useEffect(() => {
    if (!editingFieldId) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;

    const scrollEditorIntoView = (behavior: ScrollBehavior) => {
      document
        .querySelector<HTMLElement>('[data-testid="pdf-field-editor"]')
        ?.scrollIntoView({ block: "center", inline: "nearest", behavior });
    };

    // Delay lets the keyboard animation start before we position the field.
    const timer = window.setTimeout(() => scrollEditorIntoView("smooth"), 300);
    const viewport = window.visualViewport;
    const onViewportResize = () => scrollEditorIntoView("auto");
    viewport?.addEventListener("resize", onViewportResize);
    return () => {
      window.clearTimeout(timer);
      viewport?.removeEventListener("resize", onViewportResize);
    };
  }, [editingFieldId]);

  // Reset cursor when tool is deactivated
  useEffect(() => {
    if (!activeTool) {
      setCursorStyle("default");
    }
  }, [activeTool]);

  // Reset drag drawing state when tool changes or is reselected
  useEffect(() => {
    isDragDrawing.current = false;
    dragStart.current = null;
    dragCurrent.current = null;
    setDrawRect(null);
  }, [activeTool]);

  // Defensive guard: notify parent to clamp currentPage when totalPages changes
  useEffect(() => {
    if (_totalPages > 0 && currentPage >= _totalPages) {
      const clampedPage = _totalPages - 1;
      console.warn(`PdfViewer: currentPage ${currentPage} exceeds totalPages ${_totalPages}, clamping to ${clampedPage}`);
      onPageChange?.(clampedPage);
    }
  }, [_totalPages, currentPage, onPageChange]);

  // Render PDF page
  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<unknown>; cancel?: () => void } | null = null;
    let renderSnapshotKey: Readonly<LocalFieldDetectionSnapshotKey> | null = null;

    const isCurrentRender = () => (
      !cancelled &&
      (!renderSnapshotKey || activeFieldSuggestionSnapshotRef.current?.key === renderSnapshotKey)
    );

    const failSnapshot = (
      reason: Extract<LocalFieldDetectionLifecycleEvent, { status: "failed" }>["reason"],
      scanDurationMs: number | null = null,
    ) => {
      if (!renderSnapshotKey || activeFieldSuggestionSnapshotRef.current?.key !== renderSnapshotKey) return;
      activeFieldSuggestionSnapshotRef.current = null;
      emitFieldSuggestionSnapshotEvent({
        status: "failed",
        key: renderSnapshotKey,
        scanDurationMs,
        reason,
      });
    };

    async function renderPage() {
      setLoading(true);
      setError(null);

      try {
        const pdfjsLib = await loadPdfjsClient();

        const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;

        if (cancelled) return;
        const newTotalPages = pdf.numPages;
        onTotalPagesChange(newTotalPages);

        // Defensive guard: clamp currentPage if it exceeds the new total pages
        // This prevents "Failed to render PDF" when loading a smaller PDF after a larger one
        if (currentPage >= newTotalPages) {
          console.warn(`Clamping currentPage from ${currentPage} to ${newTotalPages - 1} (totalPages=${newTotalPages})`);
        }

        const page = await pdf.getPage(Math.min(currentPage + 1, newTotalPages));
        if (cancelled) return;

        // Measure the scroll viewport (parent), not the inner w-max content
        // wrapper: after rendering wider than the viewport, the wrapper's own
        // clientWidth inflates to the content width and would poison refits.
        const scrollViewport = containerRef.current?.parentElement;
        const containerWidth =
          (scrollViewport?.clientWidth || containerRef.current?.clientWidth) ?? 800;
        lastFitWidthRef.current = containerWidth;
        const viewport = page.getViewport({ scale: 1 });
        
        // Store viewport dimensions at scale 1 for coordinate transformation
        setViewportAtScale1({
          width: viewport.width,
          height: viewport.height,
          pageIndex: currentPage,
        });
        
        const newFitScale = Math.min((containerWidth - 32) / viewport.width, 1.5);
        const effectiveScale = newFitScale * zoomFactor;
        const scaledViewport = page.getViewport({ scale: effectiveScale });
        const renderScale = mobilePolishEnabled
          ? clampPdfRenderScale(
              effectiveScale,
              viewport.width,
              viewport.height,
            )
          : effectiveScale;
        const renderViewport = page.getViewport({ scale: renderScale });

        const displayWidth = Math.floor(scaledViewport.width);
        const displayHeight = Math.floor(scaledViewport.height);
        const canvasWidth = Math.floor(renderViewport.width);
        const canvasHeight = Math.floor(renderViewport.height);
        canvasRenderRatioRef.current = renderScale / effectiveScale;

        setFitScale(newFitScale);
        onPageScaleSet(currentPage, newFitScale);
        setDimensions({
          width: displayWidth,
          height: displayHeight,
        });

        if (
          onFieldSuggestionSnapshotEvent &&
          Number.isSafeInteger(fieldSuggestionDocumentRevision) &&
          (fieldSuggestionDocumentRevision ?? 0) > 0
        ) {
          if (fieldSuggestionViewerInstanceIdRef.current === null) {
            nextFieldSuggestionViewerInstanceId += 1;
            fieldSuggestionViewerInstanceIdRef.current = nextFieldSuggestionViewerInstanceId;
          }
          fieldSuggestionRenderGenerationRef.current += 1;
          const transform = scaledViewport.transform;
          const viewportTransform = Object.freeze([
            transform[0],
            transform[1],
            transform[2],
            transform[3],
            transform[4],
            transform[5],
          ]) as Readonly<[number, number, number, number, number, number]>;
          renderSnapshotKey = Object.freeze({
            documentRevision: fieldSuggestionDocumentRevision as number,
            viewerInstanceId: fieldSuggestionViewerInstanceIdRef.current,
            renderGeneration: fieldSuggestionRenderGenerationRef.current,
            pageIndex: currentPage,
            rotation: scaledViewport.rotation,
            viewportTransform,
            canvasWidth: displayWidth,
            canvasHeight: displayHeight,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            renderedViewportWidth: scaledViewport.width,
            renderedViewportHeight: scaledViewport.height,
          });
          activeFieldSuggestionSnapshotRef.current = { key: renderSnapshotKey, scanDurationMs: null };
          emitFieldSuggestionSnapshotEvent({
            status: "started",
            key: renderSnapshotKey,
            scanDurationMs: null,
          });
        }

        const canvas = canvasRef.current;
        if (!canvas || !isCurrentRender()) {
          if (!canvas) {
            failSnapshot("missing-canvas");
            setLoading(false);
          }
          return;
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          failSnapshot("missing-canvas-context");
          setLoading(false);
          return;
        }

        renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
          canvas: canvas,
        } as Parameters<typeof page.render>[0]);
        await renderTask.promise;

        // A replacement, page/rotation/viewport change, zoom/refit, or unmount
        // may have cancelled this render while pdf.js was working.
        if (!isCurrentRender()) return;

        // Revalidate immediately before the one existing full-page scan.
        if (!isCurrentRender()) return;

        // Run batch visual detection after render for pre-computed snap targets.
        // The optional suggestion snapshot is derived only after the existing
        // detector result has been published unchanged to snapping.
        try {
          const scanStartedAt = renderSnapshotKey ? performance.now() : null;
          const boxes = detectAllBoxes(canvas);
          const scanDurationMs = scanStartedAt === null ? null : performance.now() - scanStartedAt;

          // The detector is synchronous, so cancellation cannot interrupt its
          // inner loop; stale output is discarded at the first boundary after it.
          if (!isCurrentRender()) return;
          precomputedBoxesRef.current = boxes;

          if (renderSnapshotKey && scanDurationMs !== null) {
            try {
              const active = activeFieldSuggestionSnapshotRef.current;
              if (!active || active.key !== renderSnapshotKey) return;
              active.scanDurationMs = scanDurationMs;

              const displayScale = 1 / canvasRenderRatioRef.current;
              const snapshotBoxes =
                displayScale !== 1 &&
                boxes.length > 0 &&
                boxes.length <= LOCAL_FIELD_SUGGESTION_MAX_BOXES
                  ? boxes.map((box) =>
                      scaleSnapResult(box, displayScale) as SnapResult
                    )
                  : boxes;
              const prepared = prepareLocalFieldDetectionSnapshot({
                key: renderSnapshotKey,
                scanDurationMs,
                boxes: snapshotBoxes,
              });
              if (prepared.status !== "ready") {
                failSnapshot("ineligible-metadata", scanDurationMs);
              } else {
                // Revalidate once more immediately before publication.
                if (!isCurrentRender()) return;
                emitFieldSuggestionSnapshotEvent(Object.freeze({
                  status: "ready",
                  key: renderSnapshotKey,
                  scanDurationMs,
                  snapshotPreparationDurationMs: prepared.snapshotPreparationDurationMs,
                  snapshot: prepared.snapshot,
                }));
              }
            } catch {
              // Snapshot preparation and callbacks are optional. Their failure
              // must not clear or mutate the detector result used by snapping.
              failSnapshot("ineligible-metadata", scanDurationMs);
            }
          }
        } catch {
          precomputedBoxesRef.current = [];
          failSnapshot("detector-failed");
        }

        setLoading(false);

        // --- Post-render scroll settling (PR #94) ---
        // Mobile/tablet cold loads recenter once so restored sessions never
        // reopen with stale horizontal pan. Fit/resize refits recenter via
        // pendingRecenterRef; pinch commits re-anchor around the gesture
        // midpoint via pendingScrollAnchorRef (anchor wins over recenter).
        if (!coldLoadRecenterRef.current) {
          coldLoadRecenterRef.current = true;
          if (isMobileEditorViewport()) pendingRecenterRef.current = true;
        }
        const scrollAnchor = pendingScrollAnchorRef.current;
        pendingScrollAnchorRef.current = null;
        const shouldRecenter = pendingRecenterRef.current;
        pendingRecenterRef.current = false;
        if (scrollAnchor || shouldRecenter) {
          // Double rAF: wait for React to commit the new dimensions and the
          // browser to lay out before touching scroll positions.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (cancelled) return;
              const viewportEl = containerRef.current?.parentElement;
              if (!viewportEl) return;
              if (scrollAnchor) {
                const wrap = pageWrapRef.current;
                const next = anchoredScrollPosition({
                  pageOffsetLeft: wrap?.offsetLeft ?? 0,
                  pageOffsetTop: wrap?.offsetTop ?? 0,
                  pageLocalX: scrollAnchor.pageLocalX,
                  pageLocalY: scrollAnchor.pageLocalY,
                  ratio: scrollAnchor.ratio,
                  midX: scrollAnchor.midX,
                  midY: scrollAnchor.midY,
                });
                viewportEl.scrollLeft = next.scrollLeft;
                viewportEl.scrollTop = next.scrollTop;
              } else {
                viewportEl.scrollTop = 0;
                viewportEl.scrollLeft = Math.max(
                  0,
                  (viewportEl.scrollWidth - viewportEl.clientWidth) / 2
                );
              }
            });
          });
        }
      } catch (err) {
        if (!cancelled) {
          failSnapshot("render-failed");
          setError("Failed to render PDF. The file may be corrupted.");
          setLoading(false);
          console.error(err);
        }
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      cancelFieldSuggestionSnapshot(renderSnapshotKey);
      try {
        renderTask?.cancel?.();
      } catch {
        // The render may already have settled.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pdfBytes,
    currentPage,
    zoom,
    mobilePolishEnabled,
    fitRequestId,
    fieldSuggestionDocumentRevision,
    onFieldSuggestionSnapshotEvent,
    cancelFieldSuggestionSnapshot,
    emitFieldSuggestionSnapshotEvent,
  ]);

  // Refit on viewport resize and orientation change. Observes the scroll
  // viewport and bumps fitRequestId (debounced) when the available width
  // actually changes, which re-runs the render effect above and recomputes
  // the fit-to-width scale. Rotating a phone or tablet therefore refits the
  // page instead of leaving it clipped.
  useEffect(() => {
    const viewportEl = containerRef.current?.parentElement ?? containerRef.current;
    if (!viewportEl || typeof ResizeObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const width = viewportEl.clientWidth;
        const lastWidth = lastFitWidthRef.current;
        if (lastWidth !== null && Math.abs(width - lastWidth) < 2) return;
        // Orientation change / viewport resize on touch devices: recenter
        // after the refit so the page never sits half off-screen. Desktop
        // keeps its scroll position on window resizes.
        if (isMobileEditorViewport()) pendingRecenterRef.current = true;
        cancelFieldSuggestionSnapshot();
        setFitRequestId((id) => id + 1);
      }, 150);
    });
    observer.observe(viewportEl);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [cancelFieldSuggestionSnapshot]);




  // Register/unregister node callbacks for FieldShape
  const registerNode = useCallback((id: string, node: Konva.Group) => {
    nodeMapRef.current.set(id, node);
    // If this newly mounted field is the selected one, attach Transformer immediately.
    if (activeTool === "mask-eraser") return;
    const tr = trRef.current;
    if (tr && id === selectedFieldId) {
      tr.nodes([]);
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    }
  }, [activeTool, selectedFieldId]);

  const unregisterNode = useCallback((id: string) => {
    nodeMapRef.current.delete(id);
  }, []);

  // Feature 2: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target === combHiddenInputRef.current) return;
      // Only active when not editing
      if (editingFieldId !== null) return;
      
      const selectedField = selectedFieldId ? fields.find(f => f.id === selectedFieldId && f.page === currentPage) : null;

      if (selectedField && selectedField.type === "comb") {
        const combField = selectedField as CombField;
        const charCount = combField.charCount ?? 9;
        const currentValue = combField.value || "";
        const currentIndex = getCombCursorIndex(
          currentValue,
          charCount,
          combField.cursorIndex,
        );

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onFieldUpdate(
            selectedField.id,
            insertCombCharacter(
              currentValue,
              charCount,
              currentIndex,
              e.key,
            ) as Partial<EditorField>,
          );
          return;
        }

        if (e.key === "Backspace") {
          e.preventDefault();
          onFieldUpdate(
            selectedField.id,
            backspaceCombCharacter(
              currentValue,
              charCount,
              currentIndex,
            ) as Partial<EditorField>,
          );
          return;
        }

        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const nextIndex = moveCombCursor(
            currentValue,
            charCount,
            currentIndex,
            e.key === "ArrowLeft" ? "left" : "right",
          );
          onFieldUpdate(selectedField.id, { cursorIndex: nextIndex } as Partial<EditorField>);
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          return;
        }
      }
      
      // Delete / Backspace - delete selected field
      // Only delete if the field is on the current page (selectedField found)
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedField) {
          e.preventDefault();
          onFieldDelete(selectedField.id);
          onFieldSelect(null);
        }
        return;
      }
      
      // No keyboard duplicate shortcut: Ctrl/Cmd+D conflicts with browser
      // bookmark shortcuts. Duplicate is available via the Duplicate button,
      // the mobile bottom sheet, and the right-click context menu, all of
      // which route through the unified onFieldDuplicate handler.

      // Escape - deactivate tool and deselect
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPendingBoxCorner();
        if (activeTool === "mask-eraser") {
          stopMaskDrag();
        }
        onToolSelect(null);
        onFieldSelect(null);
        // Cancel any ongoing drag draw
        if (isDragDrawing.current) {
          isDragDrawing.current = false;
          dragStart.current = null;
          dragCurrent.current = null;
          setDrawRect(null);
        }
        return;
      }
      
      // Arrow keys - nudge selected field
      if (selectedField && selectedFieldId && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const nudgeAmount = e.shiftKey ? 10 : 1;
        let newX = selectedField.x;
        let newY = selectedField.y;
        
        if (e.key === "ArrowUp") newY -= nudgeAmount;
        if (e.key === "ArrowDown") newY += nudgeAmount;
        if (e.key === "ArrowLeft") newX -= nudgeAmount;
        if (e.key === "ArrowRight") newX += nudgeAmount;
        
        onFieldUpdate(selectedFieldId, { x: newX, y: newY });
        return;
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTool, editingFieldId, selectedFieldId, fields, currentPage, onFieldDelete, onFieldSelect, onToolSelect, onFieldUpdate, createFieldId, stopMaskDrag, cancelPendingBoxCorner]);

  // Drive the single global Transformer based on selectedFieldId
  useLayoutEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (!selectedFieldId || activeTool === "mask-eraser" || isCapturingPreview) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    // Never attach Transformer to whiteout fields
    const selectedField = fields.find(f => f.id === selectedFieldId);
    if (selectedField?.type === 'whiteout' || selectedField?.type === 'line' || selectedField?.type === 'checkbox') {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = nodeMapRef.current.get(selectedFieldId);
    if (node) {
      // Node is already mounted  -  attach now
      tr.nodes([]);
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    }
    // If node not found yet, do nothing  -  registerNode will attach when it mounts
  }, [selectedFieldId, fields, activeTool, isCapturingPreview]);

  // Animate snap preview opacity
  useEffect(() => {
    if (snapPreview) {
      // Fade in
      requestAnimationFrame(() => setSnapPreviewOpacity(1));
    } else {
      setSnapPreviewOpacity(0);
    }
  }, [snapPreview]);

  // Clear snap preview when snap is disabled
  useEffect(() => {
    if (!snapEnabled) {
      setSnapPreview(null);
    }
  }, [snapEnabled]);

  // Context menu: close on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  const fieldFromNode = useCallback(
    (node: Konva.Node | null, stage: Konva.Stage): EditorField | null => {
      let current: Konva.Node | null = node;
      while (current && current !== stage) {
        const id = current.id();
        if (id) {
          const field = pageFields.find((candidate) => candidate.id === id);
          if (field) return field;
        }
        current = current.getParent();
      }
      return null;
    },
    [pageFields],
  );

  const fieldFromStagePoint = useCallback(
    (stage: Konva.Stage, pos: { x: number; y: number }): EditorField | null => {
      return fieldFromNode(stage.getIntersection(pos), stage);
    },
    [fieldFromNode],
  );

  const selectFieldForInteraction = useCallback(
    (field: EditorField) => {
      onFieldSelect(field.id);
      onToolSelect(null);

      if (
        isMobileEditor ||
        field.type === "checkbox" ||
        field.type === "signature" ||
        field.type === "whiteout" ||
        field.type === "comb" ||
        field.type === "line"
      ) {
        setEditingFieldId(null);
        return;
      }

      if (!dragStartedRef.current) {
        setEditingFieldId(field.id);
      }
    },
    [isMobileEditor, onFieldSelect, onToolSelect],
  );

  // Update cursor based on context
  const updateCursor = useCallback((stage: Konva.Stage, pos: { x: number; y: number }) => {
    if (isDragging) {
      setCursorStyle("grabbing");
      return;
    }
    if (activeTool === "checkbox") {
      setCursorStyle("cell");
      return;
    }
    if (activeTool === "line") {
      setCursorStyle("crosshair");
      return;
    }
    if (activeTool === "mask-eraser") {
      setCursorStyle("none");
      return;
    }
    if (activeTool === "signature") {
      setCursorStyle("copy");
      return;
    }
    if (activeTool) {
      setCursorStyle("crosshair");
      return;
    }

    const shape = stage.getIntersection(pos);
    if (shape) {
      // Skip whiteout fields - they are non-interactive, mouse passes through
      const parent = shape.getParent();
      if (parent && parent.id()) {
        const field = fields.find(f => f.id === parent.id() && f.page === currentPage);
        if (field && field.type === "whiteout") {
          setCursorStyle("default");
          return;
        }
      }
      setCursorStyle("move");
      return;
    }

    setCursorStyle("default");
  }, [activeTool, isDragging, fields, currentPage]);

  // Hover snap preview on mouse move (throttled)
  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      // Use native event offsetX/Y for consistent coordinates during drag
      const nativeEvt = e.evt;
      const container = stage.container();
      const rect = container.getBoundingClientRect();
      const pos = { x: nativeEvt.clientX - rect.left, y: nativeEvt.clientY - rect.top };

      updateCursor(stage, pos);

      if (activeTool === "mask-eraser") {
        setMaskCursor(pos);
        if (isMaskDragging.current) {
          applyMaskAlongStagePath(pos);
        }
        if (snapPreview) setSnapPreview(null);
        setLinePreview(null);
        setCheckboxPreview(null);
        return;
      }

      // Feature 1: Update drag rectangle while dragging
      if (isDragDrawing.current && dragStart.current && isPlacementTool(activeTool) && e.target === stage) {
        dragCurrent.current = { x: pos.x, y: pos.y };
        const x = Math.min(dragStart.current.x, pos.x);
        const y = Math.min(dragStart.current.y, pos.y);
        const w = Math.abs(pos.x - dragStart.current.x);
        const h = Math.abs(pos.y - dragStart.current.y);
        setDrawRect({ x, y, w, h });
        return; // Don't do snap preview while drawing
      }

      // Line tool preview: show ghost line following cursor
      if (activeTool === "line" && !isDragDrawing.current) {
        const lineDefaults = toolDefaults.line;
        const orientation = lineDefaults.orientation ?? "horizontal";
        setLinePreview({ x: pos.x, y: pos.y, orientation });
        if (snapPreview) setSnapPreview(null);
        return;
      }

      // Checkbox tool preview: track cursor for ghost preview
      if (activeTool === "checkbox" && !isDragDrawing.current) {
        setCheckboxPreview({ x: pos.x, y: pos.y });
        if (snapPreview) setSnapPreview(null);
        return;
      }

      if (!isPlacementTool(activeTool) || activeTool === "signature" || !canvasRef.current) {
        if (snapPreview) setSnapPreview(null);
        setLinePreview(null);
        setCheckboxPreview(null);
        return;
      }

      // Skip snap detection entirely when snap is disabled
      if (!snapEnabled) {
        if (snapPreview) setSnapPreview(null);
        return;
      }

      // Throttle snap detection to ~20fps, reduces jitter on fast mouse movement
      if (snapPreviewTimer.current) return;
      snapPreviewTimer.current = setTimeout(() => {
        snapPreviewTimer.current = null;
      }, 50);

      try {
        // First check pre-computed boxes (instant, no pixel scanning)
        const preBoxes = precomputedBoxesRef.current;
        let snap = findPrecomputedSnap(
          preBoxes,
          pos.x,
          pos.y,
          canvasRenderRatioRef.current,
        );

        // Fall back: try flood fill directly on canvas, then line-based scan
        if (!snap && canvasRef.current) {
          const renderRatio = canvasRenderRatioRef.current;
          const canvasX = pos.x * renderRatio;
          const canvasY = pos.y * renderRatio;
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) {
            try {
              const imgData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
              const ff = floodFillCell(
                imgData.data,
                canvasRef.current.width,
                canvasRef.current.height,
                Math.round(canvasX),
                Math.round(canvasY),
              );
              if (ff) {
                snap = scaleSnapResult(ff, 1 / renderRatio);
              }
            } catch { /* silent */ }
          }
          if (!snap) {
            snap = scaleSnapResult(
              detectSnapBox(canvasRef.current, canvasX, canvasY),
              1 / renderRatio,
            );
          }
        }

        if (snap) {
          // Convert canvas pixels to PDF point space
          const effectiveScale = fitScale * zoomFactor;
          const newPreview = {
            x: snap.x / effectiveScale,
            y: snap.y / effectiveScale,
            width: snap.width / effectiveScale,
            height: snap.height / effectiveScale,
          };
          // Only update if snap changed significantly (>6 PDF points), prevents flicker
          setSnapPreview(prev => {
            if (!prev) return newPreview;
            const dx = Math.abs(newPreview.x - prev.x);
            const dy = Math.abs(newPreview.y - prev.y);
            const dw = Math.abs(newPreview.width - prev.width);
            const dh = Math.abs(newPreview.height - prev.height);
            if (dx < 6 && dy < 6 && dw < 6 && dh < 6) return prev; // no change
            return newPreview;
          });
        } else {
          setSnapPreview(null);
        }
      } catch {
        setSnapPreview(null);
      }
    },
    [activeTool, applyMaskAlongStagePath, fitScale, snapPreview, snapEnabled, toolDefaults, updateCursor, zoomFactor]
  );

  const handleStageMouseLeave = useCallback(() => {
    stopMaskDrag();
    setSnapPreview(null);
    setLinePreview(null);
    setCheckboxPreview(null);
    setMaskCursor(null);
    setCursorStyle(activeTool ? "crosshair" : "default");
    // Reset whiteout color when switching away from whiteout tool
    if (activeTool !== "whiteout") {
      setWhiteoutColor(null);
    }
  }, [activeTool, stopMaskDrag]);

  const createDrawnBoxField = useCallback(
    (
      firstCorner: { x: number; y: number },
      oppositeCorner: { x: number; y: number },
    ) => {
      const effectiveScale = fitScale * zoomFactor;
      const absDx = Math.abs(oppositeCorner.x - firstCorner.x);
      const absDy = Math.abs(oppositeCorner.y - firstCorner.y);
      const drawnX = Math.min(firstCorner.x, oppositeCorner.x);
      const drawnY = Math.min(firstCorner.y, oppositeCorner.y);
      let fieldX = drawnX / effectiveScale;
      let fieldY = drawnY / effectiveScale;
      const fieldW = Math.max(
        absDx / effectiveScale,
        combMobileEnabled ? 8 : 20 / fitScale,
      );
      const fieldH = Math.max(
        absDy / effectiveScale,
        combMobileEnabled ? 8 : 20 / fitScale,
      );
      const pageFields = fields.filter((field) => field.page === currentPage);
      const minimumGap = 3;

      for (const existing of pageFields) {
        const existingRight = existing.x + existing.width;
        const existingBottom = existing.y + existing.height;
        const isAdjacentRight =
          Math.abs(fieldX - existingRight) < minimumGap &&
          Math.abs(
            fieldY +
              fieldH / 2 -
              (existing.y + existing.height / 2),
          ) < Math.max(fieldH, existing.height);
        const isAdjacentLeft =
          Math.abs(fieldX + fieldW - existing.x) < minimumGap &&
          Math.abs(
            fieldY +
              fieldH / 2 -
              (existing.y + existing.height / 2),
          ) < Math.max(fieldH, existing.height);
        const isAdjacentBottom =
          Math.abs(fieldY - existingBottom) < minimumGap &&
          Math.abs(
            fieldX +
              fieldW / 2 -
              (existing.x + existing.width / 2),
          ) < Math.max(fieldW, existing.width);
        const isAdjacentTop =
          Math.abs(fieldY + fieldH - existing.y) < minimumGap &&
          Math.abs(
            fieldX +
              fieldW / 2 -
              (existing.x + existing.width / 2),
          ) < Math.max(fieldW, existing.width);

        if (isAdjacentRight) {
          fieldX = existingRight + minimumGap;
        } else if (isAdjacentLeft) {
          fieldX = existing.x - fieldW - minimumGap;
        } else if (isAdjacentBottom) {
          fieldY = existingBottom + minimumGap;
        } else if (isAdjacentTop) {
          fieldY = existing.y - fieldH - minimumGap;
        }
      }

      const id = createFieldId();
      const snapBounds = {
        x: fieldX,
        y: fieldY,
        width: fieldW,
        height: fieldH,
      };
      const base = {
        id,
        x: fieldX,
        y: fieldY,
        page: currentPage,
        snapped: false,
        snapBounds,
      };
      const canvas = canvasRef.current;
      let detectedCellWidth: number | undefined;
      let detectedCellCount: number | undefined;
      let snapX = fieldX;
      let snapY = fieldY;
      let snapHeight = fieldH;
      let cellPositions: number[] | undefined;
      let cellWidths: number[] | undefined;
      let totalWidth = fieldW;

      if (canvas) {
        const canvasDetectionScale =
          effectiveScale * canvasRenderRatioRef.current;
        const combResult = combMobileEnabled
          ? detectCombCellsV2(
              canvas,
              fieldX * canvasDetectionScale,
              fieldY * canvasDetectionScale,
              fieldW * canvasDetectionScale,
              fieldH * canvasDetectionScale,
              canvasDetectionScale,
            )
          : detectCombCells(
              canvas,
              fieldX * canvasDetectionScale,
              fieldY * canvasDetectionScale,
              fieldW * canvasDetectionScale,
              fieldH * canvasDetectionScale,
            );
        if (combResult && combResult.cellCount >= 2) {
          detectedCellWidth = Math.round(
            combResult.cellWidth / canvasDetectionScale,
          );
          detectedCellCount = combResult.cellCount;
          snapX = Math.round(
            combResult.firstCellX / canvasDetectionScale,
          );
          snapY = Math.round(combResult.y / canvasDetectionScale);
          snapHeight = Math.round(
            combResult.height / canvasDetectionScale,
          );

          if (
            combResult.cellCenters &&
            combResult.cellCenters.length > 0
          ) {
            cellPositions = combResult.cellCenters.map((center) =>
              Math.round(center / canvasDetectionScale - snapX),
            );
            cellWidths = combResult.cellWidths.map((width) =>
              Math.round(width / canvasDetectionScale),
            );
            const lastCellRight =
              combResult.cellBoundaries[
                combResult.cellBoundaries.length - 1
              ] +
              (combResult.cellWidths[
                combResult.cellWidths.length - 1
              ] || combResult.cellWidth);
            totalWidth = Math.round(
              (lastCellRight - combResult.firstCellX) /
                canvasDetectionScale,
            );
          }
        }
      }

      const charCount =
        detectedCellCount ??
        Math.min(30, Math.max(1, Math.round(fieldW / 24)));
      const width = cellPositions
        ? totalWidth
        : detectedCellWidth
          ? detectedCellWidth * charCount
          : fieldW;
      const field: CombField = {
        ...base,
        x: snapX,
        y: snapY,
        type: "comb",
        width,
        height: snapHeight,
        value: "",
        charCount,
        cellWidth: detectedCellWidth,
        cellPositions,
        cellWidths,
      };
      const addedField = onFieldAdd(field);
      onToolSelect(null);
      setCursorStyle("default");
      onFieldSelect(addedField.id);
      return addedField;
    },
    [
      createFieldId,
      currentPage,
      combMobileEnabled,
      fields,
      fitScale,
      onFieldAdd,
      onFieldSelect,
      onToolSelect,
      zoomFactor,
    ],
  );

  const detectSnapAtStagePoint = useCallback(
    (point: { x: number; y: number }): SnapResult | null => {
      const renderRatio = canvasRenderRatioRef.current;
      let foundSnap = findPrecomputedSnap(
        precomputedBoxesRef.current,
        point.x,
        point.y,
        renderRatio,
      );

      if (!foundSnap && canvasRef.current) {
        try {
          foundSnap = scaleSnapResult(
            detectSnapBox(
              canvasRef.current,
              point.x * renderRatio,
              point.y * renderRatio,
            ),
            1 / renderRatio,
          );
        } catch {
          // Fall back to unsnapped placement.
        }
      }

      return foundSnap;
    },
    [],
  );

  const createDrawnFieldForTool = useCallback(
    (
      tool: DrawnFieldTool,
      firstCorner: { x: number; y: number },
      oppositeCorner: { x: number; y: number },
    ) => {
      const x = Math.min(firstCorner.x, oppositeCorner.x);
      const y = Math.min(firstCorner.y, oppositeCorner.y);
      const absDx = Math.abs(oppositeCorner.x - firstCorner.x);
      const absDy = Math.abs(oppositeCorner.y - firstCorner.y);
      const effectiveScale = fitScale * zoomFactor;
      const width = absDx / effectiveScale;
      const height = absDy / effectiveScale;
      const fieldW = Math.max(width, 20 / fitScale);
      const fieldH = Math.max(height, 20 / fitScale);
      let fieldX = x / effectiveScale;
      let fieldY = y / effectiveScale;
      const minimumGap = 3;
      const currentPageFields = fields.filter(
        (field) => field.page === currentPage,
      );

      for (const existing of currentPageFields) {
        const existingRight = existing.x + existing.width;
        const existingBottom = existing.y + existing.height;
        const isAdjacentRight =
          Math.abs(fieldX - existingRight) < minimumGap &&
          Math.abs(
            fieldY + fieldH / 2 - (existing.y + existing.height / 2),
          ) < Math.max(fieldH, existing.height);
        const isAdjacentLeft =
          Math.abs(fieldX + fieldW - existing.x) < minimumGap &&
          Math.abs(
            fieldY + fieldH / 2 - (existing.y + existing.height / 2),
          ) < Math.max(fieldH, existing.height);
        const isAdjacentBottom =
          Math.abs(fieldY - existingBottom) < minimumGap &&
          Math.abs(
            fieldX + fieldW / 2 - (existing.x + existing.width / 2),
          ) < Math.max(fieldW, existing.width);
        const isAdjacentTop =
          Math.abs(fieldY + fieldH - existing.y) < minimumGap &&
          Math.abs(
            fieldX + fieldW / 2 - (existing.x + existing.width / 2),
          ) < Math.max(fieldW, existing.width);

        if (isAdjacentRight) {
          fieldX = existingRight + minimumGap;
        } else if (isAdjacentLeft) {
          fieldX = existing.x - fieldW - minimumGap;
        } else if (isAdjacentBottom) {
          fieldY = existingBottom + minimumGap;
        } else if (isAdjacentTop) {
          fieldY = existing.y - fieldH - minimumGap;
        }
      }

      const id = createFieldId();
      const snapBounds = {
        x: fieldX,
        y: fieldY,
        width: fieldW,
        height: fieldH,
      };
      const base = {
        id,
        x: fieldX,
        y: fieldY,
        page: currentPage,
        snapped: false,
        snapBounds,
      };

      let field: EditorField;
      switch (tool) {
        case "text":
          field = {
            ...base,
            type: "text",
            width: fieldW,
            height: fieldH,
            value: "",
            fontSize: 14,
          };
          break;
        case "checkbox": {
          const checkboxDefaults = toolDefaults.checkbox;
          const checkboxSize = checkboxDefaults.size ?? 20;
          field = {
            ...base,
            type: "checkbox",
            width: checkboxSize,
            height: checkboxSize,
            checked: checkboxDefaults.stamp !== "none",
            stamp: checkboxDefaults.stamp ?? "tick",
            color: checkboxDefaults.color ?? "#000000",
          };
          break;
        }
        case "line":
          field = createLineField(
            base,
            toolDefaults.line,
            viewportAtScale1,
            fieldW,
            fieldH,
          );
          break;
        case "signature":
          field = {
            ...base,
            type: "signature",
            width: fieldW,
            height: fieldH,
            value: "",
            fontSize: 16,
          };
          break;
        case "date":
          field = {
            ...base,
            type: "date",
            width: fieldW,
            height: fieldH,
            value: todayDateStamp(),
            fontSize: 14,
          };
          break;
        case "whiteout": {
          let fillColor = whiteoutColor || "#ffffff";
          if (!whiteoutColor) {
            const canvas = canvasRef.current;
            const context = canvas?.getContext("2d");
            if (canvas && context) {
              const renderRatio = canvasRenderRatioRef.current;
              const canvasCenterX = Math.round(
                (x + absDx / 2) * renderRatio,
              );
              const canvasCenterY = Math.round(
                (y + absDy / 2) * renderRatio,
              );
              fillColor = sampleBackgroundColor(
                context,
                canvasCenterX,
                canvasCenterY,
                canvas.width,
                canvas.height,
              );
              setWhiteoutColor(fillColor);
            }
          }
          field = {
            ...base,
            type: "whiteout",
            width: fieldW,
            height: fieldH,
            fillColor,
          };
          break;
        }
      }

      const addedField = onFieldAdd(field);
      if (tool !== "whiteout" && tool !== "checkbox" && tool !== "line") {
        onToolSelect(null);
      }
      setCursorStyle(
        tool === "whiteout" || tool === "line"
          ? "crosshair"
          : tool === "checkbox"
            ? "cell"
            : "default",
      );
      if (tool !== "whiteout" && tool !== "checkbox" && tool !== "line") {
        onFieldSelect(addedField.id);
      }

      if (tool === "signature") {
        onSignatureFieldPlaced?.(addedField);
      } else if (
        !isMobileEditor &&
        tool !== "checkbox" &&
        tool !== "whiteout" &&
        tool !== "line"
      ) {
        setEditingFieldId(addedField.id);
      }

      return addedField;
    },
    [
      createFieldId,
      currentPage,
      fields,
      fitScale,
      isMobileEditor,
      onFieldAdd,
      onFieldSelect,
      onSignatureFieldPlaced,
      onToolSelect,
      toolDefaults,
      viewportAtScale1,
      whiteoutColor,
      zoomFactor,
    ],
  );

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      // Use clientX/Y with getBoundingClientRect for reliable coordinates on first interaction
      // offsetX/Y is relative to event target which may not be the canvas on first click
      const nativeEvt = e.evt;
      const container = stage.container();
      const rect = container.getBoundingClientRect();
      const pos = { x: nativeEvt.clientX - rect.left, y: nativeEvt.clientY - rect.top };
      mouseDownPos.current = { x: pos.x, y: pos.y };
      if (activeTool === "mask-eraser") {
        setMaskCursor(pos);
        preDragFieldsRef.current = fields;
        draftFieldsRef.current = fields;
        maskAddedRef.current = false;
        isMaskDragging.current = true;
        lastMaskPointRef.current = { x: pos.x, y: pos.y };
        onFieldSelect(null);
        applyMaskAtStagePoint(pos);
        isDragMove.current = false;
        return;
      }
      // Feature 1: Record drag start if tool is active and clicking on empty canvas
      if (isPlacementTool(activeTool) && e.target === stage) {
        dragStart.current = { x: pos.x, y: pos.y };
        dragCurrent.current = { x: pos.x, y: pos.y };
        isDragDrawing.current = true;
        setDrawRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
      }
      isDragMove.current = false;
    },
    [activeTool, applyMaskAtStagePoint, fields, onFieldSelect]
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      if (isMobileEditor && Date.now() - lastTouchEndAtRef.current < 700) return;
      // Use clientX/Y with getBoundingClientRect for consistent coordinates with mouseDown
      const nativeEvt = e.evt;
      const container = stage.container();
      const rect = container.getBoundingClientRect();
      const pos = { x: nativeEvt.clientX - rect.left, y: nativeEvt.clientY - rect.top };
      if (mouseDownPos.current) {
        const dx = pos.x - mouseDownPos.current.x;
        const dy = pos.y - mouseDownPos.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          isDragMove.current = true;
        }
      }

      if (activeTool === "mask-eraser") {
        if (isMaskDragging.current) {
          applyMaskAlongStagePath(pos);
        }
        stopMaskDrag();
        return;
      }

      // Feature 1: Complete drag-to-draw if active
      if (isDragDrawing.current && dragStart.current && pos) {
        const dx = pos.x - dragStart.current.x;
        const dy = pos.y - dragStart.current.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        
        // If drag distance > 10px in both axes, use drawn rectangle
        if (absDx > 10 && absDy > 10 && isPlacementTool(activeTool) && e.target === stage) {
          if (activeTool === "box") {
            createDrawnBoxField(dragStart.current, pos);
            isDragDrawing.current = false;
            dragStart.current = null;
            dragCurrent.current = null;
            setDrawRect(null);
            setLinePreview(null);
            setCheckboxPreview(null);
            cancelPendingBoxCorner();
            return;
          }
          createDrawnFieldForTool(activeTool, dragStart.current, pos);
        } else if (absDx <= 10 || absDy <= 10) {
          // Fall back to click-to-place behavior - inline the logic here to avoid circular dependency
          const clickedOnEmpty = e.target === stage || activeTool === "checkbox";
          if (isPlacementTool(activeTool) && clickedOnEmpty && pos) {
            const id = createFieldId();
            // Convert canvas pixels to PDF point space
            const effectiveScale = fitScale * zoomFactor;
            let fieldX = pos.x / effectiveScale;
            let fieldY = pos.y / effectiveScale;
            let fieldW: number;
            let fieldH: number;
            let snapped = false;

            // Default sizes in PDF points (72 points = 1 inch)
            const defaults = {
              text:      { w: 200, h: 28 },
              checkbox:  { w: 20,  h: 20 },
              signature: { w: 220, h: 70 },
              date:      { w: 160, h: 28 },
              box:       { w: 220, h: 30 },
              whiteout:  { w: 100, h: 30 },
              line:      { w: 200, h: 1 },
            };
            fieldW = defaults[activeTool].w;
            fieldH = defaults[activeTool].h;

            // Checkboxes and signatures never snap, place at click point
            // Also skip snap detection if snapEnabled is false
            if (activeTool !== "checkbox" && activeTool !== "signature" && activeTool !== "line" && snapEnabled) {
              if (snapPreview) {
                // snapPreview is now in PDF point space
                fieldX = snapPreview.x;
                fieldY = snapPreview.y;
                fieldW = snapPreview.width;
                fieldH = snapPreview.height;
                snapped = true;
              } else {
                const preBoxes = precomputedBoxesRef.current;
                let foundSnap = findPrecomputedSnap(
                  preBoxes,
                  pos.x,
                  pos.y,
                  canvasRenderRatioRef.current,
                );

                if (!foundSnap && canvasRef.current) {
                  try {
                    const renderRatio = canvasRenderRatioRef.current;
                    foundSnap = scaleSnapResult(
                      detectSnapBox(
                        canvasRef.current,
                        pos.x * renderRatio,
                        pos.y * renderRatio,
                      ),
                      1 / renderRatio,
                    );
                  } catch { /* fall back to default */ }
                }

                if (foundSnap) {
                  // Convert snap result from canvas pixels to PDF points
                  const snapX = foundSnap.x / effectiveScale;
                  const snapY = foundSnap.y / effectiveScale;
                  const snapZoneOccupied = fields.some(
                    (f) => f.page === currentPage &&
                    Math.abs(f.x - snapX) < 8 &&
                    Math.abs(f.y - snapY) < 8
                  );
                  if (!snapZoneOccupied) {
                    fieldX = snapX;
                    fieldY = snapY;
                    fieldW = foundSnap.width / effectiveScale;
                    fieldH = foundSnap.height / effectiveScale;
                    snapped = true;
                  }
                }
              }
            }

            // Check if snap zone is already occupied by another field on the same page
            const snapZoneOccupied = fields.some((f) =>
              f.page === currentPage &&
              Math.abs(f.x - fieldX) < 8 &&
              Math.abs(f.y - fieldY) < 8
            );
            if (snapZoneOccupied) {
              // Reject snap, fall back to click position
              snapped = false;
              fieldX = pos.x / effectiveScale;
              fieldY = pos.y / effectiveScale;
              fieldW = defaults[activeTool].w;
              fieldH = defaults[activeTool].h;
            }

            // Enforce minimum gap between adjacent fields (in PDF points)
            if (snapped) {
              const pageFields = fields.filter((f) => f.page === currentPage);
              const MIN_GAP = 3;
              
              for (const existing of pageFields) {
                const existingRight = existing.x + existing.width;
                const existingBottom = existing.y + existing.height;
                
                // Check if new field would be adjacent to existing field
                const isAdjacentRight = Math.abs(fieldX - existingRight) < MIN_GAP && Math.abs((fieldY + fieldH / 2) - (existing.y + existing.height / 2)) < Math.max(fieldH, existing.height);
                const isAdjacentLeft = Math.abs((fieldX + fieldW) - existing.x) < MIN_GAP && Math.abs((fieldY + fieldH / 2) - (existing.y + existing.height / 2)) < Math.max(fieldH, existing.height);
                const isAdjacentBottom = Math.abs(fieldY - existingBottom) < MIN_GAP && Math.abs((fieldX + fieldW / 2) - (existing.x + existing.width / 2)) < Math.max(fieldW, existing.width);
                const isAdjacentTop = Math.abs((fieldY + fieldH) - existing.y) < MIN_GAP && Math.abs((fieldX + fieldW / 2) - (existing.x + existing.width / 2)) < Math.max(fieldW, existing.width);
                
                if (isAdjacentRight) {
                  fieldX = existingRight + MIN_GAP;
                } else if (isAdjacentLeft) {
                  fieldX = existing.x - fieldW - MIN_GAP;
                } else if (isAdjacentBottom) {
                  fieldY = existingBottom + MIN_GAP;
                } else if (isAdjacentTop) {
                  fieldY = existing.y - fieldH - MIN_GAP;
                }
              }
            }
            
            const inferredFontSize = snapped ? inferFontSize(fieldH) : undefined;
            const snapBounds = snapped ? { x: fieldX, y: fieldY, width: fieldW, height: fieldH } : undefined;
            const base = { id, x: fieldX, y: fieldY, page: currentPage, snapped, snapBounds };

            let field: EditorField;
            switch (activeTool) {
              case "text":
                field = { ...base, type: "text", width: fieldW, height: fieldH, value: "", fontSize: inferredFontSize ?? 14 };
                break;
              case "checkbox":
                {
                  const cbDefaults = toolDefaults.checkbox;
                  const cbSize = cbDefaults.size ?? 20;
                  field = {
                    ...base,
                    type: "checkbox",
                    width: cbSize,
                    height: cbSize,
                    checked: cbDefaults.stamp !== "none",
                    stamp: cbDefaults.stamp ?? "tick",
                    color: cbDefaults.color ?? "#000000",
                  };
                }
                break;
              case "line":
                field = createLineField(base, toolDefaults.line, viewportAtScale1, fieldW, fieldH);
                break;
              case "signature":
                field = { ...base, type: "signature", width: fieldW, height: fieldH, value: "", fontSize: inferredFontSize ?? 16 };
                break;
              case "date":
                field = { ...base, type: "date", width: fieldW, height: fieldH, value: todayDateStamp(), fontSize: inferredFontSize ?? 14 };
                break;
              case "box": {
                // Try to auto-detect comb cells from the PDF
                const combCanvas = canvasRef.current;
                let combDetectedCellWidth: number | undefined;
                let combDetectedCellCount: number | undefined;
                let combSnapX = fieldX;
                let combSnapY = fieldY;
                let combSnapHeight = fieldH;
                let combCellPositions: number[] | undefined;
                let combCellWidthsArr: number[] | undefined;
                let combTotalWidth = fieldW;

                if (combCanvas) {
                  const canvasDetectionScale =
                    effectiveScale * canvasRenderRatioRef.current;
                  // Convert PDF points to canvas pixels for detection
                  const combResult = combMobileEnabled
                    ? detectCombCellsV2(
                        combCanvas,
                        fieldX * canvasDetectionScale,
                        fieldY * canvasDetectionScale,
                        fieldW * canvasDetectionScale,
                        fieldH * canvasDetectionScale,
                        canvasDetectionScale,
                      )
                    : detectCombCells(
                        combCanvas,
                        fieldX * canvasDetectionScale,
                        fieldY * canvasDetectionScale,
                        fieldW * canvasDetectionScale,
                        fieldH * canvasDetectionScale,
                      );
                  if (combResult && combResult.cellCount >= 2) {
                    // Convert back to PDF point space
                    combDetectedCellWidth = Math.round(combResult.cellWidth / canvasDetectionScale);
                    combDetectedCellCount = combResult.cellCount;
                    combSnapX = Math.round(combResult.firstCellX / canvasDetectionScale);
                    combSnapY = Math.round(combResult.y / canvasDetectionScale);
                    combSnapHeight = Math.round(combResult.height / canvasDetectionScale);

                    if (combResult.cellCenters && combResult.cellCenters.length > 0) {
                      combCellPositions = combResult.cellCenters.map(c => Math.round((c / canvasDetectionScale) - combSnapX));
                      combCellWidthsArr = combResult.cellWidths.map(w => Math.round(w / canvasDetectionScale));
                      const lastCellRight = combResult.cellBoundaries[combResult.cellBoundaries.length - 1] +
                        (combResult.cellWidths[combResult.cellWidths.length - 1] || combResult.cellWidth);
                      combTotalWidth = Math.round((lastCellRight - combResult.firstCellX) / canvasDetectionScale);
                    }
                  }
                }

                const combFinalCharCount = combDetectedCellCount ?? Math.min(30, Math.max(1, Math.round(fieldW / 24)));
                const combFinalWidth = combCellPositions ? combTotalWidth : (combDetectedCellWidth ? combDetectedCellWidth * combFinalCharCount : fieldW);
                
                field = { 
                  ...base, 
                  x: combSnapX,
                  y: combSnapY,
                  type: "comb", 
                  width: combFinalWidth, 
                  height: combSnapHeight, 
                  value: "", 
                  charCount: combFinalCharCount,
                  cellWidth: combDetectedCellWidth,
                  cellPositions: combCellPositions,
                  cellWidths: combCellWidthsArr,
                };
                break;
              }
              case "whiteout": {
                // Use pre-sampled whiteout color if available
                let fillColor = whiteoutColor || "#ffffff";
                if (!whiteoutColor) {
                  const canvas = canvasRef.current;
                  if (canvas) {
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                      // Use raw screen coordinates for sampling
                      const renderRatio = canvasRenderRatioRef.current;
                      const canvasCx = Math.round(pos.x * renderRatio);
                      const canvasCy = Math.round(pos.y * renderRatio);
                      fillColor = sampleBackgroundColor(ctx, canvasCx, canvasCy, canvas.width, canvas.height);
                      setWhiteoutColor(fillColor);
                    }
                  }
                }
                field = { ...base, type: "whiteout", width: fieldW, height: fieldH, fillColor };
                break;
              }
            }

            const addedField = onFieldAdd(field);
            // Keep stamp-style tools active
            if (activeTool !== "whiteout" && activeTool !== "checkbox" && activeTool !== "line") {
              onToolSelect(null);
            }
            setCursorStyle(activeTool === "whiteout" || activeTool === "line" ? "crosshair" : activeTool === "checkbox" ? "cell" : "default");
            if (activeTool !== "whiteout" && activeTool !== "checkbox" && activeTool !== "line") {
              onFieldSelect(addedField.id);
            }

            if (activeTool === "signature") {
              onSignatureFieldPlaced?.(addedField);
            } else if (!isMobileEditor && activeTool !== "checkbox" && activeTool !== "whiteout" && activeTool !== "box" && activeTool !== "line") {
              setEditingFieldId(addedField.id);
            }

            if (snapped) {
              setSnappedFieldId(addedField.id);
              setTimeout(() => setSnappedFieldId(null), 600);
            }
          }
        }
        
        // Reset drag drawing state
        isDragDrawing.current = false;
        dragStart.current = null;
        dragCurrent.current = null;
        setDrawRect(null);
        setLinePreview(null);
        setCheckboxPreview(null);
      }
    },
    [activeTool, currentPage, zoomFactor, fitScale, onFieldAdd, onFieldSelect, onToolSelect, onSignatureFieldPlaced, snapPreview, whiteoutColor, fields, snapEnabled, createFieldId, isMobileEditor, toolDefaults, viewportAtScale1, applyMaskAlongStagePath, stopMaskDrag, cancelPendingBoxCorner, createDrawnBoxField, createDrawnFieldForTool, combMobileEnabled]
  );

  // Core field creation logic - shared by click and touch
  const createFieldAtPoint = useCallback(
    (
      posX: number,
      posY: number,
      clickedOnEmpty: boolean,
      detectedSnap?: SnapResult,
    ) => {
      if (!isPlacementTool(activeTool) || !clickedOnEmpty) return false;

      const id = createFieldId();
      // Convert canvas pixels to PDF point space
      const effectiveScale = fitScale * zoomFactor;

      let fieldX = posX / effectiveScale;
      let fieldY = posY / effectiveScale;
      let fieldW: number;
      let fieldH: number;
      let snapped = false;

      // Default sizes in PDF points
      const defaults = {
        text:      { w: 200, h: 28 },
        checkbox:  { w: 20,  h: 20 },
        signature: { w: 220, h: 70 },
        date:      { w: 160, h: 28 },
        box:       { w: 220, h: 30 },
        whiteout:  { w: 100, h: 30 },
        line:      { w: 200, h: 1 },
      };
      fieldW = defaults[activeTool].w;
      fieldH = defaults[activeTool].h;

      // Checkboxes and signatures never snap, place at click point
      // Also skip snap detection if snapEnabled is false
      if (activeTool !== "checkbox" && activeTool !== "signature" && activeTool !== "line" && snapEnabled) {
        // Snap-first: always try snap detection first
        if (detectedSnap) {
          fieldX = detectedSnap.x / effectiveScale;
          fieldY = detectedSnap.y / effectiveScale;
          fieldW = detectedSnap.width / effectiveScale;
          fieldH = detectedSnap.height / effectiveScale;
          snapped = true;
        } else if (snapPreview) {
          // snapPreview is now in PDF point space
          fieldX = snapPreview.x;
          fieldY = snapPreview.y;
          fieldW = snapPreview.width;
          fieldH = snapPreview.height;
          snapped = true;
        } else {
          const foundSnap = detectSnapAtStagePoint({ x: posX, y: posY });

          if (foundSnap) {
            // Convert canvas pixels to PDF points
            fieldX = foundSnap.x / effectiveScale;
            fieldY = foundSnap.y / effectiveScale;
            fieldW = foundSnap.width / effectiveScale;
            fieldH = foundSnap.height / effectiveScale;
            snapped = true;
          }
        }
      }

      // Check if snap zone is already occupied by another field on the same page
      const snapZoneOccupied = fields.some((f) =>
        f.page === currentPage &&
        Math.abs(f.x - fieldX) < 8 &&
        Math.abs(f.y - fieldY) < 8
      );
      if (snapZoneOccupied) {
        // Reject snap, fall back to click position
        snapped = false;
        fieldX = posX / effectiveScale;
        fieldY = posY / effectiveScale;
        fieldW = defaults[activeTool].w;
        fieldH = defaults[activeTool].h;
      }

      // Enforce minimum gap between adjacent fields (in PDF points)
      if (snapped) {
        const pageFields = fields.filter((f) => f.page === currentPage);
        const MIN_GAP = 3;

        for (const existing of pageFields) {
          const existingRight = existing.x + existing.width;
          const existingBottom = existing.y + existing.height;

          // Check if new field would be adjacent to existing field
          const isAdjacentRight = Math.abs(fieldX - existingRight) < MIN_GAP && Math.abs((fieldY + fieldH / 2) - (existing.y + existing.height / 2)) < Math.max(fieldH, existing.height);
          const isAdjacentLeft = Math.abs((fieldX + fieldW) - existing.x) < MIN_GAP && Math.abs((fieldY + fieldH / 2) - (existing.y + existing.height / 2)) < Math.max(fieldH, existing.height);
          const isAdjacentBottom = Math.abs(fieldY - existingBottom) < MIN_GAP && Math.abs((fieldX + fieldW / 2) - (existing.x + existing.width / 2)) < Math.max(fieldW, existing.width);
          const isAdjacentTop = Math.abs((fieldY + fieldH) - existing.y) < MIN_GAP && Math.abs((fieldX + fieldW / 2) - (existing.x + existing.width / 2)) < Math.max(fieldW, existing.width);

          if (isAdjacentRight) {
            fieldX = existingRight + MIN_GAP;
          } else if (isAdjacentLeft) {
            fieldX = existing.x - fieldW - MIN_GAP;
          } else if (isAdjacentBottom) {
            fieldY = existingBottom + MIN_GAP;
          } else if (isAdjacentTop) {
            fieldY = existing.y - fieldH - MIN_GAP;
          }
        }
      }

      // Infer font size from box height when snapped
      const inferredFontSize = snapped ? inferFontSize(fieldH) : undefined;

      const snapBounds = snapped ? { x: fieldX, y: fieldY, width: fieldW, height: fieldH } : undefined;
      const base = { id, x: fieldX, y: fieldY, page: currentPage, snapped, snapBounds };

      let field: EditorField;
      switch (activeTool) {
        case "text":
          field = { ...base, type: "text", width: fieldW, height: fieldH, value: "", fontSize: inferredFontSize ?? 14 };
          break;
        case "checkbox":
          {
            const cbDefaults = toolDefaults.checkbox;
            const cbSize = cbDefaults.size ?? 20;
            field = {
              ...base,
              type: "checkbox",
              width: cbSize,
              height: cbSize,
              checked: cbDefaults.stamp !== "none",
              stamp: cbDefaults.stamp ?? "tick",
              color: cbDefaults.color ?? "#000000",
            };
          }
          break;
        case "line":
          field = createLineField(base, toolDefaults.line, viewportAtScale1, fieldW, fieldH);
          break;
        case "signature":
          field = { ...base, type: "signature", width: fieldW, height: fieldH, value: "", fontSize: inferredFontSize ?? 16 };
          break;
        case "date":
          field = { ...base, type: "date", width: fieldW, height: fieldH, value: todayDateStamp(), fontSize: inferredFontSize ?? 14 };
          break;
        case "box": {
          // Try to auto-detect comb cells from the PDF
          const combCanvas3 = canvasRef.current;
          let combDetectedCellWidth3: number | undefined;
          let combDetectedCellCount3: number | undefined;
          let combSnapX3 = fieldX;
          let combSnapY3 = fieldY;
          let combSnapHeight3 = fieldH;
          let combCellPositions3: number[] | undefined;
          let combCellWidthsArr3: number[] | undefined;
          let combTotalWidth3 = fieldW;

          if (combCanvas3) {
            const canvasDetectionScale =
              effectiveScale * canvasRenderRatioRef.current;
            // Convert PDF points to canvas pixels for detection
            const combResult3 = combMobileEnabled
              ? detectCombCellsV2(
                  combCanvas3,
                  fieldX * canvasDetectionScale,
                  fieldY * canvasDetectionScale,
                  fieldW * canvasDetectionScale,
                  fieldH * canvasDetectionScale,
                  canvasDetectionScale,
                )
              : detectCombCells(
                  combCanvas3,
                  fieldX * canvasDetectionScale,
                  fieldY * canvasDetectionScale,
                  fieldW * canvasDetectionScale,
                  fieldH * canvasDetectionScale,
                );
            if (combResult3 && combResult3.cellCount >= 2) {
              // Convert back to PDF point space
              combDetectedCellWidth3 = Math.round(combResult3.cellWidth / canvasDetectionScale);
              combDetectedCellCount3 = combResult3.cellCount;
              combSnapX3 = Math.round(combResult3.firstCellX / canvasDetectionScale);
              combSnapY3 = Math.round(combResult3.y / canvasDetectionScale);
              combSnapHeight3 = Math.round(combResult3.height / canvasDetectionScale);

              if (combResult3.cellCenters && combResult3.cellCenters.length > 0) {
                combCellPositions3 = combResult3.cellCenters.map(c => Math.round((c / canvasDetectionScale) - combSnapX3));
                combCellWidthsArr3 = combResult3.cellWidths.map(w => Math.round(w / canvasDetectionScale));
                const lastCellRight3 = combResult3.cellBoundaries[combResult3.cellBoundaries.length - 1] +
                  (combResult3.cellWidths[combResult3.cellWidths.length - 1] || combResult3.cellWidth);
                combTotalWidth3 = Math.round((lastCellRight3 - combResult3.firstCellX) / canvasDetectionScale);
              }
            }
          }

          const combFinalCharCount3 = combDetectedCellCount3 ?? Math.min(30, Math.max(1, Math.round(fieldW / 24)));
          const combFinalWidth3 = combCellPositions3 ? combTotalWidth3 : (combDetectedCellWidth3 ? combDetectedCellWidth3 * combFinalCharCount3 : fieldW);
          
          field = { 
            ...base, 
            x: combSnapX3,
            y: combSnapY3,
            type: "comb", 
            width: combFinalWidth3, 
            height: combSnapHeight3, 
            value: "", 
            charCount: combFinalCharCount3,
            cellWidth: combDetectedCellWidth3,
            cellPositions: combCellPositions3,
            cellWidths: combCellWidthsArr3,
          };
          break;
        }
        case "whiteout": {
          // Use pre-sampled whiteout color if available
          let fillColor = whiteoutColor || "#ffffff";
          if (!whiteoutColor) {
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext("2d");
              if (ctx) {
                // Use raw screen coordinates for sampling
                const renderRatio = canvasRenderRatioRef.current;
                const canvasCx = Math.round(posX * renderRatio);
                const canvasCy = Math.round(posY * renderRatio);
                fillColor = sampleBackgroundColor(ctx, canvasCx, canvasCy, canvas.width, canvas.height);
                setWhiteoutColor(fillColor);
              }
            }
          }
          field = { ...base, type: "whiteout", width: fieldW, height: fieldH, fillColor };
          break;
        }
      }

      const addedField = onFieldAdd(field);
      // Keep stamp-style tools active
      if (activeTool !== "whiteout" && activeTool !== "checkbox" && activeTool !== "line") {
        onToolSelect(null);
      }
      setCursorStyle(activeTool === "whiteout" || activeTool === "line" ? "crosshair" : activeTool === "checkbox" ? "cell" : "default");
      if (activeTool !== "whiteout" && activeTool !== "checkbox" && activeTool !== "line") {
        onFieldSelect(addedField.id);
      }

      // For signature fields, trigger signature placement flow
      if (activeTool === "signature") {
        onSignatureFieldPlaced?.(addedField);
      } else if (!isMobileEditor && activeTool !== "checkbox" && activeTool !== "whiteout" && activeTool !== "box" && activeTool !== "line") {
        // Immediately enter edit mode for text-like fields
        setEditingFieldId(addedField.id);
      }

      // Flash confirmation on snap
      if (snapped) {
        setSnappedFieldId(addedField.id);
        setTimeout(() => setSnappedFieldId(null), 600);
      }

      return true;
    },
    [activeTool, currentPage, onFieldAdd, onFieldSelect, onToolSelect, zoomFactor, fitScale, snapPreview, onSignatureFieldPlaced, snapEnabled, whiteoutColor, fields, createFieldId, isMobileEditor, toolDefaults, viewportAtScale1, combMobileEnabled, detectSnapAtStagePoint]
  );

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Ignore taps/clicks that belong to (or immediately follow) a
      // two-finger gesture so ending a pinch/pan never selects or places.
      if (
        gestureRef.current ||
        Date.now() - lastGestureEndAtRef.current < GESTURE_PLACEMENT_SUPPRESS_MS
      ) {
        return;
      }
      if (isDragMove.current) {
        isDragMove.current = false;
        return;
      }

      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      if (activeTool === "mask-eraser") {
        return;
      }

      const hitField = fieldFromNode(e.target, stage) ?? fieldFromStagePoint(stage, pos);
      if (hitField && hitField.type !== "whiteout") {
        selectFieldForInteraction(hitField);
        return;
      }

      if (hitField?.type === "whiteout") {
        if (activeTool) {
          createFieldAtPoint(pos.x, pos.y, true);
        } else {
          onFieldSelect(null);
          setEditingFieldId(null);
          if (trRef.current) {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
          }
        }
        return;
      }

      const clickedOnEmpty = e.target === stage || activeTool === "checkbox";

      if (!clickedOnEmpty) {
        if (!activeTool) {
          return;
        }
        return;
      }

      // FIX: Prevent double field creation
      // handleStageMouseUp already creates the field for all activeTool cases
      // so we skip creation here to avoid duplicates (especially when snap is ON)
      if (activeTool) {
        // Skip if this was processed by mouseUp (drag move or click)
        if (isDragMove.current) {
          isDragMove.current = false;
          return;
        }
        // mouseUp already handled field creation, skip here
        return;
      } else {
        onFieldSelect(null);
        setEditingFieldId(null);
        if (trRef.current) {
          trRef.current.nodes([]);
          trRef.current.getLayer()?.batchDraw();
        }
      }
    },
    [activeTool, createFieldAtPoint, fieldFromNode, fieldFromStagePoint, onFieldSelect, selectFieldForInteraction]
  );

  const handleStageTap = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      handleStageClick(e as Konva.KonvaEventObject<MouseEvent | TouchEvent>);
    },
    [handleStageClick],
  );

  // Touch handler for mobile tap-to-place, delegates to createFieldAtPoint
  // so behaviour (including non-snap fallback) matches desktop clicks.
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!activeTool || !canvasRef.current) return;
      if (activeTool === "mask-eraser") return;
      if (
        shouldSuppressTouchPlacement({
          gestureActive: gestureRef.current !== null,
          remainingTouches: e.touches.length,
          changedTouches: e.changedTouches.length,
          now: Date.now(),
          lastGestureEndAt: lastGestureEndAtRef.current,
        })
      ) {
        return;
      }

      const touch = e.changedTouches[0];
      // The last finger of a two-finger gesture must never place a field,
      // even if it lingers past the suppression window.
      if (gestureTailTouchIdRef.current !== null) {
        const isTail = touch.identifier === gestureTailTouchIdRef.current;
        gestureTailTouchIdRef.current = null;
        if (isTail) return;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const touchX = touch.clientX - rect.left;
      const touchY = touch.clientY - rect.top;

      if (touchX < 0 || touchY < 0 || touchX > rect.width || touchY > rect.height) return;
      lastTouchEndAtRef.current = Date.now();

      if (twoTapPlacementEnabled) {
        e.preventDefault();
        const corner = { x: touchX, y: touchY };
        const firstCorner = pendingBoxCornerRef.current;
        if (
          !firstCorner ||
          pendingBoxCornerToolRef.current !== activeTool
        ) {
          cancelPendingBoxCorner();
          plantPendingBoxCorner(corner, activeTool);
          return;
        }
        cancelPendingBoxCorner();
        if (twoTapBoxPlacementEnabled) {
          createDrawnBoxField(firstCorner, corner);
          return;
        }

        const absDx = Math.abs(corner.x - firstCorner.x);
        const absDy = Math.abs(corner.y - firstCorner.y);
        if (absDx > 10 && absDy > 10 && twoTapDrawToolsEnabled) {
          if (activeTool === "text" || activeTool === "date") {
            const tapRect = {
              x: Math.min(firstCorner.x, corner.x),
              y: Math.min(firstCorner.y, corner.y),
              width: absDx,
              height: absDy,
            };
            const rectCenter = {
              x: tapRect.x + tapRect.width / 2,
              y: tapRect.y + tapRect.height / 2,
            };
            const detectedSnap = snapEnabled
              ? detectSnapAtStagePoint(rectCenter)
              : null;
            const snapIntersectsTapRect =
              detectedSnap !== null &&
              detectedSnap.x < tapRect.x + tapRect.width &&
              detectedSnap.x + detectedSnap.width > tapRect.x &&
              detectedSnap.y < tapRect.y + tapRect.height &&
              detectedSnap.y + detectedSnap.height > tapRect.y;

            if (detectedSnap && snapIntersectsTapRect) {
              createFieldAtPoint(
                rectCenter.x,
                rectCenter.y,
                true,
                detectedSnap,
              );
              return;
            }
          }

          createDrawnFieldForTool(activeTool, firstCorner, corner);
          if (activeTool === "whiteout") {
            onToolSelect("whiteout");
            onFieldSelect(null);
          }
          return;
        }

        createFieldAtPoint(firstCorner.x, firstCorner.y, true);
        return;
      }

      const stage = stageRef.current;
      if (stage) {
        const hitField = fieldFromStagePoint(stage, { x: touchX, y: touchY });
        if (hitField && hitField.type !== "whiteout") {
          e.preventDefault();
          selectFieldForInteraction(hitField);
          return;
        }
      }

      e.preventDefault();
      createFieldAtPoint(touchX, touchY, true);
    },
    [activeTool, cancelPendingBoxCorner, createDrawnBoxField, createDrawnFieldForTool, createFieldAtPoint, detectSnapAtStagePoint, fieldFromStagePoint, onFieldSelect, onToolSelect, plantPendingBoxCorner, selectFieldForInteraction, snapEnabled, twoTapBoxPlacementEnabled, twoTapDrawToolsEnabled, twoTapPlacementEnabled]
  );

  // --- Two-finger gestures: pinch zoom + pan (PR #94) -------------------
  // Native (non-passive) listeners on the viewer content so preventDefault
  // works; React attaches touch listeners passively. One finger keeps all
  // existing behaviour (tap-to-place, drag, resize, mask eraser). Two
  // fingers navigate: midpoint movement pans the scroll container, distance
  // change scales the page via CSS transform, and the final zoom value is
  // committed on release so pdf.js re-renders crisply exactly once.

  useEffect(() => {
    zoomPropRef.current = zoom;
  }, [zoom]);

  const endGesture = useCallback(
    (commit: boolean) => {
      const g = gestureRef.current;
      if (!g) return;
      gestureRef.current = null;
      lastGestureEndAtRef.current = Date.now();
      lastTouchEndAtRef.current = Date.now();
      setIsGesturing(false);
      onGestureZoomPreview?.(null);
      const wrap = pageWrapRef.current;
      if (wrap) {
        wrap.style.transform = "";
        wrap.style.transformOrigin = "";
        wrap.style.willChange = "";
      }
      if (!commit) return;
      // Dead zone: a wobbly two-finger pan (tiny distance change) must not
      // trigger a zoom commit and re-render.
      if (Math.abs(g.currentZoom - g.startZoom) < 2) return;
      const finalZoom = Math.round(
        clampGestureZoom(g.currentZoom, gestureZoomLimit),
      );
      if (finalZoom === Math.round(g.startZoom) || !onGestureZoomCommit) return;
      const viewportEl = containerRef.current?.parentElement;
      if (viewportEl && wrap) {
        // Anchor: keep the content point under the gesture midpoint fixed
        // once the page re-renders at the committed zoom. Captured in the
        // pre-commit layout (CSS transform does not affect layout metrics).
        pendingScrollAnchorRef.current = {
          pageLocalX: viewportEl.scrollLeft + g.midX - wrap.offsetLeft,
          pageLocalY: viewportEl.scrollTop + g.midY - wrap.offsetTop,
          midX: g.midX,
          midY: g.midY,
          ratio: finalZoom / g.startZoom,
        };
      }
      onGestureZoomCommit(finalZoom);
    },
    [gestureZoomLimit, onGestureZoomCommit, onGestureZoomPreview]
  );

  useEffect(() => {
    cancelGestureRef.current = () => endGesture(false);
  }, [endGesture]);

  const handleGestureTouchStart = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const viewportEl = containerRef.current?.parentElement;
      const wrap = pageWrapRef.current;
      if (!viewportEl || !wrap) return;
      // Claim the touch sequence before the browser starts a native scroll
      // or synthesizes clicks.
      e.preventDefault();
      // Cancel any in-flight single-finger work before navigating.
      nodeMapRef.current.forEach((node) => {
        if (node.isDragging()) node.stopDrag();
      });
      stopMaskDrag();
      cancelPendingBoxCorner();
      isDragDrawing.current = false;
      dragStart.current = null;
      dragCurrent.current = null;
      setDrawRect(null);
      setIsDragging(false);

      const p0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const p1 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      const mid = touchMidpoint(p0, p1);
      const vpRect = viewportEl.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      wrap.style.transformOrigin = `${mid.x - wrapRect.left}px ${mid.y - wrapRect.top}px`;
      wrap.style.willChange = "transform";
      gestureRef.current = {
        startZoom: zoomPropRef.current,
        currentZoom: zoomPropRef.current,
        startDist: touchDistance(p0, p1),
        lastMid: mid,
        midX: mid.x - vpRect.left,
        midY: mid.y - vpRect.top,
      };
      gestureTailTouchIdRef.current = null;
      setIsGesturing(true);
    },
    [cancelPendingBoxCorner, stopMaskDrag]
  );

  const handleGestureTouchMove = useCallback(
    (e: TouchEvent) => {
      const g = gestureRef.current;
      if (!g || e.touches.length < 2) return;
      e.preventDefault();
      const p0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const p1 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      const mid = touchMidpoint(p0, p1);

      // Two-finger pan: midpoint deltas drive the native scroll container,
      // so field coordinates and desktop behaviour are untouched.
      const viewportEl = containerRef.current?.parentElement;
      if (viewportEl) {
        viewportEl.scrollLeft += g.lastMid.x - mid.x;
        viewportEl.scrollTop += g.lastMid.y - mid.y;
        const vpRect = viewportEl.getBoundingClientRect();
        g.midX = mid.x - vpRect.left;
        g.midY = mid.y - vpRect.top;
      }
      g.lastMid = mid;

      // Pinch: CSS transform only during the gesture (no pdf.js re-render
      // per frame); the crisp re-render happens once on release.
      const nextZoom = gestureZoom(
        g.startZoom,
        g.startDist,
        touchDistance(p0, p1),
        gestureZoomLimit,
      );
      g.currentZoom = nextZoom;
      const wrap = pageWrapRef.current;
      if (wrap) {
        wrap.style.transform = `scale(${nextZoom / g.startZoom})`;
      }
      if (onGestureZoomPreview) {
        const now = Date.now();
        if (now - gesturePreviewAtRef.current > 90) {
          gesturePreviewAtRef.current = now;
          onGestureZoomPreview(Math.round(nextZoom));
        }
      }
    },
    [gestureZoomLimit, onGestureZoomPreview]
  );

  const handleGestureTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!gestureRef.current) return;
      if (e.touches.length >= 2) return;
      if (e.touches.length === 1) {
        gestureTailTouchIdRef.current = e.touches[0].identifier;
      }
      endGesture(true);
    },
    [endGesture]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("touchstart", handleGestureTouchStart, { passive: false });
    el.addEventListener("touchmove", handleGestureTouchMove, { passive: false });
    el.addEventListener("touchend", handleGestureTouchEnd);
    el.addEventListener("touchcancel", handleGestureTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleGestureTouchStart);
      el.removeEventListener("touchmove", handleGestureTouchMove);
      el.removeEventListener("touchend", handleGestureTouchEnd);
      el.removeEventListener("touchcancel", handleGestureTouchEnd);
      cancelGestureRef.current();
    };
  }, [handleGestureTouchStart, handleGestureTouchMove, handleGestureTouchEnd]);

  // Determine if selected field is snapped (for transformer behavior)
  const selectedFieldIsSnapped = selectedFieldId
    ? fields.find((f) => f.id === selectedFieldId)?.snapped ?? false
    : false;

  return (
    <div
      ref={containerRef}
      className="relative w-max min-w-full min-h-full bg-[#f0f0f0] p-4"
      data-testid="pdf-viewer"
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: activeTool || isDragging || isGesturing ? "none" : "pan-x pan-y" }}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-text-muted">Rendering PDF...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-xl bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div
        ref={pageWrapRef}
        className="relative mx-auto bg-white shadow-xl rounded-sm"
        data-testid="pdf-page"
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ width: dimensions.width, height: dimensions.height }}
        />

        <MediaOverlayLayer
          currentPage={currentPage}
          renderedPageSize={dimensions}
          pageBounds={
            viewportAtScale1?.pageIndex === currentPage
              ? {
                  widthPts: viewportAtScale1.width,
                  heightPts: viewportAtScale1.height,
                }
              : null
          }
          interactionEnabled={!activeTool && !isGesturing && !isCapturingPreview}
          hidden={loading || isCapturingPreview}
        />

        {/* Strong snap preview overlay */}
        {activeTool && snapPreview && (() => {
          // snapPreview is in PDF point space, convert to canvas pixels
          const effectiveScale = fitScale * zoomFactor;
          const snapW = snapPreview.width * effectiveScale;
          const snapH = snapPreview.height * effectiveScale;
          const isTiny = snapW < 28 || snapH < 28;
          return (
            <div
              className="snap-preview-highlight"
              style={{
                position: "absolute",
                left: snapPreview.x * effectiveScale,
                top: snapPreview.y * effectiveScale,
                width: Math.max(snapW, 20),
                height: Math.max(snapH, 20),
                border: `2px solid ${isTiny ? "rgba(59,130,246,0.5)" : "#3b82f6"}`,
                borderRadius: 3,
                backgroundColor: "rgba(59, 130, 246, 0.10)",
                pointerEvents: "none",
                zIndex: 10,
                opacity: snapPreviewOpacity,
                transition: "opacity 150ms ease-out, left 80ms ease-out, top 80ms ease-out, width 80ms ease-out, height 80ms ease-out",
              }}
            >
              {/* Only show label on non-tiny targets */}
              {!isTiny && (
                <div
                  style={{
                    position: "absolute",
                    top: -22,
                    left: 0,
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#3b82f6",
                    backgroundColor: "rgba(255,255,255,0.95)",
                    padding: "1px 6px",
                    borderRadius: 3,
                    border: "1px solid rgba(59,130,246,0.3)",
                    lineHeight: "16px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Snap here
                </div>
              )}
            </div>
          );
        })()}

        {/* Feature 1: Drag-to-draw rectangle overlay */}
        {drawRect && (
          <div
            style={{
              position: "absolute",
              left: drawRect.x,
              top: drawRect.y,
              width: drawRect.w,
              height: drawRect.h,
              border: "2px dashed #3b82f6",
              backgroundColor: "rgba(59,130,246,0.08)",
              borderRadius: 3,
              pointerEvents: "none",
              zIndex: 15,
            }}
          />
        )}

        {twoTapPlacementEnabled && pendingBoxCorner && (
          <>
            <div
              data-testid="box-first-corner-marker"
              style={{
                position: "absolute",
                left: pendingBoxCorner.x,
                top: pendingBoxCorner.y,
                width: 12,
                height: 12,
                transform: "translate(-50%, -50%)",
                border: "2px solid #0891b2",
                borderRadius: "9999px",
                backgroundColor: "#ffffff",
                boxShadow: "0 1px 3px rgba(15,23,42,0.25)",
                pointerEvents: "none",
                zIndex: 16,
              }}
            />
            <div
              data-testid="box-opposite-corner-hint"
              style={{
                position: "absolute",
                left: pendingBoxCorner.x + 12,
                top: pendingBoxCorner.y + 12,
                borderRadius: 6,
                backgroundColor: "rgba(15,23,42,0.92)",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 600,
                lineHeight: "18px",
                padding: "4px 8px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 16,
              }}
            >
              {pendingCornerHint}
            </div>
          </>
        )}

        {(() => {
          const selectedField = selectedFieldId ? pageFields.find(f => f.id === selectedFieldId) : null;
          const selectedFieldIsSnapped = selectedField?.snapped ?? false;
          return (
            <Stage
              ref={stageRef}
              width={dimensions.width}
              height={dimensions.height}
              scaleX={zoomFactor}
              scaleY={zoomFactor}
              listening={!isGesturing}
          onMouseDown={handleStageMouseDown}
          onMouseUp={handleStageMouseUp}
          onClick={handleStageClick}
          onTap={handleStageTap}
          onMouseMove={handleStageMouseMove}
          onMouseLeave={handleStageMouseLeave}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            cursor: activeTool ? cursorStyle : editingFieldId ? "text" : cursorStyle,
            touchAction: activeTool || isDragging || isGesturing ? "none" : "pan-x pan-y",
          }}
        >
          <Layer>
            {pageFields.map((field) => (
              <FieldShape
                key={field.id}
                field={field}
                fitScale={fitScale}
                zoomFactor={zoomFactor}
                fieldFitEnabled={fieldFitEnabled}
                formFidelityEnabled={formFidelityEnabled}
                combMobileEnabled={combMobileEnabled}
                isSelected={!isCapturingPreview && activeTool !== "mask-eraser" && field.id === selectedFieldId && field.type !== "whiteout"}
                isEditing={activeTool !== "mask-eraser" && field.id === editingFieldId}
                isHighlighted={!isCapturingPreview && (field.id === snappedFieldId || (highlightFieldIds?.has(field.id) ?? false))}
                isHovered={!isCapturingPreview && field.id === hoveredFieldId}
                isMobileEditor={isMobileEditor && !isCapturingPreview}
                activeTool={isPlacementTool(activeTool) ? activeTool : null}
                disableInteraction={
                  activeTool === "mask-eraser" ||
                  twoTapPlacementEnabled
                }
                onSelect={() => {
                  selectFieldForInteraction(field);
                  // Reset cursor for whiteout fields
                  if (field.type === "whiteout") {
                    setCursorStyle("default");
                  }
                }}
                onMouseEnter={() => {
                  // Whiteout fields don't hover - skip
                  if (field.type === "whiteout") return;
                  setHoveredFieldId(field.id);
                  if (!activeTool && !isDragging) {
                    setCursorStyle(field.snapped ? "pointer" : "move");
                  }
                }}
                onMouseLeave={() => {
                  // Whiteout fields don't hover - skip
                  if (field.type === "whiteout") return;
                  setHoveredFieldId(null);
                  if (!activeTool && !isDragging) {
                    setCursorStyle("default");
                  }
                }}
                onDragStart={() => {
                  // Whiteout fields don't drag - skip
                  if (field.type === "whiteout") return;
                  dragStartedRef.current = true;
                  onFieldSelect(field.id);
                  onToolSelect(null);
                  setIsDragging(true);
                  setEditingFieldId(null);
                  setCursorStyle("grabbing");
                }}
                onDragEnd={(x, y) => {
                  // Whiteout fields don't drag - skip
                  if (field.type === "whiteout") return;
                  setIsDragging(false);
                  setCursorStyle("move");
                  // Convert from Stage coords to PDF point space
                  onFieldUpdate(field.id, { x: x / fitScale, y: y / fitScale });
                  setTimeout(() => { dragStartedRef.current = false; }, 50);
                }}
                onTransformStart={() => {
                  setEditingFieldId(null);
                }}
                onTransformEnd={(width, height, x, y) => {
                  // Convert from Stage coords to PDF point space
                  onFieldUpdate(field.id, {
                    width: width / fitScale,
                    height: height / fitScale,
                    x: x / fitScale,
                    y: y / fitScale,
                  });
                }}
                onDoubleClick={() => {
                  if (field.type !== "comb") setEditingFieldId(field.id);
                }}
                onDelete={() => {
                  onFieldDelete(field.id);
                  if (selectedFieldId === field.id) onFieldSelect(null);
                }}
                onValueChange={(value) => {
                  if (field.type === "checkbox") {
                    // value is a CheckboxStamp when cycling
                    const stamp = value as CheckboxStamp;
                    onFieldUpdate(field.id, {
                      stamp,
                      checked: stamp !== "none",
                    } as Partial<EditorField>);
                  } else {
                    onFieldUpdate(field.id, { value } as Partial<EditorField>);
                  }
                }}
                onCombCursorChange={(cursorIndex) => {
                  if (field.type === "comb") {
                    onFieldUpdate(field.id, { cursorIndex } as Partial<EditorField>);
                  }
                }}
                onCombInputFocus={focusCombHiddenInput}
                registerNode={registerNode}
                unregisterNode={unregisterNode}
                onContextMenu={(e, fieldId) => {
                  // Use DOM client coordinates (scroll-safe), not stage coords
                  const nativeEvt = e.evt as MouseEvent;
                  openFieldContextMenu(nativeEvt.clientX, nativeEvt.clientY, fieldId);
                }}
              />
            ))}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              borderStroke="#3b82f6"
              anchorStroke="#3b82f6"
              anchorFill="#fff"
              anchorSize={isMobileEditor ? 14 : 8}
              // BUG 3 FIX: Always enable all 8 anchors for resizing
              // Remove the conditional that disabled anchors for snapped fields
              enabledAnchors={["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"]}
              keepRatio={keepRatio ?? false}
              boundBoxFunc={(oldBox, newBox) => {
                // Lines are not resizable via canvas - only draggable
                if (selectedField?.type === "line") {
                  return oldBox;
                }
                if (
                  (fieldFitEnabled &&
                    (selectedField?.type === "text" ||
                      selectedField?.type === "date" ||
                      selectedField?.type === "signature")) ||
                  (combMobileEnabled && selectedField?.type === "comb")
                ) {
                  const minimumScreenSize = 8 * fitScale * zoomFactor;
                  if (
                    newBox.width < minimumScreenSize ||
                    newBox.height < minimumScreenSize
                  ) {
                    return oldBox;
                  }
                  return newBox;
                }
                if (newBox.width < 16 || newBox.height < 16) return oldBox;
                return newBox;
              }}
            />
            {/* Line tool preview - ghost line following cursor */}
            {linePreview && activeTool === "line" && (
              <Line
                points={
                  (toolDefaults.line.orientation ?? "horizontal") === "horizontal"
                    ? [0, linePreview.y, dimensions.width, linePreview.y]
                    : [linePreview.x, 0, linePreview.x, dimensions.height]
                }
                stroke={toolDefaults.line.color ?? "#3b82f6"}
                strokeWidth={Math.max(1, (toolDefaults.line.strokeWidth ?? 1) * fitScale)}
                opacity={0.4}
                dash={[4, 4]}
                listening={false}
              />
            )}
            {/* Checkbox tool preview - ghost checkbox following cursor */}
            {checkboxPreview && activeTool === "checkbox" && (() => {
              const cbDefaults = toolDefaults.checkbox;
              const cbSize = (cbDefaults.size ?? 20) * fitScale;
              const stamp = cbDefaults.stamp ?? "tick";
              const color = cbDefaults.color ?? "#000000";
              const px = checkboxPreview.x;
              const py = checkboxPreview.y;
              const innerSize = cbSize * 0.88;
              const sw = Math.max(1.6, innerSize * 0.12);
              return (
                <Group x={px} y={py} opacity={0.4} listening={false}>
                  <Rect width={cbSize} height={cbSize} fill="rgba(0,0,0,0)" />
                  {stamp === "none" && (
                    <Rect
                      width={cbSize}
                      height={cbSize}
                      stroke={color}
                      strokeWidth={1.5}
                      fill="transparent"
                    />
                  )}
                  {stamp === "tick" && (
                    <Line
                      points={[cbSize * 0.2, cbSize * 0.55, cbSize * 0.42, cbSize * 0.78, cbSize * 0.82, cbSize * 0.24]}
                      stroke={color}
                      strokeWidth={sw}
                      lineCap="round"
                      lineJoin="round"
                    />
                  )}
                  {stamp === "cross" && (
                    <>
                      <Line points={[cbSize * 0.24, cbSize * 0.24, cbSize * 0.76, cbSize * 0.76]} stroke={color} strokeWidth={sw} lineCap="round" />
                      <Line points={[cbSize * 0.76, cbSize * 0.24, cbSize * 0.24, cbSize * 0.76]} stroke={color} strokeWidth={sw} lineCap="round" />
                    </>
                  )}
                </Group>
              );
            })()}
            {maskCursor && activeTool === "mask-eraser" && (() => {
              const brushSize = maskEraserSize / zoomFactor;
              return (
                <Rect
                  x={maskCursor.x / zoomFactor - brushSize / 2}
                  y={maskCursor.y / zoomFactor - brushSize / 2}
                  width={brushSize}
                  height={brushSize}
                  stroke="#dc2626"
                  strokeWidth={1.5}
                  dash={[4, 3]}
                  fill="rgba(220,38,38,0.08)"
                  listening={false}
                />
              );
            })()}
          </Layer>
        </Stage>
          );
        })()}

        {/* Feature 3: Context menu */}
        {contextMenu && (
          <div
            style={{
              position: "absolute",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 100,
            }}
          >
            <div className="bg-white rounded-lg shadow-lg border border-border py-1 min-w-[140px]">
              {(() => {
                const ctxField = pageFields.find(f => f.id === contextMenu.fieldId);
                if (!ctxField || ctxField.type !== "signature") return null;
                return (
                  <div
                    className="px-4 py-2 text-sm hover:bg-surface cursor-pointer flex items-center gap-2"
                    onClick={() => {
                      onSignatureRequest?.(contextMenu.fieldId);
                      setContextMenu(null);
                    }}
                  >
                    <span>✍️</span> Re-sign
                  </div>
                );
              })()}
              <div
                className="px-4 py-2 text-sm hover:bg-surface cursor-pointer flex items-center gap-2"
                onClick={() => {
                  // Route through the unified duplicate handler so right-click
                  // matches the Duplicate button and mobile sheet (same offset,
                  // clamping, selection, and analytics).
                  onFieldDuplicate?.(contextMenu.fieldId);
                  setContextMenu(null);
                }}
              >
                <span>📋</span> Duplicate
              </div>
              <div
                className="px-4 py-2 text-sm hover:bg-surface cursor-pointer flex items-center gap-2"
                onClick={() => {
                  onFieldDelete(contextMenu.fieldId);
                  if (selectedFieldId === contextMenu.fieldId) onFieldSelect(null);
                  setContextMenu(null);
                }}
              >
                <span>🗑️</span> Delete
              </div>
            </div>
          </div>
        )}

        {/* Feature 3: Snapped field lock indicator overlay */}
        {selectedFieldId && (() => {
          const selectedField = pageFields.find(f => f.id === selectedFieldId);
          if (!selectedField || !selectedField.snapped) return null;
          const lockEffectiveScale = fitScale * zoomFactor;
          return (
            <div
              style={{
                position: "absolute",
                left: selectedField.x * lockEffectiveScale + 2,
                top: selectedField.y * lockEffectiveScale + 2,
                fontSize: 10,
                opacity: 0.4,
                pointerEvents: "none",
                zIndex: 25,
              }}
            >
              🔒
            </div>
          );
        })()}

        {combMobileEnabled &&
          selectedFieldId &&
          (() => {
            const combField = pageFields.find(
              (field) =>
                field.id === selectedFieldId && field.type === "comb",
            );
            if (!combField) return null;
            const effectiveScale = fitScale * zoomFactor;

            return (
              <input
                key={combField.id}
                ref={combHiddenInputRef}
                type="text"
                value={COMB_HIDDEN_INPUT_SENTINEL}
                tabIndex={-1}
                aria-label="Edit box field"
                data-testid="comb-hidden-input"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoCapitalize="characters"
                style={{
                  position: "absolute",
                  left: combField.x * effectiveScale,
                  top: combField.y * effectiveScale,
                  width: 1,
                  height: 1,
                  padding: 0,
                  border: 0,
                  opacity: 0.01,
                  overflow: "hidden",
                  clip: "rect(0 0 0 0)",
                  clipPath: "inset(50%)",
                  fontSize: 16,
                  pointerEvents: "none",
                  zIndex: 30,
                }}
                onFocus={(event) =>
                  resetCombHiddenInput(event.currentTarget)
                }
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Backspace") {
                    event.preventDefault();
                    applyCombHiddenInputAction("backspace");
                    resetCombHiddenInput(event.currentTarget);
                    return;
                  }
                  if (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowRight"
                  ) {
                    event.preventDefault();
                    applyCombHiddenInputAction(
                      event.key === "ArrowLeft" ? "left" : "right",
                    );
                    resetCombHiddenInput(event.currentTarget);
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                onInput={(event) =>
                  resetCombHiddenInput(event.currentTarget)
                }
                onChange={(event) =>
                  resetCombHiddenInput(event.currentTarget)
                }
              />
            );
          })()}

        {/* HTML input overlay for text editing */}
        {editingFieldId &&
          (() => {
            const editField = pageFields.find((f) => f.id === editingFieldId);
            if (!editField || editField.type === "checkbox") return null;
            // Signature fields never use text input, always use SignatureModal
            if (editField.type === "signature") return null;
            // Whiteout fields have no text value
            if (editField.type === "whiteout") return null;
            // Grid and Comb fields use their own per-cell input handling
            // Comb (Box Field) uses its own per-cell input handling
            if (editField.type === "comb") return null;
            if (editField.type === "line") return null;
            const isEditSnapped = editField.snapped ?? false;
            // Convert from PDF point space to canvas pixels
            const effectiveScale = fitScale * zoomFactor;
            const requestedEditorFontSize =
              (editField as { fontSize?: number }).fontSize ?? 14;
            const formFidelityMultilineEditor =
              formFidelityEnabled &&
              editField.type === "text" &&
              (editField.multiline === true ||
                editField.value.includes("\n"));
            const editorPaddingPoints =
              fieldFitEnabled || formFidelityMultilineEditor
              ? fitOverlayTextPadding(
                  editField.width,
                  editField.height,
                  isEditSnapped ? 2 : 4,
                )
              : isEditSnapped
                ? 2
                : 4;
            const multilineEditorLayout = formFidelityMultilineEditor
              ? fitMultilineOverlayText(
                  sanitizeMultiline(editField.value),
                  Math.max(
                    0,
                    editField.width - editorPaddingPoints * 2,
                  ),
                  editField.height,
                  editorOverlayFontMetrics,
                  requestedEditorFontSize,
                  editorPaddingPoints,
                )
              : null;
            const fittedEditorFontSize = multilineEditorLayout
              ? multilineEditorLayout.fontSize
              : fieldFitEnabled
              ? fitOverlayFontSize(
                  editField.height,
                  requestedEditorFontSize,
                  standardOverlayTextHeightAtSize,
                  editorPaddingPoints,
                )
              : requestedEditorFontSize;
            const editorFontSize =
              fieldFitEnabled || formFidelityMultilineEditor
              ? fittedEditorFontSize * effectiveScale
              : Math.max(16, requestedEditorFontSize * effectiveScale);
            const editorPadding =
              fieldFitEnabled || formFidelityMultilineEditor
              ? editorPaddingPoints * effectiveScale
              : isEditSnapped
                ? 2
                : 4;
            // On small screens the fit scale shrinks fields below the 16px
            // font floor, which clips typed text. Give the input enough
            // height and a readable background so users can see what they
            // type. Desktop keeps the exact field box and transparency.
            const isSmallScreen =
              typeof window !== "undefined" &&
              typeof window.matchMedia === "function" &&
              window.matchMedia("(max-width: 1023px)").matches;
            const editorHeight =
              fieldFitEnabled || formFidelityMultilineEditor
              ? editField.height * effectiveScale
              : isSmallScreen
                ? Math.max(editField.height * effectiveScale, editorFontSize + 8)
                : editField.height * effectiveScale;
            const EditorElement = formFidelityMultilineEditor
              ? "textarea"
              : "input";

            return (
              <EditorElement
                key={editingFieldId}
                autoFocus
                type={formFidelityMultilineEditor ? undefined : "text"}
                data-testid="pdf-field-editor"
                className="absolute z-20 outline-none"
                style={{
                  left: editField.x * effectiveScale,
                  top: editField.y * effectiveScale,
                  width: editField.width * effectiveScale,
                  height: editorHeight,
                  fontSize: editorFontSize,
                  fontFamily: "Arial, sans-serif",
                  color: "#1a1a2e",
                  cursor: "text",
                  // Match Konva text padding exactly so text aligns
                  paddingLeft: editorPadding,
                  paddingRight: editorPadding,
                  paddingTop: formFidelityMultilineEditor
                    ? editorPadding
                    : 0,
                  paddingBottom: formFidelityMultilineEditor
                    ? editorPadding
                    : 0,
                  boxSizing: "border-box",
                  ...(fieldFitEnabled || formFidelityMultilineEditor
                    ? {
                        lineHeight: `${
                          (multilineEditorLayout?.lineHeight ??
                            standardOverlayTextHeightAtSize(
                              fittedEditorFontSize,
                            )) * effectiveScale
                        }px`,
                      }
                    : {}),
                  // Desktop: fully transparent so the field box shows through.
                  // Small screens: near-solid white so typed text stays legible.
                  backgroundColor: isSmallScreen ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0)",
                  background: isSmallScreen ? "rgba(255,255,255,0.95)" : "none",
                  WebkitAppearance: "none",
                  // Underline only while editing
                  border: "none",
                  borderBottom: "1.5px solid rgba(59,130,246,0.7)",
                  // No scrollbar, text just extends right
                  overflow: "hidden",
                  whiteSpace: formFidelityMultilineEditor
                    ? "pre-wrap"
                    : "nowrap",
                  resize: formFidelityMultilineEditor ? "none" : undefined,
                }}
                value={editField.value}
                placeholder={
                  editField.type === "date"
                    ? DATE_STAMP_PLACEHOLDER
                    : "Type here..."
                }
                onChange={(
                  e: React.ChangeEvent<
                    HTMLInputElement | HTMLTextAreaElement
                  >,
                ) => {
                  const newValue = e.target.value;
                  onFieldUpdate(editField.id, { value: newValue } as Partial<EditorField>);

                  if (formFidelityMultilineEditor) return;

                  // Auto-expand field width if text overflows
                  const fontSize = fieldFitEnabled
                    ? editorFontSize
                    : requestedEditorFontSize * effectiveScale;
                  const padding = fieldFitEnabled
                    ? editorPadding * 2
                    : (isEditSnapped ? 2 : 4) * 2;
                  // Measure text width using canvas
                  const canvas = document.createElement("canvas");
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    ctx.font = `${fontSize}px Arial, sans-serif`;
                    const textWidth = ctx.measureText(newValue).width + padding + 8;
                    const currentWidth = editField.width * effectiveScale;
                    if (textWidth > currentWidth) {
                      // Expand field to fit text, in PDF point space
                      onFieldUpdate(editField.id, {
                        value: newValue,
                        width: Math.ceil(textWidth / effectiveScale),
                      } as Partial<EditorField>);
                    }
                  }
                }}
                onBlur={() => setEditingFieldId(null)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Escape" ||
                    (!formFidelityMultilineEditor && e.key === "Enter")
                  ) {
                    setEditingFieldId(null);
                  }
                  e.stopPropagation();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openFieldContextMenu(e.clientX, e.clientY, editField.id);
                }}
              />
            );
          })()}
      </div>
    </div>
  );
});

/** Hook to load an HTMLImageElement from a data URL */
function useLoadedImage(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  return image;
}

// Individual field component
function FieldShape({
  field,
  fitScale,
  zoomFactor,
  fieldFitEnabled,
  formFidelityEnabled,
  combMobileEnabled,
  isSelected,
  isEditing,
  isHighlighted,
  isHovered,
  isMobileEditor,
  activeTool,
  disableInteraction,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragEnd,
  onTransformStart,
  onTransformEnd,
  onDoubleClick,
  onValueChange,
  onCombCursorChange,
  onCombInputFocus,
  onDelete,
  registerNode,
  unregisterNode,
  onContextMenu,
}: {
  field: EditorField;
  fitScale: number;
  zoomFactor: number;
  fieldFitEnabled: boolean;
  formFidelityEnabled: boolean;
  combMobileEnabled: boolean;
  isSelected: boolean;
  isEditing: boolean;
  isHighlighted: boolean;
  isHovered: boolean;
  isMobileEditor: boolean;
  activeTool?: PlacementToolType | null;
  disableInteraction?: boolean;
  onSelect: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onDragStart?: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformStart?: () => void;
  onTransformEnd: (w: number, h: number, x: number, y: number) => void;
  onDoubleClick: () => void;
  onValueChange: (value: string | boolean | CheckboxStamp) => void;
  onCombCursorChange?: (cursorIndex: number) => void;
  onCombInputFocus?: () => void;
  onDelete: () => void;
  registerNode: (id: string, node: Konva.Group) => void;
  unregisterNode: (id: string) => void;
  onContextMenu?: (e: any, fieldId: string) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);

  const maskDependency = field.eraseMasks
    ?.map((mask) => `${mask.x}:${mask.y}:${mask.width}:${mask.height}`)
    .join("|") ?? "";

  useLayoutEffect(() => {
    const node = groupRef.current;
    if (!node) return;

    if (field.eraseMasks?.length && field.type !== "comb" && field.type !== "whiteout") {
      const effectivePixelRatio = Math.min((window.devicePixelRatio || 1) * zoomFactor, 4);
      node.cache(maskCacheConfig(field, fitScale, effectivePixelRatio));
      node.getLayer()?.batchDraw();
      return;
    }

    node.clearCache();
    node.getLayer()?.batchDraw();
  }, [field.type, field.width, field.height, fitScale, maskDependency, zoomFactor]);

  // Register/unregister this field's node with the global transformer (skip for whiteout - static)
  // BUG 3 FIX: Signature fields MUST register with Transformer for resize to work
  useEffect(() => {
    if (field.type === "whiteout" || field.type === "line" || field.type === "checkbox") return;
    const node = groupRef.current;
    if (!node) return;
    registerNode(field.id, node);
    return () => {
      unregisterNode(field.id);
    };
  }, [field.id, field.type, registerNode, unregisterNode]);

  const [dragOpacity, setDragOpacity] = useState(1);
  const lastTapHandledAt = useRef(0);

  const isSnapped = field.snapped ?? false;
  const canDragField = field.type === "signature" || isMobileEditor || !isSnapped;
  const mobileHitStrokeWidth = isMobileEditor ? 24 : "auto";

  const markTapHandled = () => {
    lastTapHandledAt.current = Date.now();
  };

  const wasRecentTap = () => Date.now() - lastTapHandledAt.current < 500;

  const handleSelectClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (wasRecentTap()) return;
    onSelect();
  };

  const handleSelectTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    e.cancelBubble = true;
    markTapHandled();
    onSelect();
  };

  const hasValue = field.type === "checkbox" ? field.checked : !!(field as {value?: string}).value;

  const getBorderColor = () => {
    if (isHighlighted) return "#2563eb";
    if (isSelected || isEditing) return "#3b82f6";
    if (isHovered) return "rgba(59, 130, 246, 0.5)";
    if (isSnapped) return "rgba(59, 130, 246, 0.2)";
    // Hide border entirely when field has a value (looks clean on PDF)
    if (hasValue) return "transparent";
    return "rgba(79,142,247,0.25)";
  };
  const getBorderWidth = () => {
    if (isHighlighted) return 2.5;
    if (isSelected || isEditing) return 2;
    if (isHovered) return 1.5;
    if (hasValue && !isSnapped) return 0;
    return 1;
  };
  const getFill = () => {
    if (isHighlighted) return "rgba(59, 130, 246, 0.08)";
    if (isSelected || isEditing) return "rgba(59, 130, 246, 0.05)";
    if (isHovered) return "rgba(59, 130, 246, 0.03)";
    return "transparent";
  };

  // Scale field coordinates from PDF points to Stage coords
  const stageX = field.x * fitScale;
  const stageY = field.y * fitScale;
  const stageW = field.width * fitScale;
  const stageH = field.height * fitScale;
  const eraseMaskRects = field.eraseMasks?.map((mask, index) => (
    <Rect
      key={`${index}-${mask.x}-${mask.y}-${mask.width}-${mask.height}`}
      x={(mask.x - field.x) * fitScale}
      y={(mask.y - field.y) * fitScale}
      width={mask.width * fitScale}
      height={mask.height * fitScale}
      fill={MASK_ERASE_FILL}
    />
  ));
  const eraseMaskLayer = eraseMaskRects?.length ? (
    <Group globalCompositeOperation="destination-out" listening={false} opacity={1}>
      {eraseMaskRects}
    </Group>
  ) : null;
  const groupOpacity = eraseMaskRects?.length ? 1 : dragOpacity;

  if (field.type === "checkbox") {
    return (
      <>
        <Group
          id={field.id}
          ref={groupRef}
          x={stageX}
          y={stageY}
          width={stageW}
          height={stageH}
          opacity={groupOpacity}
          listening={!disableInteraction}
          draggable={!disableInteraction && canDragField}
        onMouseEnter={() => onMouseEnter?.()}
        onMouseLeave={() => onMouseLeave?.()}
        onClick={(e) => {
          if (activeTool === "checkbox") return;
          e.cancelBubble = true;
          if (wasRecentTap()) return;
          onSelect();
        }}
        onTap={(e) => {
          if (activeTool === "checkbox") return;
          e.cancelBubble = true;
          markTapHandled();
          onSelect();
        }}
        onDragStart={() => {
          setDragOpacity(0.85);
          onDragStart?.();
        }}
        onDragEnd={(e) => {
          setDragOpacity(1);
          onDragEnd(e.target.x(), e.target.y());
        }}
        onTransformEnd={(e) => {
          const node = e.target;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onTransformEnd(
            Math.max(16, node.width() * scaleX),
            Math.max(16, node.height() * scaleY),
            node.x(),
            node.y()
          );
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          onContextMenu?.(e, field.id);
        }}
      >
        <Rect
          width={stageW}
          height={stageH}
          fill="rgba(0,0,0,0)"
          hitStrokeWidth={mobileHitStrokeWidth}
        />
        {/* Drag shadow, "lifted" feel without hiding the stamp */}
        {groupOpacity < 1 && (
          <Rect
            width={stageW}
            height={stageH}
            fill="transparent"
            hitStrokeWidth={mobileHitStrokeWidth}
            shadowColor="rgba(0,0,0,0.25)"
            shadowBlur={8}
            shadowOffsetY={3}
          />
        )}
        {/* Selection/hover indicator, subtle dashed border, only on interact */}
        {(isSelected || isHovered || isHighlighted) && (
          <Rect
            width={stageW}
            height={stageH}
            fill="transparent"
            stroke={isHighlighted ? "#2563eb" : isSelected ? "#3b82f6" : "rgba(59,130,246,0.4)"}
            strokeWidth={isHighlighted ? 2 : isSelected ? 1.5 : 1}
            hitStrokeWidth={mobileHitStrokeWidth}
            cornerRadius={2}
            dash={isSelected ? undefined : [3, 2]}
          />
        )}
        {/* Stamp, bold tick or cross, like pen on paper */}
        {(() => {
          const stamp: CheckboxStamp = (field as { stamp?: CheckboxStamp }).stamp ?? (field.checked ? "tick" : "none");
          const stampColor = (field as { color?: string }).color ?? "#121726";
          if (stamp === "none") {
            return (
              <Rect
                width={stageW}
                height={stageH}
                stroke={stampColor}
                strokeWidth={1.5}
                fill="transparent"
                hitStrokeWidth={0}
              />
            );
          }
          const size = Math.min(stageW, stageH) * 0.88;
          const strokeWidth = Math.max(1.6, size * 0.12);
          if (stamp === "tick") {
            return (
              <Line
                points={[
                  stageW * 0.2,
                  stageH * 0.55,
                  stageW * 0.42,
                  stageH * 0.78,
                  stageW * 0.82,
                  stageH * 0.24,
                ]}
                stroke={stampColor}
                strokeWidth={strokeWidth}
                lineCap="round"
                lineJoin="round"
              />
            );
          }

          return (
            <>
              <Line points={[stageW * 0.24, stageH * 0.24, stageW * 0.76, stageH * 0.76]} stroke={stampColor} strokeWidth={strokeWidth} lineCap="round" />
              <Line points={[stageW * 0.76, stageH * 0.24, stageW * 0.24, stageH * 0.76]} stroke={stampColor} strokeWidth={strokeWidth} lineCap="round" />
            </>
          );
        })()}
        {eraseMaskLayer}
        </Group>
      </>
    );
  }

  if (field.type === "line") {
    const lineField = field as LineField;
    const isHorizontal = lineField.orientation !== "vertical";
    const visibleStrokeWidth = Math.max(1, lineField.strokeWidth * fitScale);
    const hitWidth = isHorizontal ? stageW : Math.max(stageW, 12);
    const hitHeight = isHorizontal ? Math.max(stageH, 12) : stageH;

    return (
      <>
        <Group
          id={field.id}
          ref={groupRef}
          x={stageX}
          y={stageY}
          width={stageW}
          height={stageH}
          opacity={groupOpacity}
          listening={!disableInteraction}
          draggable={!disableInteraction && canDragField}
          onMouseEnter={() => onMouseEnter?.()}
          onMouseLeave={() => onMouseLeave?.()}
          onClick={handleSelectClick}
          onTap={handleSelectTap}
          onDragStart={() => {
            setDragOpacity(0.85);
            onDragStart?.();
          }}
          onDragEnd={(e) => {
            setDragOpacity(1);
            onDragEnd(e.target.x(), e.target.y());
          }}
          onTransformEnd={(e) => {
            const node = e.target;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            onTransformEnd(
              Math.max(4, node.width() * scaleX),
              Math.max(4, node.height() * scaleY),
              node.x(),
              node.y()
            );
          }}
          onContextMenu={(e) => {
            e.evt.preventDefault();
            onContextMenu?.(e, field.id);
          }}
        >
          <Rect
            x={isHorizontal ? 0 : (stageW - hitWidth) / 2}
            y={isHorizontal ? (stageH - hitHeight) / 2 : 0}
            width={hitWidth}
            height={hitHeight}
            fill="rgba(0,0,0,0)"
          />
          <Line
            points={
              isHorizontal
                ? [0, stageH / 2, stageW, stageH / 2]
                : [stageW / 2, 0, stageW / 2, stageH]
            }
            stroke={lineField.color ?? "#000000"}
            strokeWidth={visibleStrokeWidth}
            lineCap="round"
          />
          {eraseMaskLayer}
          {(isSelected || isHovered || isHighlighted) && (
            <Rect
              width={stageW}
              height={stageH}
              fill="transparent"
              stroke={isHighlighted ? "#2563eb" : isSelected ? "#3b82f6" : "rgba(59,130,246,0.4)"}
              strokeWidth={isHighlighted ? 2 : 1.5}
              dash={isSelected ? undefined : [3, 2]}
            />
          )}
        </Group>
      </>
    );
  }

  // Whiteout field - static rectangle, no interaction after placement
  if (field.type === "whiteout") {
    const whiteoutField = field as WhiteoutField;
    return (
      <Group
        x={stageX}
        y={stageY}
        listening={false} // Entire group ignores ALL mouse events
      >
        <Rect
          width={stageW}
          height={stageH}
          fill={whiteoutField.fillColor}
          strokeWidth={0}
        />
      </Group>
    );
  }

  // Grid/Comb field rendering - individual character slots with OTP-style input
  // MUST come before generic text field handling to avoid being swallowed by the default return
  // Box Field (comb) rendering - individual character slots
  if (field.type === "comb") {
    const combField = field as CombField;
    const charCount = combField.charCount ?? 9;
    // Use cellWidth if set, otherwise calculate from field width (in PDF points)
    const slotWidthPdf = combField.cellWidth ?? (field.width / charCount);
    const slotWidth = slotWidthPdf * fitScale;
    const slotHeight = stageH;
    const value = combField.value || "";
    const offsetX = (combField.offsetX ?? 0) * fitScale;
    const offsetY = formFidelityEnabled
      ? (combField.offsetY ?? 0) * fitScale
      : 0;
    const charOffsetX = (combField.charOffsetX ?? 0) * fitScale;
    // Non-uniform cell positions (for TFN-style fields with gaps) - scale to Stage coords
    const cellPositions = combField.cellPositions?.map(p => p * fitScale);
    const cellWidthsArr = combField.cellWidths?.map(w => w * fitScale);
    
    // Use persisted cursor from field data, or default to end of current value
    const initialCursor = combField.cursorIndex ?? Math.min(value.replace(/ +$/, "").length, charCount - 1);
    const [activeSlotIndex, setActiveSlotIndex] = useState(initialCursor);
    const activeSlotIndexRef = useRef(initialCursor);

    useEffect(() => {
      const nextCursor = combField.cursorIndex ?? Math.min(value.replace(/ +$/, "").length, charCount - 1);
      setActiveSlotIndex(nextCursor);
      activeSlotIndexRef.current = nextCursor;
    }, [combField.cursorIndex, value, charCount]);

    const handleSlotClick = (index: number) => {
      setActiveSlotIndex(index);
      activeSlotIndexRef.current = index;
      onCombCursorChange?.(index);
    };

    return (
      <>
        <Group
          id={field.id}
          ref={groupRef}
          x={stageX}
          y={stageY}
          width={stageW}
          height={stageH}
          opacity={groupOpacity}
          listening={!disableInteraction}
          draggable={!disableInteraction && canDragField}
          onMouseEnter={() => onMouseEnter?.()}
          onMouseLeave={() => onMouseLeave?.()}
          onClick={handleSelectClick}
          onTap={handleSelectTap}
          onDragStart={() => {
            setDragOpacity(0.85);
            onDragStart?.();
          }}
          onDragEnd={(e) => {
            setDragOpacity(1);
            onDragEnd(e.target.x(), e.target.y());
          }}
          onTransformEnd={(e) => {
            const node = e.target;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const rawWidth = Math.max(
              combMobileEnabled ? 8 * fitScale : 40,
              node.width() * scaleX,
            );
            const rawHeight = Math.max(
              combMobileEnabled ? 8 * fitScale : 20,
              node.height() * scaleY,
            );
            const currentCharCount = combField.charCount ?? 9;
            const cellSize = stageW / currentCharCount;
            const maxCount = 30;
            const newCharCount = Math.min(maxCount, Math.max(1, Math.round(rawWidth / cellSize)));
            const snappedWidth = newCharCount * cellSize;
            onTransformEnd(snappedWidth, rawHeight, node.x(), node.y());
          }}
          onContextMenu={(e) => {
            e.evt.preventDefault();
            onContextMenu?.(e, field.id);
          }}
        >
          {/* Background */}
          <Rect
            width={stageW}
            height={stageH}
            fill={getFill()}
            stroke={getBorderColor()}
            strokeWidth={getBorderWidth()}
            hitStrokeWidth={mobileHitStrokeWidth}
            cornerRadius={3}
          />
          
          {/* Individual character slots */}
          {Array.from({ length: charCount }).map((_, i) => {
            const char = value[i] || "";
            const isFilled = char !== "" && char !== " ";
            const isCurrent = i === activeSlotIndex;
            
            // Use detected cell positions if available (non-uniform spacing)
            // cellPositions stores the CENTER of each cell relative to field X
            // We need to calculate the left edge for the Group position
            // Use cellPositions for this specific index if it exists
            const hasCellPosition = cellPositions && cellPositions[i] !== undefined;
            const hasCellWidth = cellWidthsArr && cellWidthsArr[i] !== undefined;
            const thisCellWidth = hasCellWidth ? cellWidthsArr[i] : slotWidth;
            const cellCenterX = hasCellPosition ? cellPositions[i] : (i * slotWidth + slotWidth / 2);
            const cellLeftX = cellCenterX - thisCellWidth / 2;
            
            return (
              <Group
                key={i}
                x={cellLeftX + offsetX}
                y={offsetY}
                width={thisCellWidth}
                height={slotHeight}
                onClick={(e) => {
                  e.cancelBubble = true;
                  if (wasRecentTap()) return;
                  handleSlotClick(i);
                  // Also select the field if not already selected
                  if (!isSelected) {
                    onSelect();
                  }
                }}
                onTap={(e) => {
                  if (combMobileEnabled) e.evt.preventDefault();
                  e.cancelBubble = true;
                  markTapHandled();
                  handleSlotClick(i);
                  if (!isSelected) {
                    onSelect();
                  }
                  onCombInputFocus?.();
                }}
              >
                {/* Slot border - only visible when selected or hovered */}
                <Rect
                  width={thisCellWidth - 1}
                  height={slotHeight}
                  fill={isCurrent && isSelected ? "rgba(59,130,246,0.18)" : isSelected ? "rgba(59,130,246,0.05)" : "transparent"}
                  stroke={isCurrent && isSelected ? "#3b82f6" : isSelected ? "rgba(59,130,246,0.4)" : "transparent"}
                  strokeWidth={isCurrent && isSelected ? 2.5 : isSelected ? 1 : 0}
                  hitStrokeWidth={mobileHitStrokeWidth}
                />
                {/* Character centered in slot */}
                {char && char !== " " && (
                  <Text
                    text={char}
                    x={charOffsetX}
                    fontSize={slotHeight * 0.6}
                    fill="#1a1a2e"
                    fontFamily="Arial"
                    width={thisCellWidth}
                    height={slotHeight}
                    align="center"
                    verticalAlign="middle"
                  />
                )}
                {/* Cursor indicator for active slot when selected */}
                {isCurrent && isSelected && (
                  <Rect
                    x={thisCellWidth / 2 - 1}
                    y={slotHeight * 0.15}
                    width={2}
                    height={slotHeight * 0.7}
                    fill="#3b82f6"
                  />
                )}
              </Group>
            );
          })}
        </Group>
      </>
    );
  }

  // Text, date, signature fields (NOT grid/comb - handled above)
  const sigDataUrl = field.type === "signature" ? (field as SignatureField).signatureDataUrl : undefined;
  const sigImage = useLoadedImage(sigDataUrl);
  const hasSignatureImage = field.type === "signature" && !!sigDataUrl && !!sigImage;

  const rawDisplayValue =
    hasSignatureImage
      ? ""
      : field.value ||
        (field.type === "signature"
          ? "Click to sign"
          : field.type === "date"
          ? "Click for date"
          : "Click to type...");
  const isEmpty = !field.value && !hasSignatureImage;
  const requestedOverlayFontSize =
    field.type === "signature"
      ? 16
      : (field as { fontSize?: number }).fontSize ?? 14;
  const preferredOverlayPadding = isSnapped ? 2 : 4;
  const overlayPaddingPoints = fieldFitEnabled
    ? fitOverlayTextPadding(
        field.width,
        field.height,
        preferredOverlayPadding,
      )
    : preferredOverlayPadding;
  const formFidelityMultiline =
    formFidelityEnabled &&
    field.type === "text" &&
    (field.multiline === true || field.value.includes("\n"));
  const multilineOverlayLayout = formFidelityMultiline
    ? fitMultilineOverlayText(
        sanitizeMultiline(field.value),
        Math.max(0, field.width - overlayPaddingPoints * 2),
        field.height,
        editorOverlayFontMetrics,
        requestedOverlayFontSize,
        overlayPaddingPoints,
      )
    : null;
  const displayValue = multilineOverlayLayout
    ? multilineOverlayLayout.lines.join("\n")
    : rawDisplayValue;
  const fittedOverlayFontSize = multilineOverlayLayout
    ? multilineOverlayLayout.fontSize
    : fieldFitEnabled
    ? fitOverlayFontSize(
        field.height,
        requestedOverlayFontSize,
        standardOverlayTextHeightAtSize,
        overlayPaddingPoints,
      )
    : requestedOverlayFontSize;
  const overlayFontSize = fittedOverlayFontSize * fitScale;
  const overlayPadding = fieldFitEnabled || formFidelityMultiline
    ? overlayPaddingPoints * fitScale
    : preferredOverlayPadding;
  const overlayWidth = fieldFitEnabled || formFidelityMultiline
    ? stageW
    : stageW - (isSnapped ? 4 : 8);

  // BUG 3 FIX: Signature fields must register with Transformer and be draggable
  // Signature fields should NOT be snapped (they use click-to-place, not snap detection)
  const signatureCanResize = field.type === "signature" && !isSnapped;

  return (
    <>
      <Group
        id={field.id}
        ref={groupRef}
        x={stageX}
        y={stageY}
        width={stageW}
        height={stageH}
        opacity={groupOpacity}
        // BUG 3 FIX: Signature fields are always draggable (never snapped)
        listening={!disableInteraction}
        draggable={!disableInteraction && canDragField}
        onMouseEnter={() => onMouseEnter?.()}
        onMouseLeave={() => onMouseLeave?.()}
        onClick={handleSelectClick}
        onTap={handleSelectTap}
        onDblClick={(e) => {
          e.cancelBubble = true;
          onDoubleClick();
        }}
        onDragStart={() => {
          setDragOpacity(0.85);
          onDragStart?.();
        }}
        onDragEnd={(e) => {
          setDragOpacity(1);
          onDragEnd(e.target.x(), e.target.y());
        }}
        onTransformStart={() => onTransformStart?.()}
        onTransformEnd={(e) => {
          const node = e.target;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          if (fieldFitEnabled) {
            onTransformEnd(
              Math.max(8 * fitScale, node.width() * scaleX),
              Math.max(8 * fitScale, node.height() * scaleY),
              node.x(),
              node.y()
            );
            return;
          }
          onTransformEnd(
            Math.max(40, node.width() * scaleX),
            Math.max(20, node.height() * scaleY),
            node.x(),
            node.y()
          );
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          onContextMenu?.(e, field.id);
        }}
      >
        <Rect
          // BUG FIX: Rect must match Group dimensions exactly - no padding subtraction
          width={stageW}
          height={stageH}
          fill={
            field.type === "signature"
              ? (hasSignatureImage ? "transparent" : (isSelected || isHovered ? "rgba(79,142,247,0.06)" : "rgba(249,250,251,0.8)"))
              : getFill()
          }
          stroke={
            field.type === "signature"
              ? (hasSignatureImage
                  ? (isSelected ? "rgba(59,130,246,0.4)" : isHovered ? "rgba(59,130,246,0.2)" : "transparent")
                  : (isSelected ? "#3b82f6" : isHovered ? "rgba(59,130,246,0.5)" : "rgba(79,142,247,0.35)"))
              : getBorderColor()
          }
          strokeWidth={isSelected ? (isMobileEditor ? 2 : 1.5) : isMobileEditor ? getBorderWidth() : 0}
          hitStrokeWidth={mobileHitStrokeWidth}
          dash={field.type === "signature" && !hasSignatureImage ? [4, 3] : undefined}
          cornerRadius={isSnapped ? 3 : 4}
        />
        {hasSignatureImage && sigImage ? (
          (() => {
            const pad = 4;
            const maxW = stageW - pad;
            const maxH = stageH - pad;
            const scale = Math.min(maxW / sigImage.naturalWidth, maxH / sigImage.naturalHeight);
            const drawW = sigImage.naturalWidth * scale;
            const drawH = sigImage.naturalHeight * scale;
            const sigField = field as SignatureField;
            const sigOpacity = clampSignatureOpacity(sigField.opacity);
            const sigRotation = clampSignatureRotation(sigField.rotation);
            return (
              <KonvaImage
                image={sigImage}
                x={stageW / 2}
                y={stageH / 2}
                width={drawW}
                height={drawH}
                offsetX={drawW / 2}
                offsetY={drawH / 2}
                rotation={sigRotation}
                scaleX={sigField.flipH ? -1 : 1}
                opacity={sigOpacity}
              />
            );
          })()
        ) : field.type === "signature" && (!fieldFitEnabled || !field.value) ? (
          /* Unsigned, pen icon + "Click to sign" */
          <Text
            text="✎  Click to sign"
            fontSize={Math.min(13, stageH * 0.38)}
            fill="#9ca3af"
            fontStyle="italic"
            width={stageW}
            height={stageH}
            align="center"
            verticalAlign="middle"
          />
        ) : (
          (!isEditing || field.type === "signature") && (
            <Text
              text={displayValue}
              fontSize={overlayFontSize}
              fill={isEmpty ? "#9ca3af" : "#1a1a2e"}
              fontFamily="Arial"
              {...(fieldFitEnabled && field.type === "signature"
                ? { fontStyle: "italic" }
                : {})}
              // BUG FIX: Lock text width to field dimensions - prevent auto-resize on deselect
              // Use exact field width minus padding, with ellipsis to prevent expansion
              width={overlayWidth}
              height={stageH}
              padding={overlayPadding}
              {...(fieldFitEnabled || formFidelityMultiline
                ? {
                    lineHeight: multilineOverlayLayout
                      ? multilineOverlayLayout.lineHeight /
                        multilineOverlayLayout.fontSize
                      : STANDARD_OVERLAY_TEXT_HEIGHT_RATIO,
                  }
                : {})}
              verticalAlign={formFidelityMultiline ? "top" : "middle"}
              align="left"
              wrap="none"
              ellipsis={!formFidelityMultiline}
            />
          )
        )}
        {eraseMaskLayer}
      </Group>
    </>
  );
}
