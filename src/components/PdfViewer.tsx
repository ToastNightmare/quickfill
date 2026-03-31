"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Stage, Layer, Rect, Text, Group, Transformer, Circle } from "react-konva";
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
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedShapeRef = useRef<Konva.Node | null>(null);

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
        e.preventDefault();
        onFieldDelete(selectedFieldId);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFieldId, editingFieldId, onFieldDelete]);

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Clicked on empty area
      if (e.target === stage || e.target.getParent() === stage) {
        if (activeTool) {
          const id = genId();

          // Try snap detection on the PDF canvas
          let snapped = false;
          let fieldX = pos.x / zoomFactor;
          let fieldY = pos.y / zoomFactor;
          let fieldW: number;
          let fieldH: number;

          // Default sizes per tool
          const defaults = {
            text: { w: 200, h: 28 },
            checkbox: { w: 24, h: 24 },
            signature: { w: 200, h: 40 },
            date: { w: 160, h: 28 },
          };
          fieldW = defaults[activeTool].w;
          fieldH = defaults[activeTool].h;

          if (canvasRef.current) {
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

          // Flash blue border on snap
          if (snapped) {
            setSnappedFieldId(id);
            setTimeout(() => setSnappedFieldId(null), 500);
          }
        } else {
          onFieldSelect(null);
          setEditingFieldId(null);
        }
      }
    },
    [activeTool, currentPage, onFieldAdd, onFieldSelect, zoomFactor]
  );

  const pageFields = fields.filter((f) => f.page === currentPage);

  return (
    <div ref={containerRef} className="relative flex-1 overflow-auto bg-gray-100 p-4">
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
        className="relative mx-auto shadow-lg"
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
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            cursor: activeTool ? "crosshair" : "default",
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
                onSelect={() => {
                  onFieldSelect(field.id);
                  selectedShapeRef.current = null;
                  // Single click starts editing immediately
                  setEditingFieldId(field.id);
                }}
                onDragStart={() => setEditingFieldId(null)}
                onDragEnd={(x, y) => onFieldUpdate(field.id, { x, y })}
                onTransformStart={() => setEditingFieldId(null)}
                onTransformEnd={(width, height, x, y) =>
                  onFieldUpdate(field.id, { width, height, x, y })
                }
                onDoubleClick={() => setEditingFieldId(field.id)}
                onDelete={() => onFieldDelete(field.id)}
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
  onSelect,
  onDragStart,
  onDragEnd,
  onTransformStart,
  onTransformEnd,
  onDoubleClick,
  onValueChange,
  setSelectedRef,
  onDelete,
}: {
  field: EditorField;
  isSelected: boolean;
  isEditing: boolean;
  isHighlighted: boolean;
  onSelect: () => void;
  onDragStart?: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformStart?: () => void;
  onTransformEnd: (w: number, h: number, x: number, y: number) => void;
  onDoubleClick: () => void;
  onValueChange: (value: string | boolean) => void;
  setSelectedRef: (node: Konva.Node | null) => void;
  onDelete?: () => void;
}) {
  const groupRef = useRef<Konva.Group>(null);

  useEffect(() => {
    if (isSelected && groupRef.current) {
      setSelectedRef(groupRef.current);
    }
  }, [isSelected, setSelectedRef]);

  if (field.type === "checkbox") {
    return (
      <Group
        ref={groupRef}
        x={field.x}
        y={field.y}
        width={field.width}
        height={field.height}
        draggable
        onClick={(e) => {
          e.cancelBubble = true;
          if (isSelected) {
            onValueChange(!field.checked);
          } else {
            onSelect();
          }
        }}
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
          fill="white"
          stroke={isHighlighted ? "#2563eb" : isSelected ? "#4f8ef7" : "#d1d5db"}
          strokeWidth={isHighlighted ? 3 : isSelected ? 2 : 1}
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
        fill="transparent"
        stroke={isHighlighted ? "#2563eb" : isSelected || isEditing ? "#4f8ef7" : "transparent"}
        strokeWidth={isHighlighted ? 3 : isSelected || isEditing ? 2 : 0}
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
      {isSelected && onDelete && (
        <Group
          x={field.width - 14}
          y={-14}
          onClick={(e) => {
            e.cancelBubble = true;
            onDelete();
          }}
        >
          <Circle radius={14} fill="#dc2626" stroke="white" strokeWidth={2} />
          <Text
            text="×"
            fontSize={18}
            fill="white"
            width={28}
            height={28}
            x={-14}
            y={-14}
            align="center"
            verticalAlign="middle"
            fontStyle="bold"
          />
        </Group>
      )}
    </Group>
  );
}
