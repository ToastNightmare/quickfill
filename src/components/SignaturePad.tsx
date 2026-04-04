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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Use refs for drawing state so event handlers never need re-registration
  const isDrawingRef   = useRef(false);
  const lastPointRef   = useRef<{ x: number; y: number } | null>(null);
  const hasContentRef  = useRef(false);

  // UI state — only used to enable/disable the Save button
  const [hasContent, setHasContent] = useState(false);

  // ── Canvas setup — retina scaling ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(width  * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.lineCap    = "round";
    ctx.lineJoin   = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth  = 2.5;

    // Reset drawing state when dimensions change
    isDrawingRef.current  = false;
    lastPointRef.current  = null;
    hasContentRef.current = false;
    setHasContent(false);
  }, [width, height]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getPoint = useCallback((e: MouseEvent | Touch): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // ── Event handlers — stable refs, never re-registered ─────────────────────
  const handleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pt = getPoint(e);
    isDrawingRef.current  = true;
    lastPointRef.current  = pt;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }, [getPoint]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current || !lastPointRef.current) return;
    const pt = getPoint(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;

    if (!hasContentRef.current) {
      hasContentRef.current = true;
      setHasContent(true);
    }
  }, [getPoint]);

  const handleMouseUp = useCallback(() => {
    if (isDrawingRef.current && !hasContentRef.current) {
      hasContentRef.current = true;
      setHasContent(true);
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    const pt = getPoint(e.touches[0]);
    isDrawingRef.current = true;
    lastPointRef.current = pt;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }, [getPoint]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current || !lastPointRef.current || e.touches.length !== 1) return;
    const pt = getPoint(e.touches[0]);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;

    if (!hasContentRef.current) {
      hasContentRef.current = true;
      setHasContent(true);
    }
  }, [getPoint]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (isDrawingRef.current && !hasContentRef.current) {
      hasContentRef.current = true;
      setHasContent(true);
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  // ── Attach events once — stable callbacks mean no teardown needed ──────────
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
  // Only re-attach if the canvas remounts (width/height change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // ── Clear ──────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    hasContentRef.current = false;
    setHasContent(false);
  }, []);

  // ── Export ─────────────────────────────────────────────────────────────────
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

    const pad = 10;
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
