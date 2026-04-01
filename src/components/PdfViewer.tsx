"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Stage, Layer, Rect, Text, Group, Transformer } from "react-konva";
import type Konva from "konva";
import type { EditorField, ToolType } from "@/lib/types";
import { detectSnapBox } from "@/lib/snap-detect";

export interface PdfViewerHandle {
  getCanvasDataURL: () => string | null;
  getCanvasDimensions: () => { width: number; height: number };
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
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedShapeRef = useRef<Konva.Node | null>(null);
  const dragStartedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    getCanvasDataURL: () => canvasRef.current?.toDataURL("image/png") ?? null,
    getCanvasDimensions: () => dimensions,
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

  // Transformer attachment
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;

    if (selectedFieldId && selectedShapeRef.current) {
      tr.nodes([selectedShapeRef.current]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedFieldId]);

  // Keyboard delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedFieldId &&
        !editingFieldId
      ) {
        const target = e.target as HTMLElement;
        const isInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable;
        if (isInput) return;

        e.preventDefault();
        onFieldDelete(selectedFieldId);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFieldId, editingFieldId, onFieldDelete]);

  // Update cursor based on context
  const updateCursor = useCallback((stage: Konva.Stage, pos: { x: number; y: number }) => {
    if (isDragging) {
      setCursorStyle("grabbing");
      return;
    }
    if (activeTool) {
      setCursorStyle("crosshair");
      return;
    }

    // Check if hovering over a field
    const shape = stage.getIntersection(pos);
    if (shape) {
      const parent = shape.getParent();
      // Check if it's an action button (delete/duplicate)
      if (parent && (parent.name() === "action-btn")) {
        setCursorStyle("pointer");
        return;
      }
      setCursorStyle("move");
      return;
    }

    setCursorStyle("default");
  }, [activeTool, isDragging]);

  // Hover snap preview on mouse move
  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      updateCursor(stage, pos);

      if (!activeTool || !canvasRef.current) {
        setSnapPreview(null);
        return;
      }

      // Throttle snap detection
      try {
        const snap = detectSnapBox(canvasRef.current, pos.x, pos.y);
        if (snap) {
          setSnapPreview({
            x: snap.x / zoomFactor,
            y: snap.y / zoomFactor,
            width: snap.width / zoomFactor,
            height: snap.height / zoomFactor,
          });
        } else {
          setSnapPreview(null);
        }
      } catch {
        setSnapPreview(null);
      }
    },
    [activeTool, zoomFactor, updateCursor]
  );

  const handleStageMouseLeave = useCallback(() => {
    setSnapPreview(null);
    setCursorStyle(activeTool ? "crosshair" : "default");
  }, [activeTool]);

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
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
        const id = genId();

        let fieldX = pos.x / zoomFactor;
        let fieldY = pos.y / zoomFactor;
        let fieldW: number;
        let fieldH: number;
        let snapped = false;

        // Default sizes per tool
        const defaults = {
          text: { w: 200, h: 28 },
          checkbox: { w: 24, h: 24 },
          signature: { w: 200, h: 40 },
          date: { w: 160, h: 28 },
        };
        fieldW = defaults[activeTool].w;
        fieldH = defaults[activeTool].h;

        // Use snap preview if available, otherwise try detection
        if (snapPreview) {
          fieldX = snapPreview.x;
          fieldY = snapPreview.y;
          fieldW = snapPreview.width;
          fieldH = snapPreview.height;
          snapped = true;
        } else if (canvasRef.current) {
          try {
            const snap = detectSnapBox(canvasRef.current, pos.x, pos.y);
            if (snap) {
              fieldX = snap.x / zoomFactor;
              fieldY = snap.y / zoomFactor;
              fieldW = snap.width / zoomFactor;
              fieldH = snap.height / zoomFactor;
              snapped = true;
            }
          } catch {
            // Fall back to default placement
          }
        }

        const base = { id, x: fieldX, y: fieldY, page: currentPage };

        let field: EditorField;
        switch (activeTool) {
          case "text":
            field = { ...base, type: "text", width: fieldW, height: fieldH, value: "", fontSize: 14 };
            break;
          case "checkbox":
            field = { ...base, type: "checkbox", width: fieldW, height: fieldH, checked: false };
            break;
          case "signature":
            field = { ...base, type: "signature", width: fieldW, height: fieldH, value: "", fontSize: 16 };
            break;
          case "date":
            field = { ...base, type: "date", width: fieldW, height: fieldH, value: new Date().toLocaleDateString("en-US"), fontSize: 14 };
            break;
        }

        onFieldAdd(field);
        onFieldSelect(id);

        // Immediately enter edit mode for text-like fields
        if (activeTool !== "checkbox") {
          setEditingFieldId(id);
        }

        // Flash blue border on snap
        if (snapped) {
          setSnappedFieldId(id);
          setTimeout(() => setSnappedFieldId(null), 500);
        }
      } else {
        onFieldSelect(null);
        setEditingFieldId(null);
      }
    },
    [activeTool, currentPage, fields, onFieldAdd, onFieldSelect, onToolSelect, zoomFactor, snapPreview]
  );

  const pageFields = fields.filter((f) => f.page === currentPage);

  return (
    <div ref={containerRef} className="relative flex-1 overflow-auto bg-[#f0f0f0] p-4">
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

        <Stage
          width={dimensions.width}
          height={dimensions.height}
          scaleX={zoomFactor}
          scaleY={zoomFactor}
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
            {/* Snap preview rectangle with blue dashed border */}
            {activeTool && snapPreview && (
              <>
                <Rect
                  x={snapPreview.x}
                  y={snapPreview.y}
                  width={snapPreview.width}
                  height={snapPreview.height}
                  fill="rgba(79, 142, 247, 0.08)"
                  stroke="#4f8ef7"
                  strokeWidth={1.5}
                  dash={[4, 3]}
                  cornerRadius={2}
                  listening={false}
                />
                <Text
                  x={snapPreview.x + snapPreview.width - 32}
                  y={snapPreview.y - 16}
                  text="Snap"
                  fontSize={10}
                  fill="#4f8ef7"
                  fontStyle="bold"
                  listening={false}
                />
              </>
            )}

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
                  onToolSelect(null); // FIX 3: Clear active tool when selecting a field
                  selectedShapeRef.current = null;
                  if (!dragStartedRef.current) {
                    setEditingFieldId(field.id);
                  }
                }}
                onMouseEnter={() => {
                  setHoveredFieldId(field.id);
                  if (!activeTool && !isDragging) {
                    setCursorStyle("move");
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
                  // Reset drag flag after a tick so onClick doesn't trigger edit
                  setTimeout(() => { dragStartedRef.current = false; }, 50);
                }}
                onTransformStart={() => {
                  setEditingFieldId(null);
                }}
                onTransformEnd={(width, height, x, y) =>
                  onFieldUpdate(field.id, { width, height, x, y })
                }
                onDoubleClick={() => setEditingFieldId(field.id)}
                onDelete={() => onFieldDelete(field.id)}
                onDuplicate={onFieldDuplicate ? () => onFieldDuplicate(field.id) : undefined}
                onValueChange={(value) => {
                  if (field.type === "checkbox") {
                    onFieldUpdate(field.id, { checked: value } as Partial<EditorField>);
                  } else {
                    onFieldUpdate(field.id, { value } as Partial<EditorField>);
                  }
                }}
                setSelectedRef={(node) => {
                  if (field.id === selectedFieldId) {
                    selectedShapeRef.current = node;
                    if (transformerRef.current && node) {
                      transformerRef.current.nodes([node]);
                      transformerRef.current.getLayer()?.batchDraw();
                    }
                  }
                }}
              />
            ))}
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              borderStroke="#4f8ef7"
              anchorStroke="#4f8ef7"
              anchorFill="#fff"
              anchorSize={8}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 20 || newBox.height < 16) return oldBox;
                return newBox;
              }}
            />
          </Layer>
        </Stage>

        {/* HTML input overlay for text editing */}
        {editingFieldId &&
          (() => {
            const editField = pageFields.find((f) => f.id === editingFieldId);
            if (!editField || editField.type === "checkbox") return null;

            return (
              <input
                autoFocus
                type="text"
                className="absolute z-20 border-2 border-accent bg-white/90 px-1 outline-none"
                style={{
                  left: editField.x * zoomFactor,
                  top: editField.y * zoomFactor,
                  width: editField.width * zoomFactor,
                  height: editField.height * zoomFactor,
                  fontSize:
                    ((editField as { fontSize?: number }).fontSize ?? 14) *
                    zoomFactor,
                  fontFamily:
                    editField.type === "signature" ? "cursive" : "inherit",
                  cursor: "text",
                }}
                value={editField.value}
                placeholder={
                  editField.type === "signature"
                    ? "Type your signature"
                    : editField.type === "date"
                    ? "MM/DD/YYYY"
                    : "Type here..."
                }
                onChange={(e) =>
                  onFieldUpdate(editField.id, {
                    value: e.target.value,
                  } as Partial<EditorField>)
                }
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
  setSelectedRef,
  onDelete,
  onDuplicate,
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
  onValueChange: (value: string | boolean) => void;
  setSelectedRef: (node: Konva.Node | null) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  const groupRef = useRef<Konva.Group>(null);

  useEffect(() => {
    if (isSelected && groupRef.current) {
      setSelectedRef(groupRef.current);
    }
  }, [isSelected, setSelectedRef]);

  // Updated field styling per FIX 4
  const getBorderColor = () => {
    if (isHighlighted) return "#2563eb";
    if (isSelected || isEditing) return "#4f8ef7";
    if (isHovered) return "rgba(79,142,247,0.6)";
    return "rgba(79,142,247,0.4)";
  };
  const getBorderWidth = () => {
    if (isHighlighted) return 3;
    if (isSelected || isEditing) return 2;
    if (isHovered) return 1.5;
    return 1;
  };
  const getFill = () => {
    if (isSelected || isEditing) return "rgba(79,142,247,0.05)";
    if (isHovered) return "rgba(79,142,247,0.03)";
    return "transparent";
  };

  if (field.type === "checkbox") {
    return (
      <Group
        ref={groupRef}
        x={field.x}
        y={field.y}
        width={field.width}
        height={field.height}
        draggable
        onMouseEnter={() => onMouseEnter?.()}
        onMouseLeave={() => onMouseLeave?.()}
        onClick={(e) => {
          e.cancelBubble = true;
          if (isSelected) {
            onValueChange(!field.checked);
          } else {
            onSelect();
          }
        }}
        onDragStart={() => onDragStart?.()}
        onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
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
        <Rect
          width={field.width}
          height={field.height}
          fill={field.checked ? "rgba(79,142,247,0.08)" : "white"}
          stroke={isHighlighted ? "#2563eb" : isSelected ? "#4f8ef7" : isHovered ? "rgba(79,142,247,0.6)" : "#d1d5db"}
          strokeWidth={isHighlighted ? 3 : isSelected ? 2 : isHovered ? 1.5 : 1}
          cornerRadius={3}
        />
        {field.checked && (
          <Text
            text={"\u2713"}
            fontSize={field.height * 0.75}
            fill="#4f8ef7"
            width={field.width}
            height={field.height}
            align="center"
            verticalAlign="middle"
            fontStyle="bold"
          />
        )}
        {/* Action chip for checkbox */}
        {isSelected && (
          <ActionChip
            fieldWidth={field.width}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
          />
        )}
      </Group>
    );
  }

  // Text, date, signature fields
  const displayValue =
    field.value ||
    (field.type === "signature"
      ? "Click to sign"
      : field.type === "date"
      ? "Click for date"
      : "Click to type...");
  const isEmpty = !field.value;

  return (
    <Group
      ref={groupRef}
      x={field.x}
      y={field.y}
      width={field.width}
      height={field.height}
      draggable
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
      onDragStart={() => onDragStart?.()}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
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
        fill={getFill()}
        stroke={getBorderColor()}
        strokeWidth={getBorderWidth()}
        cornerRadius={3}
      />
      {!isEditing && (
        <Text
          text={displayValue}
          fontSize={(field as { fontSize?: number }).fontSize ?? 14}
          fill={isEmpty ? "#9ca3af" : "#1a1a2e"}
          fontFamily={field.type === "signature" ? "cursive" : "Arial"}
          fontStyle={field.type === "signature" ? "italic" : "normal"}
          width={field.width - 4}
          height={field.height}
          padding={4}
          verticalAlign="middle"
          ellipsis
          wrap="none"
        />
      )}
      {/* Action chip: duplicate + delete */}
      {isSelected && (
        <ActionChip
          fieldWidth={field.width}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      )}
    </Group>
  );
}

/** Floating action chip above the selected field with duplicate + delete buttons */
function ActionChip({
  fieldWidth,
  onDelete,
  onDuplicate,
}: {
  fieldWidth: number;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  const chipWidth = onDuplicate ? 56 : 28;
  const chipX = fieldWidth / 2 - chipWidth / 2;

  return (
    <Group x={chipX} y={-32} name="action-btn">
      {/* Background pill */}
      <Rect
        width={chipWidth}
        height={24}
        fill="#1f2937"
        cornerRadius={12}
        shadowColor="rgba(0,0,0,0.15)"
        shadowBlur={6}
        shadowOffsetY={2}
      />

      {/* Duplicate button */}
      {onDuplicate && (
        <Group
          x={4}
          y={0}
          name="action-btn"
          onClick={(e) => {
            e.cancelBubble = true;
            onDuplicate();
          }}
        >
          <Rect width={24} height={24} fill="transparent" cornerRadius={12} />
          <Text
            text="⧉"
            fontSize={14}
            fill="#d1d5db"
            width={24}
            height={24}
            align="center"
            verticalAlign="middle"
          />
        </Group>
      )}

      {/* Delete button */}
      {onDelete && (
        <Group
          x={onDuplicate ? 28 : 0}
          y={0}
          name="action-btn"
          onClick={(e) => {
            e.cancelBubble = true;
            onDelete();
          }}
        >
          <Rect width={28} height={24} fill="transparent" cornerRadius={12} />
          <Text
            text="×"
            fontSize={16}
            fill="#f87171"
            width={28}
            height={24}
            align="center"
            verticalAlign="middle"
            fontStyle="bold"
          />
        </Group>
      )}
    </Group>
  );
}
