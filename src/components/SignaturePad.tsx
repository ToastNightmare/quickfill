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
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasContent, setHasContent] = useState(false);

  // Set up canvas resolution for sharp rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
  }, [width, height]);

  const getPoint = useCallback(
    (e: MouseEvent | Touch): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const startStroke = useCallback((point: { x: number; y: number }) => {
    isDrawingRef.current = true;
    lastPointRef.current = point;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const continueStroke = useCallback(
    (point: { x: number; y: number }) => {
      if (!isDrawingRef.current || !lastPointRef.current) return;

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;

      if (!hasContent) {
        setHasContent(true);
      }
    },
    [hasContent]
  );

  const endStroke = useCallback(() => {
    if (isDrawingRef.current && lastPointRef.current) {
      if (!hasContent) {
        setHasContent(true);
      }
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, [hasContent]);

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      startStroke(getPoint(e));
    };
    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      continueStroke(getPoint(e));
    };
    const onMouseUp = () => endStroke();
    const onMouseLeave = () => endStroke();

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [getPoint, startStroke, continueStroke, endStroke]);

  // Touch events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        startStroke(getPoint(e.touches[0]));
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        continueStroke(getPoint(e.touches[0]));
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      endStroke();
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [getPoint, startStroke, continueStroke, endStroke]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasContent(false);
  }, []);

  const toDataURL = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width: iw, height: ih } = imageData;

    // Find bounding box of drawn content
    let minX = iw,
      minY = ih,
      maxX = 0,
      maxY = 0;
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const alpha = data[(y * iw + x) * 4 + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) return null;

    // Pad and trim
    const pad = 10;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(iw - 1, maxX + pad);
    maxY = Math.min(ih - 1, maxY + pad);

    const trimW = maxX - minX + 1;
    const trimH = maxY - minY + 1;
    const trimmed = ctx.getImageData(minX, minY, trimW, trimH);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = trimW;
    outCanvas.height = trimH;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return null;
    outCtx.putImageData(trimmed, 0, 0);

    return outCanvas.toDataURL("image/png");
  }, [hasContent]);

  const canvasElement = (
    <canvas
      ref={canvasRef}
      className="touch-none"
      style={{
        width,
        height,
        cursor: "crosshair",
      }}
    />
  );

  return { canvasElement, clear, toDataURL, hasContent };
}
