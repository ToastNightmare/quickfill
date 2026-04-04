"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface UseSignaturePadOptions {
  width?: number;
  height?: number;
}

// ── Catmull-Rom spline through points ─────────────────────────────────────────
// Produces a smooth curve that passes through every recorded point.
// tension: 0 = loose, 0.5 = standard, 1 = tight
function catmullRomPath(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  tension = 0.4
) {
  if (pts.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    return;
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Catmull-Rom → cubic bezier control points
    const cp1x = p1.x + (p2.x - p0.x) * tension / 2;
    const cp1y = p1.y + (p2.y - p0.y) * tension / 2;
    const cp2x = p2.x - (p3.x - p1.x) * tension / 2;
    const cp2y = p2.y - (p3.y - p1.y) * tension / 2;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.stroke();
}

// ── Lightweight point simplification (Douglas-Peucker lite) ──────────────────
// Removes points that are too close together — reduces noise without losing shape
function simplifyPoints(
  pts: { x: number; y: number }[],
  minDist = 2
): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;
  const result = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    const dx = pts[i].x - prev.x;
    const dy = pts[i].y - prev.y;
    if (Math.sqrt(dx * dx + dy * dy) >= minDist) {
      result.push(pts[i]);
    }
  }
  return result;
}

export function useSignaturePad({
  width = 400,
  height = 180,
}: UseSignaturePadOptions = {}) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  // All strokes stored — array of point arrays
  const strokesRef    = useRef<{ x: number; y: number }[][]>([]);
  const currentRef    = useRef<{ x: number; y: number }[]>([]);
  const isDrawingRef  = useRef(false);
  const hasContentRef = useRef(false);
  const [hasContent, setHasContent] = useState(false);

  // ── Init canvas ─────────────────────────────────────────────────────────────
  const initCtx = useCallback((canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(width  * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap              = "round";
    ctx.lineJoin             = "round";
    ctx.strokeStyle          = "#1a1a2e";
    ctx.lineWidth            = 2.0;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return ctx;
  }, [width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initCtx(canvas);
    strokesRef.current    = [];
    currentRef.current    = [];
    isDrawingRef.current  = false;
    hasContentRef.current = false;
    setHasContent(false);
  }, [initCtx]);

  // ── Redraw everything from stored strokes ─────────────────────────────────
  // This is the key — we redraw the full smooth path on every point added
  // instead of appending raw segments, giving perfectly smooth curves.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // Clear
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Reset stroke style
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#1a1a2e";

    // Draw completed strokes
    for (const stroke of strokesRef.current) {
      const pts = simplifyPoints(stroke, 1.5);
      if (pts.length < 2) continue;
      ctx.lineWidth = 2.0;
      catmullRomPath(ctx, pts);
    }

    // Draw current stroke in progress
    const current = currentRef.current;
    if (current.length >= 2) {
      const pts = simplifyPoints(current, 1.0);
      ctx.lineWidth = 2.0;
      catmullRomPath(ctx, pts);
    }
  }, []);

  // ── Point helpers ──────────────────────────────────────────────────────────
  const getPoint = useCallback((e: MouseEvent | Touch) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // ── Stroke handlers ────────────────────────────────────────────────────────
  const startStroke = useCallback((pt: { x: number; y: number }) => {
    isDrawingRef.current = true;
    currentRef.current   = [pt];

    // Dot for tap
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.0, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const continueStroke = useCallback((pt: { x: number; y: number }) => {
    if (!isDrawingRef.current) return;
    currentRef.current.push(pt);
    // Redraw everything smoothly
    redraw();

    if (!hasContentRef.current) {
      hasContentRef.current = true;
      setHasContent(true);
    }
  }, [redraw]);

  const endStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    // Finalise current stroke into strokes list
    if (currentRef.current.length > 0) {
      strokesRef.current.push([...currentRef.current]);
      currentRef.current = [];
      redraw();
    }

    if (!hasContentRef.current) {
      hasContentRef.current = true;
      setHasContent(true);
    }
  }, [redraw]);

  // ── Event handlers ─────────────────────────────────────────────────────────
  const onMouseDown  = useCallback((e: MouseEvent)  => { e.preventDefault(); e.stopPropagation(); startStroke(getPoint(e)); },    [startStroke, getPoint]);
  const onMouseMove  = useCallback((e: MouseEvent)  => { e.preventDefault(); continueStroke(getPoint(e)); },                      [continueStroke, getPoint]);
  const onMouseUp    = useCallback(()               => endStroke(),                                                                [endStroke]);
  const onTouchStart = useCallback((e: TouchEvent)  => { e.preventDefault(); e.stopPropagation(); if (e.touches.length === 1) startStroke(getPoint(e.touches[0])); },   [startStroke, getPoint]);
  const onTouchMove  = useCallback((e: TouchEvent)  => { e.preventDefault(); if (e.touches.length === 1) continueStroke(getPoint(e.touches[0])); },                     [continueStroke, getPoint]);
  const onTouchEnd   = useCallback((e: TouchEvent)  => { e.preventDefault(); endStroke(); },                                      [endStroke]);

  // ── Attach events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("mousedown",  onMouseDown);
    canvas.addEventListener("mousemove",  onMouseMove);
    canvas.addEventListener("mouseup",    onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd,   { passive: false });

    return () => {
      canvas.removeEventListener("mousedown",  onMouseDown);
      canvas.removeEventListener("mousemove",  onMouseMove);
      canvas.removeEventListener("mouseup",    onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove",  onTouchMove);
      canvas.removeEventListener("touchend",   onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // ── Clear ──────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth   = 2.0;

    strokesRef.current    = [];
    currentRef.current    = [];
    isDrawingRef.current  = false;
    hasContentRef.current = false;
    setHasContent(false);
  }, []);

  // ── Export ─────────────────────────────────────────────────────────────────
  const toDataURL = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContentRef.current) return null;
    const ctx = canvas.getContext("2d")!;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width: iw, height: ih } = imageData;

    let minX = iw, minY = ih, maxX = 0, maxY = 0;
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        if (data[(y * iw + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) return null;

    const pad = 14;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(iw - 1, maxX + pad);
    maxY = Math.min(ih - 1, maxY + pad);

    const trimW = maxX - minX + 1;
    const trimH = maxY - minY + 1;
    const trimmed = ctx.getImageData(minX, minY, trimW, trimH);

    const out = document.createElement("canvas");
    out.width  = trimW;
    out.height = trimH;
    const outCtx = out.getContext("2d")!;
    outCtx.putImageData(trimmed, 0, 0);
    return out.toDataURL("image/png");
  }, []);

  const canvasElement = (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        cursor: "crosshair",
        touchAction: "none",
        pointerEvents: "auto",
        display: "block",
        userSelect: "none",
      }}
    />
  );

  return { canvasElement, clear, toDataURL, hasContent };
}
