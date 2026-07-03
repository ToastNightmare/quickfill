"use client";

import { useCallback, useRef } from "react";
import {
  clampCropRect,
  MIN_CROP_FRACTION,
  type CropRect,
} from "@/lib/image-cleanup";

type DragMode = "move" | "nw" | "ne" | "sw" | "se";

type DragState = {
  mode: DragMode;
  startX: number;
  startY: number;
  startCrop: CropRect;
};

type CropOverlayProps = {
  /** Normalized crop rect (0..1) currently applied. */
  crop: CropRect;
  /** Called with the clamped crop rect while the user drags. */
  onChange: (crop: CropRect) => void;
};

const HANDLES: { mode: Exclude<DragMode, "move">; position: string; cursor: string }[] = [
  { mode: "nw", position: "left-0 top-0", cursor: "cursor-nwse-resize" },
  { mode: "ne", position: "right-0 top-0", cursor: "cursor-nesw-resize" },
  { mode: "sw", position: "left-0 bottom-0", cursor: "cursor-nesw-resize" },
  { mode: "se", position: "right-0 bottom-0", cursor: "cursor-nwse-resize" },
];

/**
 * Manual crop selection drawn over the photo cleanup preview.
 *
 * The overlay fills its positioned parent (which wraps the preview canvas),
 * so normalized coordinates map 1:1 onto the displayed image. All crop math
 * stays in normalized 0..1 space; pixels only appear at the pointer boundary.
 */
export function CropOverlay({ crop, onChange }: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const toNormalized = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const beginDrag = useCallback(
    (mode: DragMode) => (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const point = toNormalized(event.clientX, event.clientY);
      if (!point) return;
      dragRef.current = { mode, startX: point.x, startY: point.y, startCrop: crop };
      const element = event.currentTarget;
      if (typeof element.setPointerCapture === "function") {
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort; dragging still works without it.
        }
      }
    },
    [crop, toNormalized]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      const point = toNormalized(event.clientX, event.clientY);
      if (!point) return;

      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      const start = drag.startCrop;
      let next: CropRect;

      if (drag.mode === "move") {
        next = {
          x: Math.min(1 - start.width, Math.max(0, start.x + dx)),
          y: Math.min(1 - start.height, Math.max(0, start.y + dy)),
          width: start.width,
          height: start.height,
        };
      } else {
        let left = start.x;
        let top = start.y;
        let right = start.x + start.width;
        let bottom = start.y + start.height;
        if (drag.mode === "nw" || drag.mode === "sw") {
          left = Math.min(right - MIN_CROP_FRACTION, Math.max(0, start.x + dx));
        } else {
          right = Math.max(left + MIN_CROP_FRACTION, Math.min(1, start.x + start.width + dx));
        }
        if (drag.mode === "nw" || drag.mode === "ne") {
          top = Math.min(bottom - MIN_CROP_FRACTION, Math.max(0, start.y + dy));
        } else {
          bottom = Math.max(top + MIN_CROP_FRACTION, Math.min(1, start.y + start.height + dy));
        }
        next = { x: left, y: top, width: right - left, height: bottom - top };
      }

      onChange(clampCropRect(next));
    },
    [onChange, toNormalized]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="crop-overlay"
      className="absolute inset-0 touch-none select-none overflow-hidden"
    >
      <div
        data-testid="crop-box"
        aria-label="Crop area"
        className="absolute cursor-move border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`,
        }}
        onPointerDown={beginDrag("move")}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {HANDLES.map(({ mode, position, cursor }) => (
          <div
            key={mode}
            data-testid={`crop-handle-${mode}`}
            aria-label={`Crop handle ${mode}`}
            className={`absolute flex h-10 w-10 items-center justify-center ${position} ${cursor}`}
            onPointerDown={beginDrag(mode)}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="h-4 w-4 rounded-full border-2 border-accent bg-white shadow" />
          </div>
        ))}
      </div>
    </div>
  );
}
