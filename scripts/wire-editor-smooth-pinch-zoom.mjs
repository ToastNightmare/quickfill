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
    throw new Error(`Missing smooth pinch zoom anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function replaceBetween(text, start, end, replacement, label) {
  if (text.includes(replacement.trim())) return text;
  const startIndex = text.indexOf(start);
  if (startIndex === -1) throw new Error(`Missing smooth pinch zoom anchor (${label}: start)`);
  const endIndex = text.indexOf(end, startIndex);
  if (endIndex === -1) throw new Error(`Missing smooth pinch zoom anchor (${label}: end)`);
  return text.slice(0, startIndex) + replacement + text.slice(endIndex);
}

const path = "src/components/PdfViewer.tsx";
let text = normalize(readFileSync(path, "utf8"));

text = replaceOnce(
  text,
  `  const containerRef = useRef<HTMLDivElement>(null);\n  const canvasRef = useRef<HTMLCanvasElement>(null);`,
  `  const containerRef = useRef<HTMLDivElement>(null);\n  const canvasRef = useRef<HTMLCanvasElement>(null);\n  const pageShellRef = useRef<HTMLDivElement>(null);`,
  "page shell ref",
);

text = replaceOnce(
  text,
  `type PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n};`,
  `type PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  targetZoom: number;\n  previewScale: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n};`,
  "pinch state target zoom",
);

text = replaceOnce(
  text,
  `  const dragStartedRef = useRef(false);\n  const pinchZoomRef = useRef<PinchZoomState | null>(null);\n  const lastPinchZoomAtRef = useRef(0);\n  const mouseDownPos = useRef<{x: number, y: number} | null>(null);`,
  `  const dragStartedRef = useRef(false);\n  const pinchZoomRef = useRef<PinchZoomState | null>(null);\n  const pinchFrameRef = useRef<number | null>(null);\n  const lastPinchZoomAtRef = useRef(0);\n  const mouseDownPos = useRef<{x: number, y: number} | null>(null);`,
  "pinch animation frame ref",
);

const touchBlock = `  const clearPinchPreview = useCallback(() => {\n    if (pinchFrameRef.current !== null) {\n      cancelAnimationFrame(pinchFrameRef.current);\n      pinchFrameRef.current = null;\n    }\n\n    const pageShell = pageShellRef.current;\n    if (pageShell) {\n      pageShell.style.transform = \"\";\n      pageShell.style.transformOrigin = \"\";\n      pageShell.style.willChange = \"\";\n    }\n  }, []);\n\n  const handleTouchStart = useCallback(\n    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (!onZoomChange || e.touches.length !== 2) return;\n      const scroller = containerRef.current?.parentElement;\n      const pageShell = pageShellRef.current;\n      if (!scroller || !pageShell) return;\n\n      const distance = distanceBetweenTouches(e.touches);\n      if (distance <= 0) return;\n\n      const center = centerBetweenTouches(e.touches);\n      const scrollerRect = scroller.getBoundingClientRect();\n      const pageRect = pageShell.getBoundingClientRect();\n      const centerX = center.x - scrollerRect.left;\n      const centerY = center.y - scrollerRect.top;\n\n      pinchZoomRef.current = {\n        startDistance: distance,\n        startZoom: zoom,\n        targetZoom: zoom,\n        previewScale: 1,\n        centerX,\n        centerY,\n        contentX: scroller.scrollLeft + centerX,\n        contentY: scroller.scrollTop + centerY,\n      };\n\n      pageShell.style.transformOrigin = \`${center.x - pageRect.left}px ${center.y - pageRect.top}px\`;\n      pageShell.style.willChange = \"transform\";\n      e.preventDefault();\n    },\n    [onZoomChange, zoom],\n  );\n\n  const handleTouchMove = useCallback(\n    (e: React.TouchEvent<HTMLDivElement>) => {\n      const pinch = pinchZoomRef.current;\n      if (!pinch || !onZoomChange || e.touches.length !== 2) return;\n\n      const distance = distanceBetweenTouches(e.touches);\n      if (distance <= 0) return;\n\n      const nextZoom = clampPinchZoom(pinch.startZoom * (distance / pinch.startDistance));\n      pinch.targetZoom = nextZoom;\n      pinch.previewScale = nextZoom / pinch.startZoom;\n\n      if (pinchFrameRef.current === null) {\n        pinchFrameRef.current = requestAnimationFrame(() => {\n          pinchFrameRef.current = null;\n          const activePinch = pinchZoomRef.current;\n          const pageShell = pageShellRef.current;\n          if (!activePinch || !pageShell) return;\n          pageShell.style.transform = \`scale(${activePinch.previewScale})\`;\n        });\n      }\n\n      e.preventDefault();\n    },\n    [onZoomChange],\n  );\n\n  const handleTouchCancel = useCallback(() => {\n    if (pinchZoomRef.current) lastPinchZoomAtRef.current = Date.now();\n    pinchZoomRef.current = null;\n    clearPinchPreview();\n  }, [clearPinchPreview]);\n\n`;

text = replaceBetween(
  text,
  `  const handleTouchStart = useCallback(\n`,
  `  const handleTouchEnd = useCallback(\n`,
  touchBlock,
  "smooth pinch handlers",
);

text = replaceOnce(
  text,
  `    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (pinchZoomRef.current) {\n        if (e.touches.length < 2) {\n          lastPinchZoomAtRef.current = Date.now();\n          pinchZoomRef.current = null;\n        }\n        return;\n      }\n\n      if (Date.now() - lastPinchZoomAtRef.current < 250) return;\n      if (!activeTool || !canvasRef.current) return;`,
  `    (e: React.TouchEvent<HTMLDivElement>) => {\n      const pinch = pinchZoomRef.current;\n      if (pinch) {\n        if (e.touches.length < 2) {\n          const scroller = containerRef.current?.parentElement;\n          const nextZoom = pinch.targetZoom;\n          const zoomRatio = nextZoom / pinch.startZoom;\n          lastPinchZoomAtRef.current = Date.now();\n          pinchZoomRef.current = null;\n          clearPinchPreview();\n          onZoomChange?.(nextZoom);\n\n          requestAnimationFrame(() => {\n            if (!scroller) return;\n            scroller.scrollLeft = pinch.contentX * zoomRatio - pinch.centerX;\n            scroller.scrollTop = pinch.contentY * zoomRatio - pinch.centerY;\n          });\n        }\n        return;\n      }\n\n      if (Date.now() - lastPinchZoomAtRef.current < 250) return;\n      if (!activeTool || !canvasRef.current) return;`,
  "pinch commit on touch end",
);

text = replaceOnce(
  text,
  `    [activeTool, createFieldAtPoint]\n  );`,
  `    [activeTool, clearPinchPreview, createFieldAtPoint, onZoomChange]\n  );`,
  "pinch touch end dependencies",
);

text = replaceOnce(
  text,
  `      <div\n        className=\"relative mx-auto bg-white shadow-xl rounded-sm\"`,
  `      <div\n        ref={pageShellRef}\n        className=\"relative mx-auto bg-white shadow-xl rounded-sm\"`,
  "page shell element ref",
);

writeIfChanged(path, text);
