"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Stage, Layer, Rect, Text, Group, Transformer, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { EditorField, ToolType, SignatureField, CheckboxStamp, WhiteoutField, GridField } from "@/lib/types";
import { detectSnapBox, detectAllBoxes, snapCredibilityScore, floodFillCell, detectCombCells } from "@/lib/snap-detect";
import type { SnapResult, CombDetectResult } from "@/lib/snap-detect";

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
  onSignatureRequest?: (fieldId: string) => void;
  onPageChange?: (page: number) => void;
  snapEnabled: boolean;
  keepRatio?: boolean;
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
  onSignatureRequest,
  onPageChange,
  snapEnabled,
  keepRatio,
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
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, fieldId: string } | null>(null);
  const precomputedBoxesRef = useRef<SnapResult[]>([]);
  const dragStartedRef = useRef(false);
  const mouseDownPos = useRef<{x: number, y: number} | null>(null);
  const isDragMove = useRef(false);
  const snapPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const nodeMapRef = useRef<Map<string, Konva.Group>>(new Map());
  
  // Drag-to-draw refs for Feature 1
  const dragStart = useRef<{x: number, y: number} | null>(null);
  const dragCurrent = useRef<{x: number, y: number} | null>(null);
  const isDragDrawing = useRef(false);
  const [drawRect, setDrawRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);

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

    async function renderPage() {
      setLoading(true);
      setError(null);

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

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




  // Register/unregister node callbacks for FieldShape
  const registerNode = useCallback((id: string, node: Konva.Group) => {
    nodeMapRef.current.set(id, node);
    // If this newly mounted field is the selected one, attach Transformer immediately
    const tr = trRef.current;
    if (tr && id === selectedFieldId) {
      tr.nodes([]);
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    }
  }, [selectedFieldId]);

  const unregisterNode = useCallback((id: string) => {
    nodeMapRef.current.delete(id);
  }, []);

  // Feature 2: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only active when not editing
      if (editingFieldId !== null) return;
      
      const selectedField = selectedFieldId ? fields.find(f => f.id === selectedFieldId && f.page === currentPage) : null;
      
      // If selected field is comb or grid, let the field handle its own typing keys
      // Only allow Escape and Ctrl+D through to this handler
      if (selectedField && (selectedField.type === "comb" || selectedField.type === "grid")) {
        const isEscape = e.key === "Escape";
        const isDuplicate = (e.ctrlKey || e.metaKey) && e.key === "d";
        if (!isEscape && !isDuplicate) return;
      }
      
      // Delete / Backspace - delete selected field (but not for comb/grid - handled above)
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedFieldId) {
          e.preventDefault();
          onFieldDelete(selectedFieldId);
          onFieldSelect(null);
        }
        return;
      }
      
      // Ctrl+D / Cmd+D - duplicate selected field
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedFieldId) {
          const field = fields.find(f => f.id === selectedFieldId && f.page === currentPage);
          if (field) {
            const newId = genId();
            const duplicate = { ...field, id: newId, x: field.x + 16, y: field.y + 16 };
            onFieldAdd(duplicate);
            onToolSelect(null);
            setCursorStyle("default");
            onFieldSelect(newId);
          }
        }
        return;
      }
      
      // Escape - deactivate tool and deselect
      if (e.key === "Escape") {
        e.preventDefault();
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
  }, [editingFieldId, selectedFieldId, fields, currentPage, onFieldDelete, onFieldSelect, onToolSelect, onFieldUpdate]);

  // Drive the single global Transformer based on selectedFieldId
  useLayoutEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (!selectedFieldId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    // Never attach Transformer to whiteout fields
    const selectedField = fields.find(f => f.id === selectedFieldId);
    if (selectedField?.type === 'whiteout') {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = nodeMapRef.current.get(selectedFieldId);
    if (node) {
      // Node is already mounted — attach now
      tr.nodes([]);
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    }
    // If node not found yet, do nothing — registerNode will attach when it mounts
  }, [selectedFieldId, fields]);

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
      const pos = stage.getPointerPosition();
      if (!pos) return;

      updateCursor(stage, pos);

      // Feature 1: Update drag rectangle while dragging
      if (isDragDrawing.current && dragStart.current && activeTool && e.target === stage) {
        dragCurrent.current = pos;
        const x = Math.min(dragStart.current.x, pos.x);
        const y = Math.min(dragStart.current.y, pos.y);
        const w = Math.abs(pos.x - dragStart.current.x);
        const h = Math.abs(pos.y - dragStart.current.y);
        setDrawRect({ x, y, w, h });
        return; // Don't do snap preview while drawing
      }

      if (!activeTool || activeTool === "checkbox" || activeTool === "signature" || !canvasRef.current) {
        if (snapPreview) setSnapPreview(null);
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
    [activeTool, zoomFactor, updateCursor, snapPreview, snapEnabled]
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
        // Feature 1: Record drag start if tool is active and clicking on empty canvas
        if (activeTool && e.target === stage) {
          dragStart.current = { x: pos.x, y: pos.y };
          dragCurrent.current = { x: pos.x, y: pos.y };
          isDragDrawing.current = true;
          setDrawRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
        }
      }
      isDragMove.current = false;
    },
    [activeTool]
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
      
      // Feature 1: Complete drag-to-draw if active
      if (isDragDrawing.current && dragStart.current && pos) {
        const dx = pos.x - dragStart.current.x;
        const dy = pos.y - dragStart.current.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        
        // If drag distance > 10px in both axes, use drawn rectangle
        if (absDx > 10 && absDy > 10 && activeTool && e.target === stage) {
          const x = Math.min(dragStart.current.x, pos.x);
          const y = Math.min(dragStart.current.y, pos.y);
          const width = absDx / zoomFactor;
          const height = absDy / zoomFactor;
          
          const id = genId();
          const snapped = false; // No snap detection when user draws manually
          
          const defaults = {
            text:      { w: 200, h: 28 },
            checkbox:  { w: 20,  h: 20 },
            signature: { w: 220, h: 70 },
            date:      { w: 160, h: 28 },
          };
          
          // Use drawn dimensions, but ensure minimum sizes
          const fieldW = Math.max(width, 20);
          const fieldH = Math.max(height, 20);
          
          // Enforce minimum 4px gap between adjacent fields to prevent visual merging
          let fieldX = x / zoomFactor;
          let fieldY = y / zoomFactor;
          const MIN_GAP = 4;
          
          const pageFields = fields.filter((f) => f.page === currentPage);
          
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
          
          const snapBounds = { x: fieldX, y: fieldY, width: fieldW, height: fieldH };
          const base = { id, x: fieldX, y: fieldY, page: currentPage, snapped, snapBounds };
          
          let field: EditorField;
          switch (activeTool) {
            case "text":
              field = { ...base, type: "text", width: fieldW, height: fieldH, value: "", fontSize: 14 };
              break;
            case "checkbox":
              field = { ...base, type: "checkbox", width: fieldW, height: fieldH, checked: true, stamp: "tick" };
              break;
            case "signature":
              field = { ...base, type: "signature", width: fieldW, height: fieldH, value: "", fontSize: 16 };
              break;
            case "date":
              field = { ...base, type: "date", width: fieldW, height: fieldH, value: new Date().toLocaleDateString("en-AU"), fontSize: 14 };
              break;
            case "grid":
              field = { ...base, type: "grid", width: fieldW, height: fieldH, value: "", charCount: Math.min(50, Math.max(1, Math.round(fieldW / 24))) };
              break;
            case "comb": {
              // Try to auto-detect comb cells from the PDF
              const canvas = canvasRef.current;
              let detectedCellWidth: number | undefined;
              let detectedCellCount: number | undefined;
              let snapX = fieldX; // Default to drawn position
              let snapY = fieldY;
              let snapHeight = fieldH;
              let cellPositions: number[] | undefined;
              let cellWidthsArr: number[] | undefined;
              let totalWidth = fieldW;
              
              if (canvas) {
                const combResult = detectCombCells(
                  canvas,
                  fieldX * zoomFactor,
                  fieldY * zoomFactor,
                  fieldW * zoomFactor,
                  fieldH * zoomFactor,
                );
                if (combResult && combResult.cellCount >= 2) {
                  // Use detected cell width and count
                  detectedCellWidth = Math.round(combResult.cellWidth / zoomFactor);
                  detectedCellCount = combResult.cellCount;
                  // Snap X position to first detected cell boundary
                  snapX = Math.round(combResult.firstCellX / zoomFactor);
                  // Snap Y and height to detected box bounds
                  snapY = Math.round(combResult.y / zoomFactor);
                  snapHeight = Math.round(combResult.height / zoomFactor);
                  
                  // Store cell centers relative to field X for non-uniform spacing
                  if (combResult.cellCenters && combResult.cellCenters.length > 0) {
                    cellPositions = combResult.cellCenters.map(c => Math.round((c / zoomFactor) - snapX));
                    cellWidthsArr = combResult.cellWidths.map(w => Math.round(w / zoomFactor));
                    // Calculate total width from first cell to end of last cell
                    const lastCellRight = combResult.cellBoundaries[combResult.cellBoundaries.length - 1] + 
                      (combResult.cellWidths[combResult.cellWidths.length - 1] || combResult.cellWidth);
                    totalWidth = Math.round((lastCellRight - combResult.firstCellX) / zoomFactor);
                  }
                }
              }
              
              const finalCharCount = detectedCellCount ?? Math.min(30, Math.max(1, Math.round(fieldW / 24)));
              const finalWidth = cellPositions ? totalWidth : (detectedCellWidth ? detectedCellWidth * finalCharCount : fieldW);
              
              field = { 
                ...base, 
                x: snapX,
                y: snapY,
                type: "comb", 
                width: finalWidth, 
                height: snapHeight, 
                value: "", 
                charCount: finalCharCount,
                cellWidth: detectedCellWidth,
                cellPositions: cellPositions,
                cellWidths: cellWidthsArr,
              };
              break;
            }
            case "whiteout": {
              // Sample background color from canvas center of drawn rectangle
              const canvas = canvasRef.current;
              let fillColor = "#ffffff";
              if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  const canvasCx = Math.round((fieldX + fieldW / 2) * zoomFactor);
                  const canvasCy = Math.round((fieldY + fieldH / 2) * zoomFactor);
                  if (canvasCx >= 0 && canvasCy >= 0 && canvasCx < canvas.width && canvasCy < canvas.height) {
                    try {
                      const pixel = ctx.getImageData(canvasCx, canvasCy, 1, 1).data;
                      fillColor = `#${[pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, "0")).join("")}`;
                    } catch {
                      fillColor = "#ffffff";
                    }
                  }
                }
              }
              field = { ...base, type: "whiteout", width: fieldW, height: fieldH, fillColor };
              break;
            }
          }
          
          onFieldAdd(field);
          onToolSelect(null);
          setCursorStyle("default");
          onFieldSelect(id);
          
          if (activeTool === "signature") {
            onSignatureFieldPlaced?.(field);
          } else if (activeTool !== "checkbox") {
            setEditingFieldId(id);
          }
        } else if (absDx <= 10 || absDy <= 10) {
          // Fall back to click-to-place behavior - inline the logic here to avoid circular dependency
          const clickedOnEmpty = e.target === stage;
          if (activeTool && clickedOnEmpty && pos) {
            const id = genId();
            let fieldX = pos.x / zoomFactor;
            let fieldY = pos.y / zoomFactor;
            let fieldW: number;
            let fieldH: number;
            let snapped = false;

            const defaults = {
              text:      { w: 200, h: 28 },
              checkbox:  { w: 20,  h: 20 },
              signature: { w: 220, h: 70 },
              date:      { w: 160, h: 28 },
              grid:      { w: 220, h: 30 },
              comb:      { w: 220, h: 30 },
              whiteout:  { w: 100, h: 30 },
            };
            fieldW = defaults[activeTool].w;
            fieldH = defaults[activeTool].h;

            // Checkboxes and signatures never snap, place at click point
            // Also skip snap detection if snapEnabled is false
            if (activeTool !== "checkbox" && activeTool !== "signature" && snapEnabled) {
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
                    if (aspectRatio <= 10) foundSnap = best;
                  }
                }

                if (!foundSnap && canvasRef.current) {
                  try {
                    foundSnap = detectSnapBox(canvasRef.current, pos.x, pos.y);
                  } catch { /* fall back to default */ }
                }

                if (foundSnap) {
                  const snapX = foundSnap.x / zoomFactor;
                  const snapY = foundSnap.y / zoomFactor;
                  const snapZoneOccupied = fields.some(
                    (f) => f.page === currentPage &&
                    Math.abs(f.x - snapX) < 10 &&
                    Math.abs(f.y - snapY) < 10
                  );
                  if (!snapZoneOccupied) {
                    fieldX = snapX;
                    fieldY = foundSnap.y / zoomFactor;
                    fieldW = foundSnap.width / zoomFactor;
                    fieldH = foundSnap.height / zoomFactor;
                    snapped = true;
                  }
                }
              }
            }

            // Check if snap zone is already occupied by another field on the same page
            const snapZoneOccupied = fields.some((f) =>
              f.page === currentPage &&
              Math.abs(f.x - fieldX) < 10 &&
              Math.abs(f.y - fieldY) < 10
            );
            if (snapZoneOccupied) {
              // Reject snap, fall back to click position
              snapped = false;
              fieldX = pos.x / zoomFactor;
              fieldY = pos.y / zoomFactor;
              fieldW = defaults[activeTool].w;
              fieldH = defaults[activeTool].h;
            }

            // Enforce minimum 4px gap between adjacent fields to prevent visual merging
            if (snapped) {
              const pageFields = fields.filter((f) => f.page === currentPage);
              const MIN_GAP = 4;
              
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
                field = { ...base, type: "checkbox", width: fieldW, height: fieldH, checked: true, stamp: "tick" };
                break;
              case "signature":
                field = { ...base, type: "signature", width: fieldW, height: fieldH, value: "", fontSize: inferredFontSize ?? 16 };
                break;
              case "date":
                field = { ...base, type: "date", width: fieldW, height: fieldH, value: new Date().toLocaleDateString("en-AU"), fontSize: inferredFontSize ?? 14 };
                break;
              case "grid":
                field = { ...base, type: "grid", width: fieldW, height: fieldH, value: "", charCount: Math.min(50, Math.max(1, Math.round(fieldW / 24))) };
                break;
              case "comb": {
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
                  const combResult = detectCombCells(
                    combCanvas,
                    fieldX * zoomFactor,
                    fieldY * zoomFactor,
                    fieldW * zoomFactor,
                    fieldH * zoomFactor,
                  );
                  if (combResult && combResult.cellCount >= 2) {
                    combDetectedCellWidth = Math.round(combResult.cellWidth / zoomFactor);
                    combDetectedCellCount = combResult.cellCount;
                    combSnapX = Math.round(combResult.firstCellX / zoomFactor);
                    combSnapY = Math.round(combResult.y / zoomFactor);
                    combSnapHeight = Math.round(combResult.height / zoomFactor);
                    
                    if (combResult.cellCenters && combResult.cellCenters.length > 0) {
                      combCellPositions = combResult.cellCenters.map(c => Math.round((c / zoomFactor) - combSnapX));
                      combCellWidthsArr = combResult.cellWidths.map(w => Math.round(w / zoomFactor));
                      const lastCellRight = combResult.cellBoundaries[combResult.cellBoundaries.length - 1] + 
                        (combResult.cellWidths[combResult.cellWidths.length - 1] || combResult.cellWidth);
                      combTotalWidth = Math.round((lastCellRight - combResult.firstCellX) / zoomFactor);
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
                // Sample background color from canvas center of placed rectangle
                const canvas = canvasRef.current;
                let fillColor = "#ffffff";
                if (canvas) {
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    const canvasCx = Math.round((fieldX + fieldW / 2) * zoomFactor);
                    const canvasCy = Math.round((fieldY + fieldH / 2) * zoomFactor);
                    if (canvasCx >= 0 && canvasCy >= 0 && canvasCx < canvas.width && canvasCy < canvas.height) {
                      try {
                        const pixel = ctx.getImageData(canvasCx, canvasCy, 1, 1).data;
                        fillColor = `#${[pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, "0")).join("")}`;
                      } catch {
                        fillColor = "#ffffff";
                      }
                    }
                  }
                }
                field = { ...base, type: "whiteout", width: fieldW, height: fieldH, fillColor };
                break;
              }
            }

            onFieldAdd(field);
            onToolSelect(null);
            setCursorStyle("default");
            onFieldSelect(id);

            if (activeTool === "signature") {
              onSignatureFieldPlaced?.(field);
            } else if (activeTool !== "checkbox") {
              setEditingFieldId(id);
            }

            if (snapped) {
              setSnappedFieldId(id);
              setTimeout(() => setSnappedFieldId(null), 600);
            }
          }
        }
        
        // Reset drag drawing state
        isDragDrawing.current = false;
        dragStart.current = null;
        dragCurrent.current = null;
        setDrawRect(null);
      }
    },
    [activeTool, currentPage, zoomFactor, onFieldAdd, onFieldSelect, onToolSelect, onSignatureFieldPlaced, snapPreview]
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
        grid:      { w: 220, h: 30 },
        comb:      { w: 220, h: 30 },
        whiteout:  { w: 100, h: 30 },
      };
      fieldW = defaults[activeTool].w;
      fieldH = defaults[activeTool].h;

      // Checkboxes and signatures never snap, place at click point
      // Also skip snap detection if snapEnabled is false
      if (activeTool !== "checkbox" && activeTool !== "signature" && snapEnabled) {
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

      // Check if snap zone is already occupied by another field on the same page
      const snapZoneOccupied = fields.some((f) =>
        f.page === currentPage &&
        Math.abs(f.x - fieldX) < 10 &&
        Math.abs(f.y - fieldY) < 10
      );
      if (snapZoneOccupied) {
        // Reject snap, fall back to click position
        snapped = false;
        fieldX = posX / zoomFactor;
        fieldY = posY / zoomFactor;
        fieldW = defaults[activeTool].w;
        fieldH = defaults[activeTool].h;
      }

      // Enforce minimum 4px gap between adjacent fields to prevent visual merging
      if (snapped) {
        const pageFields = fields.filter((f) => f.page === currentPage);
        const MIN_GAP = 4;
        
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
          field = { ...base, type: "checkbox", width: fieldW, height: fieldH, checked: true, stamp: "tick" };
          break;
        case "signature":
          field = { ...base, type: "signature", width: fieldW, height: fieldH, value: "", fontSize: inferredFontSize ?? 16 };
          break;
        case "date":
          field = { ...base, type: "date", width: fieldW, height: fieldH, value: new Date().toLocaleDateString("en-AU"), fontSize: inferredFontSize ?? 14 };
          break;
        case "grid":
          field = { ...base, type: "grid", width: fieldW, height: fieldH, value: "", charCount: Math.min(50, Math.max(1, Math.round(fieldW / 24))) };
          break;
        case "comb": {
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
            const combResult3 = detectCombCells(
              combCanvas3,
              fieldX * zoomFactor,
              fieldY * zoomFactor,
              fieldW * zoomFactor,
              fieldH * zoomFactor,
            );
            if (combResult3 && combResult3.cellCount >= 2) {
              combDetectedCellWidth3 = Math.round(combResult3.cellWidth / zoomFactor);
              combDetectedCellCount3 = combResult3.cellCount;
              combSnapX3 = Math.round(combResult3.firstCellX / zoomFactor);
              combSnapY3 = Math.round(combResult3.y / zoomFactor);
              combSnapHeight3 = Math.round(combResult3.height / zoomFactor);
              
              if (combResult3.cellCenters && combResult3.cellCenters.length > 0) {
                combCellPositions3 = combResult3.cellCenters.map(c => Math.round((c / zoomFactor) - combSnapX3));
                combCellWidthsArr3 = combResult3.cellWidths.map(w => Math.round(w / zoomFactor));
                const lastCellRight3 = combResult3.cellBoundaries[combResult3.cellBoundaries.length - 1] + 
                  (combResult3.cellWidths[combResult3.cellWidths.length - 1] || combResult3.cellWidth);
                combTotalWidth3 = Math.round((lastCellRight3 - combResult3.firstCellX) / zoomFactor);
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
          // Sample background color from canvas center of placed rectangle
          const canvas = canvasRef.current;
          let fillColor = "#ffffff";
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              const canvasCx = Math.round(fieldX * zoomFactor + fieldW * zoomFactor / 2);
              const canvasCy = Math.round(fieldY * zoomFactor + fieldH * zoomFactor / 2);
              if (canvasCx >= 0 && canvasCy >= 0 && canvasCx < canvas.width && canvasCy < canvas.height) {
                try {
                  const pixel = ctx.getImageData(canvasCx, canvasCy, 1, 1).data;
                  fillColor = `#${[pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, "0")).join("")}`;
                } catch {
                  fillColor = "#ffffff";
                }
              }
            }
          }
          field = { ...base, type: "whiteout", width: fieldW, height: fieldH, fillColor };
          break;
        }
      }

      onFieldAdd(field);
      onToolSelect(null);
      setCursorStyle("default");
      onFieldSelect(id);

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
    [activeTool, currentPage, onFieldAdd, onFieldSelect, onToolSelect, zoomFactor, snapPreview, onSignatureFieldPlaced, snapEnabled]
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

      // Check if clicked on a whiteout field - treat as empty canvas
      const shape = stage.getIntersection(pos);
      if (shape) {
        const parent = shape.getParent();
        if (parent && parent.id()) {
          const field = pageFields.find(f => f.id === parent.id());
          if (field && field.type === "whiteout") {
            // Whiteout is non-interactive, treat click as empty canvas
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
        }
      }

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
                // Prevent selecting whiteout fields
                if (matchedField.type === "whiteout") {
                  onFieldSelect(null);
                  onToolSelect(null);
                  if (trRef.current) {
                    trRef.current.nodes([]);
                    trRef.current.getLayer()?.batchDraw();
                  }
                } else {
                  onFieldSelect(matchedField.id);
                  onToolSelect(null);
                }
                break;
              }
            }
            node = parent;
          }
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
    [activeTool, currentPage, fields, onFieldSelect, onToolSelect, createFieldAtPoint, snapEnabled]
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

        {(() => {
          const selectedField = selectedFieldId ? pageFields.find(f => f.id === selectedFieldId) : null;
          const selectedFieldIsSnapped = selectedField?.snapped ?? false;
          return (
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
            cursor: activeTool ? cursorStyle : editingFieldId ? "text" : cursorStyle,
          }}
        >
          <Layer>
            {pageFields.map((field) => (
              <FieldShape
                key={field.id}
                field={field}
                isSelected={field.id === selectedFieldId && field.type !== "whiteout"}
                isEditing={field.id === editingFieldId}
                isHighlighted={field.id === snappedFieldId || (highlightFieldIds?.has(field.id) ?? false)}
                isHovered={field.id === hoveredFieldId}
                onSelect={() => {
                  // Prevent selecting whiteout fields
                  if (field.type === "whiteout") return;
                  onFieldSelect(field.id);
                  onToolSelect(null);
                  if (!dragStartedRef.current && field.type !== "signature") {
                    setEditingFieldId(field.id);
                  }
                  // Signature fields: clicking selects only.
                  // Sign Now / Re-sign is triggered from the right panel.
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
                  setIsDragging(true);
                  setEditingFieldId(null);
                  setCursorStyle("grabbing");
                }}
                onDragEnd={(x, y) => {
                  // Whiteout fields don't drag - skip
                  if (field.type === "whiteout") return;
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
                onDoubleClick={() => {
                  if (field.type !== "grid") setEditingFieldId(field.id);
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
                registerNode={registerNode}
                unregisterNode={unregisterNode}
                onContextMenu={(e, fieldId) => {
                  const pos = e.target.getStage()?.getPointerPosition();
                  if (pos) {
                    setContextMenu({ x: pos.x, y: pos.y, fieldId });
                  }
                }}
              />
            ))}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              borderStroke="#3b82f6"
              anchorStroke="#3b82f6"
              anchorFill="#fff"
              anchorSize={8}
              // BUG 3 FIX: Always enable all 8 anchors for resizing
              // Remove the conditional that disabled anchors for snapped fields
              enabledAnchors={["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"]}
              keepRatio={keepRatio ?? false}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 16 || newBox.height < 16) return oldBox;
                return newBox;
              }}
            />
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
                  const field = pageFields.find(f => f.id === contextMenu.fieldId);
                  if (field) {
                    const newId = genId();
                    const duplicate = { ...field, id: newId, x: field.x + 16, y: field.y + 16 };
                    onFieldAdd(duplicate);
                    onToolSelect(null);
                    setCursorStyle("default");
                    onFieldSelect(newId);
                  }
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
          return (
            <div
              style={{
                position: "absolute",
                left: selectedField.x * zoomFactor + 2,
                top: selectedField.y * zoomFactor + 2,
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

        {/* HTML input overlay for text editing */}
        {editingFieldId &&
          (() => {
            const editField = pageFields.find((f) => f.id === editingFieldId);
            if (!editField || editField.type === "checkbox") return null;
            // Signature fields never use text input, always use SignatureModal
            if (editField.type === "signature") return null;
            // Whiteout fields have no text value
            if (editField.type === "whiteout") return null;
            // Grid fields use their own hidden input for per-cell entry
            if (editField.type === "grid") return null;
            const isEditSnapped = editField.snapped ?? false;

            return (
              <input
                key={editingFieldId}
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  const stage = document.querySelector("canvas")?.getBoundingClientRect();
                  if (stage && editField) {
                    setContextMenu({
                      x: e.clientX - stage.left,
                      y: e.clientY - stage.top,
                      fieldId: editField.id,
                    });
                  }
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
  registerNode,
  unregisterNode,
  onContextMenu,
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
  registerNode: (id: string, node: Konva.Group) => void;
  unregisterNode: (id: string) => void;
  onContextMenu?: (e: any, fieldId: string) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);

  // Register/unregister this field's node with the global transformer (skip for whiteout - static)
  // BUG 3 FIX: Signature fields MUST register with Transformer for resize to work
  useEffect(() => {
    if (field.type === "whiteout") return; // Whiteout is static, no transformer
    const node = groupRef.current;
    if (!node) return;
    registerNode(field.id, node);
    return () => {
      unregisterNode(field.id);
    };
  }, [field.id, field.type, registerNode, unregisterNode]);

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

  if (field.type === "checkbox") {
    return (
      <>
        <Group
          id={field.id}
          ref={groupRef}
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
        onContextMenu={(e) => {
          e.evt.preventDefault();
          onContextMenu?.(e, field.id);
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
      </>
    );
  }

  // Whiteout field - static rectangle, no interaction after placement
  if (field.type === "whiteout") {
    const whiteoutField = field as WhiteoutField;
    return (
      <Group
        x={field.x}
        y={field.y}
        listening={false} // Entire group ignores ALL mouse events
      >
        <Rect
          width={field.width}
          height={field.height}
          fill={whiteoutField.fillColor}
          strokeWidth={0}
        />
      </Group>
    );
  }

  // Grid/Comb field rendering - individual character slots with OTP-style input
  // MUST come before generic text field handling to avoid being swallowed by the default return
  if (field.type === "grid" || field.type === "comb") {
    const gridField = field as GridField | import("@/lib/types").CombField;
    const charCount = gridField.charCount ?? (field.type === "comb" ? 9 : 11);
    // Use cellWidth if set, otherwise calculate from field width
    const combCellWidth = (gridField as import("@/lib/types").CombField).cellWidth;
    const slotWidth = combCellWidth ?? (field.width / charCount);
    const slotHeight = field.height;
    const value = gridField.value || "";
    const offsetX = (gridField as import("@/lib/types").CombField).offsetX ?? 0;
    const charOffsetX = (gridField as import("@/lib/types").CombField).charOffsetX ?? 0;
    
    // Use persisted cursor from field data, or default to end of current value
    const initialCursor = (gridField as import("@/lib/types").CombField).cursorIndex ?? Math.min(value.replace(/ +$/, "").length, charCount - 1);
    const [activeSlotIndex, setActiveSlotIndex] = useState(initialCursor);

    // Refs to avoid stale closure
    const activeSlotIndexRef = useRef(initialCursor);
    const valueRef = useRef(value);
    const handleKeyDownRef = useRef<(e: KeyboardEvent) => void>(() => {});

    // Keep refs in sync with state
    useEffect(() => {
      valueRef.current = value;
    }, [value]);

    useEffect(() => {
      activeSlotIndexRef.current = activeSlotIndex;
    }, [activeSlotIndex]);
    
    // When field becomes selected, position cursor at end of existing text
    useEffect(() => {
      if (isSelected) {
        const textLength = value.replace(/ +$/, "").length;
        const newCursor = Math.min(textLength, charCount - 1);
        setActiveSlotIndex(newCursor);
        activeSlotIndexRef.current = newCursor;
      }
    }, [isSelected]);

    // Define handleKeyDown using refs - updated every render for fresh closure
    handleKeyDownRef.current = (e: KeyboardEvent) => {
      const currentIndex = activeSlotIndexRef.current;
      const currentValue = valueRef.current;

      // Handle printable characters (single key, not modifier keys)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (currentIndex < charCount) {
          const paddedValue = currentValue.padEnd(charCount, " ");
          const newValue = paddedValue.slice(0, currentIndex) + e.key + paddedValue.slice(currentIndex + 1);
          onValueChange(newValue);
          const nextIndex = Math.min(currentIndex + 1, charCount - 1);
          setActiveSlotIndex(nextIndex);
          activeSlotIndexRef.current = nextIndex;
        }
        return;
      }
      
      if (e.key === "Backspace") {
        e.preventDefault();
        if (currentIndex > 0) {
          const paddedValue = currentValue.padEnd(charCount, " ");
          const prevIndex = currentIndex - 1;
          const newValue = paddedValue.slice(0, prevIndex) + " " + paddedValue.slice(prevIndex + 1);
          onValueChange(newValue);
          setActiveSlotIndex(prevIndex);
          activeSlotIndexRef.current = prevIndex;
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentIndex > 0) {
          const newIndex = currentIndex - 1;
          setActiveSlotIndex(newIndex);
          activeSlotIndexRef.current = newIndex;
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (currentIndex < charCount - 1) {
          const newIndex = currentIndex + 1;
          setActiveSlotIndex(newIndex);
          activeSlotIndexRef.current = newIndex;
        }
      } else if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        onSelect();
      }
    };

    // Attach/detach document keydown listener when selected
    // Use capture phase to get events before parent handlers
    useEffect(() => {
      if (!isSelected) return;
      const handler = (e: KeyboardEvent) => {
        // Only handle if this is a typing key (not navigation or modifiers alone)
        if (e.key.length === 1 || e.key === "Backspace" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Escape" || e.key === "Enter") {
          handleKeyDownRef.current(e);
        }
      };
      // Use capture phase to intercept before bubbling
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }, [isSelected]);

    const handleSlotClick = (index: number) => {
      setActiveSlotIndex(index);
      activeSlotIndexRef.current = index;
    };

    return (
      <>
        <Group
          id={field.id}
          ref={groupRef}
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
            const rawWidth = Math.max(40, node.width() * scaleX);
            const rawHeight = Math.max(20, node.height() * scaleY);
            const currentCharCount = gridField.charCount ?? (field.type === "comb" ? 9 : 11);
            const cellSize = field.width / currentCharCount;
            const maxCount = field.type === "comb" ? 30 : 50;
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
            width={field.width}
            height={field.height}
            fill={getFill()}
            stroke={getBorderColor()}
            strokeWidth={getBorderWidth()}
            cornerRadius={3}
          />
          
          {/* Individual character slots */}
          {Array.from({ length: charCount }).map((_, i) => {
            const char = value[i] || "";
            const isFilled = char !== "" && char !== " ";
            const isCurrent = i === activeSlotIndex;
            
            // Simple uniform spacing - user adjusts with X Offset slider
            const thisCellWidth = slotWidth;
            const cellLeftX = i * slotWidth;
            
            return (
              <Group
                key={i}
                x={cellLeftX + offsetX}
                y={0}
                width={thisCellWidth}
                height={slotHeight}
                onClick={(e) => {
                  e.cancelBubble = true;
                  handleSlotClick(i);
                  // Also select the field if not already selected
                  if (!isSelected) {
                    onSelect();
                  }
                }}
              >
                {/* Slot border - only visible when selected or hovered */}
                <Rect
                  width={thisCellWidth - 1}
                  height={slotHeight}
                  fill={isCurrent && isSelected ? "rgba(59,130,246,0.18)" : isSelected ? "rgba(59,130,246,0.05)" : "transparent"}
                  stroke={isCurrent && isSelected ? "#3b82f6" : isSelected ? "rgba(59,130,246,0.4)" : "transparent"}
                  strokeWidth={isCurrent && isSelected ? 2.5 : isSelected ? 1 : 0}
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

  // BUG 3 FIX: Signature fields must register with Transformer and be draggable
  // Signature fields should NOT be snapped (they use click-to-place, not snap detection)
  const signatureCanResize = field.type === "signature" && !isSnapped;

  return (
    <>
      <Group
        id={field.id}
        ref={groupRef}
        x={field.x}
      y={field.y}
      width={field.width}
      height={field.height}
      opacity={dragOpacity}
      // BUG 3 FIX: Signature fields are always draggable (never snapped)
      draggable={field.type === "signature" ? true : !isSnapped}
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
      onContextMenu={(e) => {
        e.evt.preventDefault();
        onContextMenu?.(e, field.id);
      }}
    >
      <Rect
        // BUG FIX: Rect must match Group dimensions exactly - no padding subtraction
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
            // BUG FIX: Lock text width to field dimensions - prevent auto-resize on deselect
            // Use exact field width minus padding, with ellipsis to prevent expansion
            width={field.width - (isSnapped ? 4 : 8)}
            height={field.height}
            padding={isSnapped ? 2 : 4}
            verticalAlign="middle"
            align="left"
            wrap="none"
            ellipsis={true}
          />
        )
      )}
      </Group>
    </>
  );
}
