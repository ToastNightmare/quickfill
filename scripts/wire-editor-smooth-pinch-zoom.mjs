import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (replacement && text.includes(replacement.trim())) return text;
  if (!text.includes(search)) {
    throw new Error(`Missing stable pinch zoom anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function replaceFirstExisting(text, candidates, label) {
  for (const [, replacement] of candidates) {
    if (replacement && text.includes(replacement.trim())) return text;
  }

  for (const [search, replacement] of candidates) {
    if (text.includes(search)) return text.replace(search, replacement);
  }

  throw new Error(`Missing stable pinch zoom anchor (${label})`);
}

function replaceBetween(text, start, end, replacement, label) {
  if (text.includes(replacement.trim())) return text;
  const startIndex = text.indexOf(start);
  if (startIndex === -1) throw new Error(`Missing stable pinch zoom anchor (${label}: start)`);
  const endIndex = text.indexOf(end, startIndex);
  if (endIndex === -1) throw new Error(`Missing stable pinch zoom anchor (${label}: end)`);
  return text.slice(0, startIndex) + replacement + text.slice(endIndex);
}

function insertAfter(text, anchor, insertion, label) {
  if (text.includes(insertion.trim())) return text;
  const index = text.indexOf(anchor);
  if (index === -1) throw new Error(`Missing stable pinch zoom anchor (${label})`);
  return text.slice(0, index + anchor.length) + insertion + text.slice(index + anchor.length);
}

const path = "src/components/PdfViewer.tsx";
let text = normalize(readFileSync(path, "utf8"));

text = replaceFirstExisting(
  text,
  [
    [
      `type PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n};`,
      `type PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  targetZoom: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n  originX: number;\n  originY: number;\n  rafId?: number;\n};`,
    ],
    [
      `type PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  targetZoom: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n};`,
      `type PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  targetZoom: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n  originX: number;\n  originY: number;\n  rafId?: number;\n};`,
    ],
  ],
  "pinch state live preview fields",
);

text = replaceOnce(
  text,
  `  const pinchZoomRef = useRef<PinchZoomState | null>(null);\n  const lastPinchZoomAtRef = useRef(0);\n  const mouseDownPos = useRef<{x: number, y: number} | null>(null);`,
  `  const pinchZoomRef = useRef<PinchZoomState | null>(null);\n  const lastPinchZoomAtRef = useRef(0);\n  const pageShellRef = useRef<HTMLDivElement>(null);\n  const pendingPinchPreviewClearRef = useRef(false);\n  const mouseDownPos = useRef<{x: number, y: number} | null>(null);`,
  "pinch preview refs",
);

text = insertAfter(
  text,
  `  const zoomFactor = zoom / 100;\n`,
  `\n  const clearPinchPreview = useCallback(() => {\n    const shell = pageShellRef.current;\n    if (!shell) return;\n    shell.style.transform = \"\";\n    shell.style.transformOrigin = \"\";\n    shell.style.willChange = \"\";\n    shell.style.touchAction = \"\";\n  }, []);\n\n  const applyPinchPreview = useCallback((scale: number, originX: number, originY: number) => {\n    const shell = pageShellRef.current;\n    if (!shell) return;\n    shell.style.transformOrigin = originX + \"px \" + originY + \"px\";\n    shell.style.transform = \"scale(\" + scale + \")\";\n    shell.style.willChange = \"transform\";\n    shell.style.touchAction = \"none\";\n  }, []);\n`,
  "pinch preview helpers",
);

text = replaceOnce(
  text,
  `      setLoading(true);\n      setError(null);`,
  `      const keepPreviousRenderVisible = pendingPinchPreviewClearRef.current;\n      setLoading(!keepPreviousRenderVisible);\n      setError(null);`,
  "hide loading overlay during pinch commit",
);

text = replaceOnce(
  text,
  `        setLoading(false);\n      } catch (err) {`,
  `        setLoading(false);\n        if (pendingPinchPreviewClearRef.current) {\n          pendingPinchPreviewClearRef.current = false;\n          requestAnimationFrame(() => clearPinchPreview());\n        }\n      } catch (err) {`,
  "clear preview after rendered zoom",
);

const touchBlock = `  const handleTouchStart = useCallback(\n    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (!onZoomChange || e.touches.length !== 2) return;\n      const scroller = containerRef.current?.parentElement;\n      const shell = pageShellRef.current;\n      if (!scroller || !shell) return;\n\n      const distance = distanceBetweenTouches(e.touches);\n      if (distance <= 0) return;\n\n      const center = centerBetweenTouches(e.touches);\n      const scrollerRect = scroller.getBoundingClientRect();\n      const shellRect = shell.getBoundingClientRect();\n      const centerX = center.x - scrollerRect.left;\n      const centerY = center.y - scrollerRect.top;\n      const originX = center.x - shellRect.left;\n      const originY = center.y - shellRect.top;\n\n      pendingPinchPreviewClearRef.current = false;\n      pinchZoomRef.current = {\n        startDistance: distance,\n        startZoom: zoom,\n        targetZoom: zoom,\n        centerX,\n        centerY,\n        contentX: scroller.scrollLeft + centerX,\n        contentY: scroller.scrollTop + centerY,\n        originX,\n        originY,\n      };\n      applyPinchPreview(1, originX, originY);\n      e.preventDefault();\n    },\n    [applyPinchPreview, onZoomChange, zoom],\n  );\n\n  const handleTouchMove = useCallback(\n    (e: React.TouchEvent<HTMLDivElement>) => {\n      const pinch = pinchZoomRef.current;\n      if (!pinch || !onZoomChange || e.touches.length !== 2) return;\n\n      const distance = distanceBetweenTouches(e.touches);\n      if (distance <= 0) return;\n\n      const nextZoom = clampPinchZoom(pinch.startZoom * (distance / pinch.startDistance));\n      pinch.targetZoom = nextZoom;\n      const previewScale = nextZoom / pinch.startZoom;\n\n      if (pinch.rafId) cancelAnimationFrame(pinch.rafId);\n      pinch.rafId = requestAnimationFrame(() => {\n        applyPinchPreview(previewScale, pinch.originX, pinch.originY);\n      });\n      e.preventDefault();\n    },\n    [applyPinchPreview, onZoomChange],\n  );\n\n  const handleTouchCancel = useCallback(() => {\n    const pinch = pinchZoomRef.current;\n    if (pinch?.rafId) cancelAnimationFrame(pinch.rafId);\n    if (pinch) lastPinchZoomAtRef.current = Date.now();\n    pinchZoomRef.current = null;\n    pendingPinchPreviewClearRef.current = false;\n    clearPinchPreview();\n  }, [clearPinchPreview]);\n\n`;

text = replaceBetween(
  text,
  `  const handleTouchStart = useCallback(\n`,
  `  const handleTouchEnd = useCallback(\n`,
  touchBlock,
  "live preview pinch handlers",
);

const touchEndReplacement = `    (e: React.TouchEvent<HTMLDivElement>) => {\n      const pinch = pinchZoomRef.current;\n      if (pinch) {\n        if (e.touches.length < 2) {\n          const scroller = containerRef.current?.parentElement;\n          const nextZoom = pinch.targetZoom;\n          const zoomRatio = nextZoom / pinch.startZoom;\n          if (pinch.rafId) cancelAnimationFrame(pinch.rafId);\n          lastPinchZoomAtRef.current = Date.now();\n          pinchZoomRef.current = null;\n          pendingPinchPreviewClearRef.current = true;\n          onZoomChange?.(nextZoom);\n\n          requestAnimationFrame(() => {\n            if (!scroller) return;\n            scroller.scrollLeft = pinch.contentX * zoomRatio - pinch.centerX;\n            scroller.scrollTop = pinch.contentY * zoomRatio - pinch.centerY;\n          });\n\n          window.setTimeout(() => {\n            if (!pendingPinchPreviewClearRef.current) return;\n            pendingPinchPreviewClearRef.current = false;\n            clearPinchPreview();\n          }, 900);\n        }\n        return;\n      }\n\n      if (Date.now() - lastPinchZoomAtRef.current < 250) return;\n      if (!activeTool || !canvasRef.current) return;`;

text = replaceFirstExisting(
  text,
  [
    [
      `    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (pinchZoomRef.current) {\n        if (e.touches.length < 2) {\n          lastPinchZoomAtRef.current = Date.now();\n          pinchZoomRef.current = null;\n        }\n        return;\n      }\n\n      if (Date.now() - lastPinchZoomAtRef.current < 250) return;\n      if (!activeTool || !canvasRef.current) return;`,
      touchEndReplacement,
    ],
    [
      `    (e: React.TouchEvent<HTMLDivElement>) => {\n      const pinch = pinchZoomRef.current;\n      if (pinch) {\n        if (e.touches.length < 2) {\n          const scroller = containerRef.current?.parentElement;\n          const nextZoom = pinch.targetZoom;\n          const zoomRatio = nextZoom / pinch.startZoom;\n          lastPinchZoomAtRef.current = Date.now();\n          pinchZoomRef.current = null;\n          onZoomChange?.(nextZoom);\n\n          requestAnimationFrame(() => {\n            if (!scroller) return;\n            scroller.scrollLeft = pinch.contentX * zoomRatio - pinch.centerX;\n            scroller.scrollTop = pinch.contentY * zoomRatio - pinch.centerY;\n          });\n        }\n        return;\n      }\n\n      if (Date.now() - lastPinchZoomAtRef.current < 250) return;\n      if (!activeTool || !canvasRef.current) return;`,
      touchEndReplacement,
    ],
  ],
  "pinch commit on touch end",
);

text = replaceFirstExisting(
  text,
  [
    [
      `    [activeTool, createFieldAtPoint]\n  );`,
      `    [activeTool, clearPinchPreview, createFieldAtPoint, onZoomChange]\n  );`,
    ],
    [
      `    [activeTool, createFieldAtPoint, onZoomChange]\n  );`,
      `    [activeTool, clearPinchPreview, createFieldAtPoint, onZoomChange]\n  );`,
    ],
  ],
  "pinch touch end dependencies",
);

text = replaceOnce(
  text,
  `      <div\n        className=\"relative mx-auto bg-white shadow-xl rounded-sm\"`,
  `      <div\n        ref={pageShellRef}\n        className=\"relative mx-auto bg-white shadow-xl rounded-sm\"`,
  "page shell ref",
);

writeIfChanged(path, text);
