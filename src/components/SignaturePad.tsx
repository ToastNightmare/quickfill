"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface UseSignaturePadOptions {
  width?: number;
  height?: number;
}

export function useSignaturePad({
  width = 400,
  height = 180,
}: UseSignaturePadOptions = {}) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const isDrawingRef   = useRef(false);
  const pointsRef      = useRef<{ x: number; y: number }[]>([]);
  const hasContentRef  = useRef(false);
  const [hasContent, setHasContent] = useState(false);

  // ── Canvas setup ────────────────────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(width  * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth   = 2.2;
    // Slight smoothing for crisp curves
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }, [width, height]);

  useEffect(() => {
    initCanvas();
    isDrawingRef.current  = false;
    pointsRef.current     = [];
    hasContentRef.current = false;
    setHasContent(false);
  }, [initCanvas]);

  // ── Point helpers ──────────────────────────────────────────────────────────
  const getPoint = useCallback((e: MouseEvent | Touch) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top),
    };
  }, []);

  // ── Bezier curve drawing ───────────────────────────────────────────────────
  // Draws a smooth curve through the last 3+ points using quadratic bezier midpoints
  const drawSmooth = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts = pointsRef.current;
    if (pts.length < 2) return;

    ctx.beginPath();

    if (pts.length === 2) {
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      // Last segment to current point
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }, []);

  // ── Pressure simulation — vary line width based on speed ──────────────────
  const getVelocity = useCallback((pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return 0;
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  }, []);

  // ── Start stroke ───────────────────────────────────────────────────────────
  const startStroke = useCallback((pt: { x: number; y: number }) => {
    isDrawingRef.current = true;
    pointsRef.current    = [pt];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Dot for tap/click
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // ── Continue stroke ────────────────────────────────────────────────────────
  const continueStroke = useCallback((pt: { x: number; y: number }) => {
    if (!isDrawingRef.current) return;
    const pts = pointsRef.current;
    pts.push(pt);

    // Vary line width by velocity for natural feel
    const vel = getVelocity(pts);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Faster = slightly thinner (pen lifts), slower = slightly thicker
    ctx.lineWidth = Math.max(1.4, Math.min(3.0, 2.8 - vel * 0.04));

    drawSmooth();

    if (!hasContentRef.current) {
      hasContentRef.current = true;
      setHasContent(true);
    }
  }, [drawSmooth, getVelocity]);

  // ── End stroke ─────────────────────────────────────────────────────────────
  const endStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    pointsRef.current    = [];
    if (!hasContentRef.current) {
      hasContentRef.current = true;
      setHasContent(true);
    }
  }, []);

  // ── Event handlers ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    startStroke(getPoint(e));
  }, [startStroke, getPoint]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    e.preventDefault();
    continueStroke(getPoint(e));
  }, [continueStroke, getPoint]);

  const handleMouseUp   = useCallback(() => endStroke(), [endStroke]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.touches.length === 1) startStroke(getPoint(e.touches[0]));
  }, [startStroke, getPoint]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) continueStroke(getPoint(e.touches[0]));
  }, [continueStroke, getPoint]);

  const handleTouchEnd  = useCallback((e: TouchEvent) => {
    e.preventDefault(); endStroke();
  }, [endStroke]);

  // ── Attach events once per canvas mount ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("mousedown",  handleMouseDown);
    canvas.addEventListener("mousemove",  handleMouseMove);
    canvas.addEventListener("mouseup",    handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  handleTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   handleTouchEnd,   { passive: false });

    return () => {
      canvas.removeEventListener("mousedown",  handleMouseDown);
      canvas.removeEventListener("mousemove",  handleMouseMove);
      canvas.removeEventListener("mouseup",    handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove",  handleTouchMove);
      canvas.removeEventListener("touchend",   handleTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // ── Clear — save/restore approach preserves dimensions ────────────────────
  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Save full transform, clear, restore — never touches width/height/scale
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Reset stroke properties (they may have changed via pressure simulation)
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth   = 2.2;

    // Reset state
    isDrawingRef.current  = false;
    pointsRef.current     = [];
    hasContentRef.current = false;
    setHasContent(false);
  }, []);

  // ── Export — trim whitespace ───────────────────────────────────────────────
  const toDataURL = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContentRef.current) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

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

    const pad = 12;
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
    const outCtx = out.getContext("2d");
    if (!outCtx) return null;
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
