import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) {
    throw new Error(`Missing stable pinch zoom anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function replaceBetween(text, start, end, replacement, label) {
  if (text.includes(replacement.trim())) return text;
  const startIndex = text.indexOf(start);
  if (startIndex === -1) throw new Error(`Missing stable pinch zoom anchor (${label}: start)`);
  const endIndex = text.indexOf(end, startIndex);
  if (endIndex === -1) throw new Error(`Missing stable pinch zoom anchor (${label}: end)`);
  return text.slice(0, startIndex) + replacement + text.slice(endIndex);
}

const path = "src/components/PdfViewer.tsx";
let text = normalize(readFileSync(path, "utf8"));

text = replaceOnce(
  text,
  `type PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n};`,
  `type PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  targetZoom: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n};`,
  "pinch state target zoom",
);

const touchBlock = `  const handleTouchStart = useCallback(\n    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (!onZoomChange || e.touches.length !== 2) return;\n      const scroller = containerRef.current?.parentElement;\n      if (!scroller) return;\n\n      const distance = distanceBetweenTouches(e.touches);\n      if (distance <= 0) return;\n\n      const center = centerBetweenTouches(e.touches);\n      const scrollerRect = scroller.getBoundingClientRect();\n      const centerX = center.x - scrollerRect.left;\n      const centerY = center.y - scrollerRect.top;\n\n      pinchZoomRef.current = {\n        startDistance: distance,\n        startZoom: zoom,\n        targetZoom: zoom,\n        centerX,\n        centerY,\n        contentX: scroller.scrollLeft + centerX,\n        contentY: scroller.scrollTop + centerY,\n      };\n      e.preventDefault();\n    },\n    [onZoomChange, zoom],\n  );\n\n  const handleTouchMove = useCallback(\n    (e: React.TouchEvent<HTMLDivElement>) => {\n      const pinch = pinchZoomRef.current;\n      if (!pinch || !onZoomChange || e.touches.length !== 2) return;\n\n      const distance = distanceBetweenTouches(e.touches);\n      if (distance <= 0) return;\n\n      pinch.targetZoom = clampPinchZoom(pinch.startZoom * (distance / pinch.startDistance));\n      e.preventDefault();\n    },\n    [onZoomChange],\n  );\n\n  const handleTouchCancel = useCallback(() => {\n    if (pinchZoomRef.current) lastPinchZoomAtRef.current = Date.now();\n    pinchZoomRef.current = null;\n  }, []);\n\n`;

text = replaceBetween(
  text,
  `  const handleTouchStart = useCallback(\n`,
  `  const handleTouchEnd = useCallback(\n`,
  touchBlock,
  "stable pinch handlers",
);

text = replaceOnce(
  text,
  `    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (pinchZoomRef.current) {\n        if (e.touches.length < 2) {\n          lastPinchZoomAtRef.current = Date.now();\n          pinchZoomRef.current = null;\n        }\n        return;\n      }\n\n      if (Date.now() - lastPinchZoomAtRef.current < 250) return;\n      if (!activeTool || !canvasRef.current) return;`,
  `    (e: React.TouchEvent<HTMLDivElement>) => {\n      const pinch = pinchZoomRef.current;\n      if (pinch) {\n        if (e.touches.length < 2) {\n          const scroller = containerRef.current?.parentElement;\n          const nextZoom = pinch.targetZoom;\n          const zoomRatio = nextZoom / pinch.startZoom;\n          lastPinchZoomAtRef.current = Date.now();\n          pinchZoomRef.current = null;\n          onZoomChange?.(nextZoom);\n\n          requestAnimationFrame(() => {\n            if (!scroller) return;\n            scroller.scrollLeft = pinch.contentX * zoomRatio - pinch.centerX;\n            scroller.scrollTop = pinch.contentY * zoomRatio - pinch.centerY;\n          });\n        }\n        return;\n      }\n\n      if (Date.now() - lastPinchZoomAtRef.current < 250) return;\n      if (!activeTool || !canvasRef.current) return;`,
  "pinch commit on touch end",
);

text = replaceOnce(
  text,
  `    [activeTool, createFieldAtPoint]\n  );`,
  `    [activeTool, createFieldAtPoint, onZoomChange]\n  );`,
  "pinch touch end dependencies",
);

writeIfChanged(path, text);
