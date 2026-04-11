"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useReducer } from "react";
import { Stage, Layer, Rect, Text, Group, Transformer, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { EditorField, ToolType, SignatureField, CheckboxStamp } from "@/lib/types";
import { detectSnapBox, detectAllBoxes, snapCredibilityScore, floodFillCell } from "@/lib/snap-detect";
import type { SnapResult } from "@/lib/snap-detect";

export interface PdfViewerHandle {
  getCanvasDataURL: () => string | null;
  getCanvasDimensions: () => { width: number; height: number };
  getCanvas: () => HTMLCanvasElement | null;
}

interface PdfViewerProps {
  pdfBytes: ArrayBuffer;
  currentPage: number;
  fields: EditorField[];
  activeTool: ToolType | null;
  selectedFieldId: string | null;
  onFieldAdd: (field: EditorField) => void;
  onFieldUpdate: (id: string, updates: Partial<EditorField>) => void;
  onFieldSelect: (id: string | null) => void;
  onFieldDelete: (id: string) => void;
  onFieldDuplicate?: (id: string) => void;
  onToolSelect: (tool: ToolType | null) => void;
  onPageScaleSet: (page: number, scale: number) => void;
  totalPages: number;
  onTotalPagesChange: (total: number) => void;
  zoom: number;
  highlightFieldIds?: Set<string>;
  onSignatureFieldPlaced?: (field: EditorField) => void;
}

let nextFieldId = 1;
function genId() {
  return `field-${nextFieldId++}`;
}

interface SnapPreview {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Infer a sensible font size from field height */
function inferFontSize(boxHeight: number): number {
  // Use ~65% of box height for tighter fill, clamped to 8-36px
  const raw = Math.round(boxHeight * 0.65);
  return Math.max(8, Math.min(36, raw));
}

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer({
  pdfBytes,
  currentPage,
  fields,
  activeTool,
  selectedFieldId,
  onFieldAdd,
  onFieldUpdate,
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
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 1100 });
  const [, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [snappedFieldId, setSnappedFieldId] = useState<string | null>(null);
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapPreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cursorStyle, setCursorStyle] = useState("default");
  const [snapPreviewOpacity, setSnapPreviewOpacity] = useState(0);
  const precomputedBoxesRef = useRef<SnapResult[]>([]);
  const dragStartedRef = useRef(false);
  const mouseDownPos = useRef<{x: number, y: number} | null>(null);
  const isDragMove = useRef(false);
  const snapPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    getCanvasDataURL: () => canvasRef.current?.toDataURL("image/png") ?? null,
    getCanvasDimensions: () => dimensions,
    getCanvas: () => canvasRef.current,
  }));

  const zoomFactor = zoom / 100;

  // Clear editing when field is deselected
  useEffect(() => {
    if (!selectedFieldId) setEditingFieldId(null);
  }, [selectedFieldId]);

  // Render PDF page
  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      setLoading(true);
      setError(null);

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;

        if (cancelled) return;
        onTotalPagesChange(pdf.numPages);

        const page = await pdf.getPage(currentPage + 1);
        if (cancelled) return;

        const containerWidth = containerRef.current?.clientWidth ?? 800;
        const viewport = page.getViewport({ scale: 1 });
        const fitScale = Math.min((containerWidth - 32) / viewport.width, 1.5);
        const effectiveScale = fitScale * zoomFactor;
        const scaledViewport = page.getViewport({ scale: effectiveScale });

        setScale(fitScale);
        onPageScaleSet(currentPage, fitScale);
        setDimensions({
          width: Math.floor(scaledViewport.width),
          height: Math.floor(scaledViewport.height),
        });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = Math.floor(scaledViewport.width);
        canvas.height = Math.floor(scaledViewport.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas: canvas,
        } as Parameters<typeof page.render>[0]).promise;

        // Run batch visual detection after render for pre-computed snap targets
        try {
          const boxes = detectAllBoxes(canvas);
          precomputedBoxesRef.current = boxes;
        } catch {
          precomputedBoxesRef.current = [];
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError("Failed to render PDF. The file may be corrupted.");
          setLoading(false);
          console.error(err);
        }
      }
    }

    renderPage();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes, currentPage, zoom]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      // Re-render on resize is handled by the pdfBytes/currentPage effect
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);




  // Animate snap preview opacity
  useEffect(() => {
    if (snapPreview) {
      // Fade in
      requestAnimationFrame(() => setSnapPreviewOpacity(1));
    } else {
      setSnapPreviewOpacity(0);
    }
  }, [snapPreview]);

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
      setCursorStyle("move");
      return;
    }

    setCursorStyle("default");
  }, [activeTool, isDragging]);

  // Hover snap preview on mouse move (throttled)
  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      updateCursor(stage, pos);

      if (!activeTool || activeTool === "checkbox" || activeTool === "signature" || !canvasRef.current) {
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
        let snap: SnapResult | null = null;

        if (preBoxes.length > 0) {
          // Find all boxes containing the pointer, pick the most credible (smallest cell)
          const containing: SnapResult[] = [];
          for (const box of preBoxes) {
            if (
              pos.x >= box.x - 3 &&
              pos.x <= box.x + box.width + 3 &&
              pos.y >= box.y - 3 &&
              pos.y <= box.y + box.height + 3
            ) {
              containing.push(box);
            }
          }
          if (containing.length > 0) {
            containing.sort((a, b) => snapCredibilityScore(a) - snapCredibilityScore(b));
            const best = containing[0];
            const aspectRatio = best.width / Math.max(best.height, 1);
            // Skip pre-computed if box is row-spanning (extreme aspect ratio)
            if (aspectRatio <= 10) {
              snap = best;
            }
          }
        }

        // Fall back: try flood fill directly on canvas, then line-based scan
        if (!snap && canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) {
            try {
              const imgData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
              const ff = floodFillCell(imgData.data, canvasRef.current.width, canvasRef.current.height, Math.round(pos.x), Math.round(pos.y));
              if (ff) snap = ff;
            } catch { /* silent */ }
          }
          if (!snap) snap = detectSnapBox(canvasRef.current, pos.x, pos.y);
        }

        if (snap) {
          const newPreview = {
            x: snap.x / zoomFactor,
            y: snap.y / zoomFactor,
            width: snap.width / zoomFactor,
            height: snap.height / zoomFactor,
          };
          // Only update if snap changed significantly (>8px), prevents flicker
          setSnapPreview(prev => {
            if (!prev) return newPreview;
            const dx = Math.abs(newPreview.x - prev.x);
            const dy = Math.abs(newPreview.y - prev.y);
            const dw = Math.abs(newPreview.width - prev.width);
            const dh = Math.abs(newPreview.height - prev.height);
            if (dx < 8 && dy < 8 && dw < 8 && dh < 8) return prev; // no change
            return newPreview;
          });
        } else {
          setSnapPreview(null);
        }
      } catch {
        setSnapPreview(null);
      }
    },
    [activeTool, zoomFactor, updateCursor, snapPreview]
  );

  const handleStageMouseLeave = useCallback(() => {
    setSnapPreview(null);
    setCursorStyle(activeTool ? "crosshair" : "default");
  }, [activeTool]);

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (pos) {
        mouseDownPos.current = { x: pos.x, y: pos.y };
      }
      isDragMove.current = false;
    },
    []
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (pos && mouseDownPos.current) {
        const dx = pos.x - mouseDownPos.current.x;
        const dy = pos.y - mouseDownPos.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          isDragMove.current = true;
        }
      }
    },
    []
  );

  // Core field creation logic - shared by click and touch
  const createFieldAtPoint = useCallback(
    (posX: number, posY: number, clickedOnEmpty: boolean) => {
      if (!activeTool || !clickedOnEmpty) return false;

      const id = genId();

      let fieldX = posX / zoomFactor;
      let fieldY = posY / zoomFactor;
      let fieldW: number;
      let fieldH: number;
      let snapped = false;

      const defaults = {
        text:      { w: 200, h: 28 },
        checkbox:  { w: 20,  h: 20 },
        signature: { w: 220, h: 70 },
        date:      { w: 160, h: 28 },
      };
      fieldW = defaults[activeTool].w;
      fieldH = defaults[activeTool].h;

      // Checkboxes and signatures never snap, place at click point
      if (activeTool !== "checkbox" && activeTool !== "signature") {
        // Snap-first: always try snap detection first
        if (snapPreview) {
          fieldX = snapPreview.x;
          fieldY = snapPreview.y;
          fieldW = snapPreview.width;
          fieldH = snapPreview.height;
          snapped = true;
        } else {
          const preBoxes = precomputedBoxesRef.current;
          let foundSnap: SnapResult | null = null;

          if (preBoxes.length > 0) {
            const containing: SnapResult[] = [];
            for (const box of preBoxes) {
              if (
                posX >= box.x - 3 &&
                posX <= box.x + box.width + 3 &&
                posY >= box.y - 3 &&
                posY <= box.y + box.height + 3
              ) {
                containing.push(box);
              }
            }
            if (containing.length > 0) {
              containing.sort((a, b) => snapCredibilityScore(a) - snapCredibilityScore(b));
              const best = containing[0];
              const aspectRatio = best.width / Math.max(best.height, 1);
              if (aspectRatio <= 10) foundSnap = best;
            }
          }

          if (!foundSnap && canvasRef.current) {
            try {
              foundSnap = detectSnapBox(canvasRef.current, posX, posY);
            } catch { /* fall back to default */ }
          }

          if (foundSnap) {
            fieldX = foundSnap.x / zoomFactor;
            fieldY = foundSnap.y / zoomFactor;
            fieldW = foundSnap.width / zoomFactor;
            fieldH = foundSnap.height / zoomFactor;
            snapped = true;
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
          field = { ...base, type: "checkbox", width: fieldW, height: fieldH, checked: true, stamp: "tick" };
          break;
        case "signature":
          field = { ...base, type: "signature", width: fieldW, height: fieldH, value: "", fontSize: inferredFontSize ?? 16 };
          break;
        case "date":
          field = { ...base, type: "date", width: fieldW, height: fieldH, value: new Date().toLocaleDateString("en-AU"), fontSize: inferredFontSize ?? 14 };
          break;
      }

      onFieldAdd(field);
      onFieldSelect(id);
      // Deactivate tool after placing so panel switches to field controls
      onToolSelect(null);

      // For signature fields, trigger signature placement flow
      if (activeTool === "signature") {
        onSignatureFieldPlaced?.(field);
      } else if (activeTool !== "checkbox") {
        // Immediately enter edit mode for text-like fields
        setEditingFieldId(id);
      }

      // Flash confirmation on snap
      if (snapped) {
        setSnappedFieldId(id);
        setTimeout(() => setSnappedFieldId(null), 600);
      }

      return true;
    },
    [activeTool, currentPage, onFieldAdd, onFieldSelect, onToolSelect, zoomFactor, snapPreview, onSignatureFieldPlaced]
  );

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isDragMove.current) {
        isDragMove.current = false;
        return;
      }

      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      const clickedOnEmpty = e.target === stage;

      if (!clickedOnEmpty) {
        // Clicked on a field element - select it and deactivate tool
        if (activeTool) {
          const currentFields = fields.filter((f) => f.page === currentPage);
          let node: Konva.Node | null = e.target;
          while (node && node !== stage) {
            const parent = node.getParent();
            if (parent) {
              const matchedField = currentFields.find(
                (f) => f.x === parent.x() && f.y === parent.y()
              );
              if (matchedField) {
                onFieldSelect(matchedField.id);
                onToolSelect(null);
                break;
              }
            }
            node = parent;
          }
        }
        return;
      }

      if (activeTool) {
        createFieldAtPoint(pos.x, pos.y, true);
      } else {
        onFieldSelect(null);
        setEditingFieldId(null);
      }
    },
    [activeTool, currentPage, fields, onFieldSelect, onToolSelect, createFieldAtPoint]
  );

  // Touch handler for mobile tap-to-place, delegates to createFieldAtPoint
  // so behaviour (including non-snap fallback) matches desktop clicks.
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!activeTool || !canvasRef.current) return;
      if (e.changedTouches.length !== 1) return;

      const touch = e.changedTouches[0];
      const rect = canvasRef.current.getBoundingClientRect();
      const touchX = touch.clientX - rect.left;
      const touchY = touch.clientY - rect.top;

      if (touchX < 0 || touchY < 0 || touchX > rect.width || touchY > rect.height) return;

      e.preventDefault();
      createFieldAtPoint(touchX, touchY, true);
    },
    [activeTool, createFieldAtPoint]
  );

  const pageFields = fields.filter((f) => f.page === currentPage);

  // Determine if selected field is snapped (for transformer behavior)
  const selectedFieldIsSnapped = selectedFieldId
    ? fields.find((f) => f.id === selectedFieldId)?.snapped ?? false
    : false;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-[#f0f0f0] p-4"
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: activeTool ? "none" : "pan-x pan-y" }}
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
        className="relative mx-auto bg-white shadow-xl rounded-sm"
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ width: dimensions.width, height: dimensions.height }}
        />

        {/* Strong snap preview overlay */}
        {activeTool && snapPreview && (() => {
          const snapW = snapPreview.width * zoomFactor;
          const snapH = snapPreview.height * zoomFactor;
          const isTiny = snapW < 28 || snapH < 28;
          return (
            <div
              className="snap-preview-highlight"
              style={{
                position: "absolute",
                left: snapPreview.x * zoomFactor,
                top: snapPreview.y * zoomFactor,
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

        <Stage
          width={dimensions.width}
          height={dimensions.height}
          scaleX={zoomFactor}
          scaleY={zoomFactor}
          onMouseDown={handleStageMouseDown}
          onMouseUp={handleStageMouseUp}
          onClick={handleStageClick}
          onMouseMove={handleStageMouseMove}
          onMouseLeave={handleStageMouseLeave}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            cursor: editingFieldId ? "text" : cursorStyle,
          }}
        >
          <Layer>
            {pageFields.map((field) => (
              <FieldShape
                key={field.id}
                field={field}
                isSelected={field.id === selectedFieldId}
                isEditing={field.id === editingFieldId}
                isHighlighted={field.id === snappedFieldId || (highlightFieldIds?.has(field.id) ?? false)}
                isHovered={field.id === hoveredFieldId}
                onSelect={() => {
                  onFieldSelect(field.id);
                  onToolSelect(null);
                  if (!dragStartedRef.current && field.type !== "signature") {
                    setEditingFieldId(field.id);
                  }
                  // Signature fields: clicking selects only.
                  // Sign Now / Re-sign is triggered from the right panel.
                }}
                onMouseEnter={() => {
                  setHoveredFieldId(field.id);
                  if (!activeTool && !isDragging) {
                    setCursorStyle(field.snapped ? "pointer" : "move");
                  }
                }}
                onMouseLeave={() => {
                  setHoveredFieldId(null);
                  if (!activeTool && !isDragging) {
                    setCursorStyle("default");
                  }
                }}
                onDragStart={() => {
                  dragStartedRef.current = true;
                  setIsDragging(true);
                  setEditingFieldId(null);
                  setCursorStyle("grabbing");
                }}
                onDragEnd={(x, y) => {
                  setIsDragging(false);
                  setCursorStyle("move");
                  onFieldUpdate(field.id, { x, y });
                  setTimeout(() => { dragStartedRef.current = false; }, 50);
                }}
                onTransformStart={() => {
                  setEditingFieldId(null);
                }}
                onTransformEnd={(width, height, x, y) =>
                  onFieldUpdate(field.id, { width, height, x, y })
                }
                onDoubleClick={() => setEditingFieldId(field.id)}
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

              />
            ))}
          </Layer>
        </Stage>

        {/* HTML input overlay for text editing */}
        {editingFieldId &&
          (() => {
            const editField = pageFields.find((f) => f.id === editingFieldId);
            if (!editField || editField.type === "checkbox") return null;
            // Signature fields never use text input, always use SignatureModal
            if (editField.type === "signature") return null;
            const isEditSnapped = editField.snapped ?? false;

            return (
              <input
                autoFocus
                type="text"
                className="absolute z-20 outline-none"
                style={{
                  left: editField.x * zoomFactor,
                  top: editField.y * zoomFactor,
                  width: editField.width * zoomFactor,
                  height: editField.height * zoomFactor,
                  fontSize: Math.max(16, ((editField as { fontSize?: number }).fontSize ?? 14) * zoomFactor),
                  fontFamily: "Arial, sans-serif",
                  color: "#1a1a2e",
                  cursor: "text",
                  // Match Konva text padding exactly so text aligns
                  paddingLeft: isEditSnapped ? 2 : 4,
                  paddingRight: isEditSnapped ? 2 : 4,
                  paddingTop: 0,
                  paddingBottom: 0,
                  boxSizing: "border-box",
                  // Fully transparent, no background at all
                  backgroundColor: "rgba(0,0,0,0)",
                  background: "none",
                  WebkitAppearance: "none",
                  // Underline only while editing
                  border: "none",
                  borderBottom: "1.5px solid rgba(59,130,246,0.7)",
                  // No scrollbar, text just extends right
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
                value={editField.value}
                placeholder={
                  editField.type === "date"
                    ? "MM/DD/YYYY"
                    : "Type here..."
                }
                onChange={(e) => {
                  const newValue = e.target.value;
                  onFieldUpdate(editField.id, { value: newValue } as Partial<EditorField>);

                  // Auto-expand field width if text overflows
                  const fontSize = ((editField as { fontSize?: number }).fontSize ?? 14) * zoomFactor;
                  const padding = (isEditSnapped ? 2 : 4) * 2;
                  // Measure text width using canvas
                  const canvas = document.createElement("canvas");
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    ctx.font = `${fontSize}px Arial, sans-serif`;
                    const textWidth = ctx.measureText(newValue).width + padding + 8;
                    const currentWidth = editField.width * zoomFactor;
                    if (textWidth > currentWidth) {
                      // Expand field to fit text, in unscaled coords
                      onFieldUpdate(editField.id, {
                        value: newValue,
                        width: Math.ceil(textWidth / zoomFactor),
                      } as Partial<EditorField>);
                    }
                  }
                }}
                onBlur={() => setEditingFieldId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") {
                    setEditingFieldId(null);
                  }
                  e.stopPropagation();
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

// ─── FieldShape ──────────────────────────────────────────────────────────────
// ARCHITECTURE NOTE — DO NOT REVERT:
// Each FieldShape renders its own Transformer when selected (isSelected=true).
// This is intentional and must never be changed to a shared Transformer pattern.
//
// A shared Transformer was tried many times and always failed — it bonds across
// multiple fields because React's render cycle and Konva's internal node state
// fight each other. Shared Transformer + fieldNodeMapRef + useLayoutEffect +
// requestAnimationFrame retries all failed.
//
// The correct pattern: per-field Transformer inside a Fragment, mounted only
// when isSelected. Konva attaches it to the sibling Group automatically.
// Zero shared state, zero timing issues, zero registry needed.
// ─────────────────────────────────────────────────────────────────────────────
function FieldShape({
  field,
  isSelected,
  isEditing,
  isHighlighted,
  isHovered,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragEnd,
  onTransformStart,
  onTransformEnd,
  onDoubleClick,
  onValueChange,
  onDelete,
}: {
  field: EditorField;
  isSelected: boolean;
  isEditing: boolean;
  isHighlighted: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onDragStart?: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformStart?: () => void;
  onTransformEnd: (w: number, h: number, x: number, y: number) => void;
  onDoubleClick: () => void;
  onValueChange: (value: string | boolean | CheckboxStamp) => void;
  onDelete: () => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  const [dragOpacity, setDragOpacity] = useState(1);

  const isSnapped = field.snapped ?? false;

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

  // Ref callback to force re-render after group mounts so Transformer gets the node
  const groupRefCallback = useCallback((node: Konva.Group | null) => {
    groupRef.current = node;
    if (node) forceUpdate();
  }, []);

  if (field.type === "checkbox") {
    return (
      <>
        <Group
          id={field.id}
          ref={groupRefCallback}
          x={field.x}
        y={field.y}
        width={field.width}
        height={field.height}
        opacity={dragOpacity}
        draggable={!isSnapped}
        onMouseEnter={() => onMouseEnter?.()}
        onMouseLeave={() => onMouseLeave?.()}
        onClick={(e) => {
          e.cancelBubble = true;
          // Single click cycles: none → tick → cross → delete
          const current: CheckboxStamp = (field as { stamp?: CheckboxStamp }).stamp ?? (field.checked ? "tick" : "none");
          if (current === "cross") {
            // Third click = delete the field entirely
            onDelete();
            return;
          }
          const next: CheckboxStamp = current === "none" ? "tick" : "cross";
          onValueChange(next);
          if (!isSelected) onSelect();
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
      >
        {/* Drag shadow, "lifted" feel without hiding the stamp */}
        {dragOpacity < 1 && (
          <Rect
            width={field.width}
            height={field.height}
            fill="transparent"
            shadowColor="rgba(0,0,0,0.25)"
            shadowBlur={8}
            shadowOffsetY={3}
          />
        )}
        {/* Selection/hover indicator, subtle dashed border, only on interact */}
        {(isSelected || isHovered || isHighlighted) && (
          <Rect
            width={field.width}
            height={field.height}
            fill="transparent"
            stroke={isHighlighted ? "#2563eb" : isSelected ? "#3b82f6" : "rgba(59,130,246,0.4)"}
            strokeWidth={isHighlighted ? 2 : isSelected ? 1.5 : 1}
            cornerRadius={2}
            dash={isSelected ? undefined : [3, 2]}
          />
        )}
        {/* Stamp, bold black tick or cross, like pen on paper */}
        {(() => {
          const stamp: CheckboxStamp = (field as { stamp?: CheckboxStamp }).stamp ?? (field.checked ? "tick" : "none");
          if (stamp === "none") return null;
          const size = Math.min(field.width, field.height) * 0.88;
          return (
            <Text
              text={stamp === "tick" ? "✓" : "✕"}
              fontSize={size}
              fill="#111827"
              fontStyle="bold"
              width={field.width}
              height={field.height}
              align="center"
              verticalAlign="middle"
            />
          );
        })()}
        </Group>
        {isSelected && (
          <Transformer
            key={`tr-${field.id}`}
            nodes={groupRef.current ? [groupRef.current] : []}
            rotateEnabled={false}
            borderStroke="#3b82f6"
            anchorStroke="#3b82f6"
            anchorFill="#fff"
            anchorSize={isSnapped ? 6 : 8}
            enabledAnchors={isSnapped ? [] : undefined}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 16 || newBox.height < 16) return oldBox;
              return newBox;
            }}
          />
        )}
      </>
    );
  }

  // Text, date, signature fields
  const sigDataUrl = field.type === "signature" ? (field as SignatureField).signatureDataUrl : undefined;
  const sigImage = useLoadedImage(sigDataUrl);
  const hasSignatureImage = field.type === "signature" && !!sigDataUrl && !!sigImage;

  const displayValue =
    hasSignatureImage
      ? ""
      : field.value ||
        (field.type === "signature"
          ? "Click to sign"
          : field.type === "date"
          ? "Click for date"
          : "Click to type...");
  const isEmpty = !field.value && !hasSignatureImage;

  return (
    <>
      <Group
        id={field.id}
        ref={groupRefCallback}
        x={field.x}
      y={field.y}
      width={field.width}
      height={field.height}
      opacity={dragOpacity}
      draggable={!isSnapped}
      onMouseEnter={() => onMouseEnter?.()}
      onMouseLeave={() => onMouseLeave?.()}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
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
        onTransformEnd(
          Math.max(40, node.width() * scaleX),
          Math.max(20, node.height() * scaleY),
          node.x(),
          node.y()
        );
      }}
    >
      <Rect
        width={field.width}
        height={field.height}
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
        strokeWidth={isSelected ? 1 : 0}
        dash={field.type === "signature" && !hasSignatureImage ? [4, 3] : undefined}
        cornerRadius={isSnapped ? 3 : 4}
      />
      {hasSignatureImage && sigImage ? (
        (() => {
          const pad = 4;
          const maxW = field.width - pad;
          const maxH = field.height - pad;
          const scale = Math.min(maxW / sigImage.naturalWidth, maxH / sigImage.naturalHeight);
          const drawW = sigImage.naturalWidth * scale;
          const drawH = sigImage.naturalHeight * scale;
          return (
            <KonvaImage
              image={sigImage}
              x={(field.width - drawW) / 2}
              y={(field.height - drawH) / 2}
              width={drawW}
              height={drawH}
            />
          );
        })()
      ) : field.type === "signature" ? (
        /* Unsigned, pen icon + "Click to sign" */
        <Text
          text="✎  Click to sign"
          fontSize={Math.min(13, field.height * 0.38)}
          fill="#9ca3af"
          fontStyle="italic"
          width={field.width}
          height={field.height}
          align="center"
          verticalAlign="middle"
        />
      ) : (
        !isEditing && (
          <Text
            text={displayValue}
            fontSize={(field as { fontSize?: number }).fontSize ?? 14}
            fill={isEmpty ? "#9ca3af" : "#1a1a2e"}
            fontFamily="Arial"
            width={field.width - (isSnapped ? 2 : 4)}
            height={field.height}
            padding={isSnapped ? 2 : 4}
            verticalAlign="middle"
            wrap="none"
            clip={{ x: 0, y: 0, width: field.width - (isSnapped ? 2 : 4), height: field.height }}
          />
        )
      )}
      </Group>
      {isSelected && (
        <Transformer
          key={`tr-${field.id}`}
          nodes={groupRef.current ? [groupRef.current] : []}
          rotateEnabled={false}
          borderStroke="#3b82f6"
          anchorStroke="#3b82f6"
          anchorFill="#fff"
          anchorSize={isSnapped ? 6 : 8}
          enabledAnchors={isSnapped ? [] : undefined}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 16) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
