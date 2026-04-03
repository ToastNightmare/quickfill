"use client";

import { useEffect, useRef, useState } from "react";

interface MinimapProps {
  sourceCanvas: HTMLCanvasElement | null;
  viewerRef: React.RefObject<HTMLDivElement | null>;
  pageWidth: number;
  pageHeight: number;
  zoom: number;
}

export function Minimap({ sourceCanvas, viewerRef, pageWidth, pageHeight, zoom }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [visible, setVisible] = useState(true);

  const MINIMAP_W = 160;
  const aspect = pageHeight / Math.max(pageWidth, 1);
  const MINIMAP_H = Math.min(Math.round(MINIMAP_W * aspect), 220);

  // Draw PDF thumbnail onto minimap canvas
  useEffect(() => {
    if (!sourceCanvas || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    canvasRef.current.width = MINIMAP_W;
    canvasRef.current.height = MINIMAP_H;
    ctx.drawImage(sourceCanvas, 0, 0, MINIMAP_W, MINIMAP_H);
  }, [sourceCanvas, MINIMAP_W, MINIMAP_H]);

  // Track scroll position to show viewport indicator
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const update = () => {
      const scaledW = pageWidth * zoom / 100;
      const scaledH = pageHeight * zoom / 100;
      const scaleX = MINIMAP_W / Math.max(scaledW, 1);
      const scaleY = MINIMAP_H / Math.max(scaledH, 1);
      setViewport({
        x: Math.round(el.scrollLeft * scaleX),
        y: Math.round(el.scrollTop * scaleY),
        w: Math.min(Math.round(el.clientWidth * scaleX), MINIMAP_W),
        h: Math.min(Math.round(el.clientHeight * scaleY), MINIMAP_H),
      });
    };
    update();
    el.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [viewerRef, pageWidth, pageHeight, zoom, MINIMAP_W, MINIMAP_H]);

  if (!visible) return (
    <button
      onClick={() => setVisible(true)}
      className="absolute bottom-20 right-3 z-40 rounded-lg bg-surface/90 border border-border px-2 py-1 text-xs text-text-muted hover:text-text shadow-md"
      title="Show minimap"
    >
      Map
    </button>
  );

  return (
    <div
      className="absolute bottom-20 right-3 z-40 rounded-xl border border-border bg-surface/95 shadow-xl overflow-hidden"
      style={{ width: MINIMAP_W }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border">
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Overview</span>
        <button
          onClick={() => setVisible(false)}
          className="text-text-muted hover:text-text text-xs leading-none px-1"
        >
          ✕
        </button>
      </div>
      {/* Thumbnail */}
      <div className="relative" style={{ height: MINIMAP_H }}>
        <canvas
          ref={canvasRef}
          style={{ width: MINIMAP_W, height: MINIMAP_H, display: "block" }}
        />
        {/* Viewport indicator */}
        <div
          className="absolute border-2 border-accent/80 bg-accent/10 pointer-events-none rounded-sm"
          style={{
            left: viewport.x,
            top: viewport.y,
            width: Math.max(viewport.w, 8),
            height: Math.max(viewport.h, 8),
          }}
        />
      </div>
    </div>
  );
}
