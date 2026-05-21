"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface UseSignaturePadOptions {
  width?: number;
  height?: number;
}

type Point = { x: number; y: number };

function catmullRomPath(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  tension = 0.5,
) {
  if (pts.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    return;
  }

  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 2;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 2;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 2;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 2;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.stroke();
}

function simplifyPoints(pts: Point[], minDist = 2): Point[] {
  if (pts.length <= 2) return pts;
  const result = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    const prev = result[result.length - 1];
    const dx = pts[i].x - prev.x;
    const dy = pts[i].y - prev.y;
    if (Math.sqrt(dx * dx + dy * dy) >= minDist) {
      result.push(pts[i]);
    }
  }
  return result;
}

function resetDrawingStyle(ctx: CanvasRenderingContext2D) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0d0d1a";
  ctx.fillStyle = "#0d0d1a";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

function drawDot(ctx: CanvasRenderingContext2D, pt: Point, radius = 1.2) {
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Point[], minDist: number, width = 2) {
  const pts = simplifyPoints(stroke, minDist);
  if (pts.length === 0) return;
  if (pts.length === 1) {
    drawDot(ctx, pts[0], Math.max(1, width / 2));
    return;
  }
  ctx.lineWidth = width;
  catmullRomPath(ctx, pts);
}

export function useSignaturePad({
  width = 400,
  height = 180,
}: UseSignaturePadOptions = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const currentRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  const hasContentRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [hasContent, setHasContent] = useState(false);

  const markHasContent = useCallback(() => {
    if (hasContentRef.current) return;
    hasContentRef.current = true;
    setHasContent(true);
  }, []);

  const initCtx = useCallback((canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resetDrawingStyle(ctx);
    ctx.lineWidth = 2;
    return ctx;
  }, [width, height]);

  const clearCanvasPixels = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    resetDrawingStyle(ctx);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initCtx(canvas);
    strokesRef.current = [];
    currentRef.current = [];
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    hasContentRef.current = false;
    setHasContent(false);
  }, [initCtx]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    clearCanvasPixels(canvas);

    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke, 1.5, 2);
    }

    const current = currentRef.current;
    if (current.length > 0) {
      const pts = simplifyPoints(current, 1);
      let totalDist = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        totalDist += Math.sqrt(dx * dx + dy * dy);
      }
      const avgSpeed = totalDist / Math.max(1, pts.length - 1);
      const pressureWidth = Math.max(0.8, Math.min(2.8, 2.8 - avgSpeed * 0.04));
      drawStroke(ctx, current, 1, pressureWidth);
    }
  }, [clearCanvasPixels]);

  const getPoint = useCallback((e: MouseEvent | Touch | PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return {
      x: Math.max(0, Math.min(width, x)),
      y: Math.max(0, Math.min(height, y)),
    };
  }, [width, height]);

  const startStroke = useCallback((pt: Point) => {
    isDrawingRef.current = true;
    currentRef.current = [pt];
    markHasContent();
    redraw();
  }, [markHasContent, redraw]);

  const continueStroke = useCallback((pt: Point) => {
    if (!isDrawingRef.current) return;
    currentRef.current.push(pt);
    markHasContent();
    redraw();
  }, [markHasContent, redraw]);

  const endStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentRef.current.length > 0) {
      strokesRef.current.push([...currentRef.current]);
      currentRef.current = [];
      redraw();
    }
  }, [redraw]);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    activePointerIdRef.current = e.pointerId;
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    startStroke(getPoint(e));
  }, [startStroke, getPoint]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    continueStroke(getPoint(e));
  }, [continueStroke, getPoint]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
    activePointerIdRef.current = null;
    endStroke();
  }, [endStroke]);

  const onMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startStroke(getPoint(e));
  }, [startStroke, getPoint]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    e.preventDefault();
    continueStroke(getPoint(e));
  }, [continueStroke, getPoint]);

  const onMouseUp = useCallback((e?: MouseEvent) => {
    e?.preventDefault();
    endStroke();
  }, [endStroke]);

  const onTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.touches.length === 1) startStroke(getPoint(e.touches[0]));
  }, [startStroke, getPoint]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.touches.length === 1) continueStroke(getPoint(e.touches[0]));
  }, [continueStroke, getPoint]);

  const onTouchEnd = useCallback((e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    endStroke();
  }, [endStroke]);

  const attachEvents = useCallback((canvas: HTMLCanvasElement) => {
    cleanupRef.current?.();

    if (window.PointerEvent) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);

      cleanupRef.current = () => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      };
      return;
    }

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    cleanupRef.current = () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onMouseDown, onMouseMove, onMouseUp, onPointerDown, onPointerMove, onPointerUp, onTouchStart, onTouchMove, onTouchEnd]);

  const canvasCallbackRef = useCallback((el: HTMLCanvasElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    canvasRef.current = el;
    if (el) attachEvents(el);
  }, [attachEvents]);

  useEffect(() => () => cleanupRef.current?.(), []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    clearCanvasPixels(canvas);
    strokesRef.current = [];
    currentRef.current = [];
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    hasContentRef.current = false;
    setHasContent(false);
  }, [clearCanvasPixels]);

  const toDataURL = useCallback((): string | null => {
    if (!hasContentRef.current) return null;

    const points = strokesRef.current.flat();
    if (points.length === 0) return null;

    const pad = 14;
    const minX = Math.max(0, Math.min(...points.map((point) => point.x)) - pad);
    const minY = Math.max(0, Math.min(...points.map((point) => point.y)) - pad);
    const maxX = Math.min(width, Math.max(...points.map((point) => point.x)) + pad);
    const maxY = Math.min(height, Math.max(...points.map((point) => point.y)) + pad);
    const trimW = Math.max(1, Math.ceil(maxX - minX));
    const trimH = Math.max(1, Math.ceil(maxY - minY));

    const scale = 3;
    const out = document.createElement("canvas");
    out.width = trimW * scale;
    out.height = trimH * scale;

    const outCtx = out.getContext("2d")!;
    outCtx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
    resetDrawingStyle(outCtx);

    for (const stroke of strokesRef.current) {
      drawStroke(outCtx, stroke, 1.5, 2);
    }

    return out.toDataURL("image/png");
  }, [width, height]);

  const canvasElement = (
    <canvas
      ref={canvasCallbackRef}
      style={{
        width,
        height,
        cursor: "crosshair",
        touchAction: "none",
        pointerEvents: "auto",
        display: "block",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    />
  );

  return { canvasElement, clear, toDataURL, hasContent };
}
