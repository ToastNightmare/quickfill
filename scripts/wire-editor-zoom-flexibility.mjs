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
    throw new Error(`Missing zoom flexibility anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function insertAfter(text, anchor, insertion, label) {
  if (text.includes(insertion.trim())) return text;
  const index = text.indexOf(anchor);
  if (index === -1) {
    throw new Error(`Missing zoom flexibility anchor (${label}): ${anchor.slice(0, 160)}`);
  }
  return text.slice(0, index + anchor.length) + insertion + text.slice(index + anchor.length);
}

function patchEditorPage() {
  const path = "src/app/editor/page.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];\nconst SNAP_MIN = 125;\nconst SNAP_MAX = 175;\n// On mobile we allow zooming below SNAP_MIN so the full page fits the screen\nconst isMobileDevice = () => typeof window !== "undefined" && window.innerWidth < 640;`,
    `const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400];\nconst MIN_ZOOM = 50;\nconst MAX_ZOOM = 400;\nconst SNAP_MIN = 125;\nconst SNAP_MAX = 175;`,
    "editor zoom constants",
  );

  text = replaceOnce(
    text,
    `  const handleZoomIn = useCallback(() => {\n    setZoom((prev) => ZOOM_LEVELS.find((z) => z > prev && z <= SNAP_MAX) ?? prev);\n  }, []);\n\n  const handleZoomOut = useCallback(() => {\n    const mobile = isMobileDevice();\n    setZoom((prev) => [...ZOOM_LEVELS].reverse().find((z) => z < prev && (mobile || z >= SNAP_MIN)) ?? prev);\n  }, []);`,
    `  const clampEditorZoom = useCallback((nextZoom: number) => {\n    const rounded = Math.round(nextZoom / 5) * 5;\n    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rounded));\n  }, []);\n\n  const handleZoomChange = useCallback((nextZoom: number) => {\n    setZoom(clampEditorZoom(nextZoom));\n  }, [clampEditorZoom]);\n\n  const handleZoomIn = useCallback(() => {\n    setZoom((prev) => ZOOM_LEVELS.find((z) => z > prev && z <= MAX_ZOOM) ?? MAX_ZOOM);\n  }, []);\n\n  const handleZoomOut = useCallback(() => {\n    setZoom((prev) => [...ZOOM_LEVELS].reverse().find((z) => z < prev && z >= MIN_ZOOM) ?? MIN_ZOOM);\n  }, []);`,
    "editor zoom handlers",
  );

  text = replaceOnce(
    text,
    `              disabled={zoom <= 50}`,
    `              disabled={zoom <= MIN_ZOOM}`,
    "zoom out disabled state",
  );

  text = replaceOnce(
    text,
    `            {zoom < 125 && (\n              <span className="hidden sm:inline text-[10px] text-amber-500 font-medium">too small</span>\n            )}\n            {zoom >= 125 && zoom <= 175 && (\n              <span className="hidden sm:inline text-[10px] text-green-500 font-medium">snap ready</span>\n            )}\n            {zoom > 175 && (\n              <span className="hidden sm:inline text-[10px] text-amber-500 font-medium">too large</span>\n            )}\n`,
    ``,
    "remove snap zoom warnings",
  );

  text = replaceOnce(
    text,
    `              disabled={zoom >= SNAP_MAX}`,
    `              disabled={zoom >= MAX_ZOOM}`,
    "zoom in disabled state",
  );

  text = replaceOnce(
    text,
    `              title="Best zoom for snap detection (150%)"`,
    `              title="Set zoom to 150% for Snap"`,
    "snap button title",
  );

  text = replaceOnce(
    text,
    `            zoom={zoom}\n            highlightFieldIds={highlightFieldIds}`,
    `            zoom={zoom}\n            onZoomChange={handleZoomChange}\n            highlightFieldIds={highlightFieldIds}`,
    "pass pinch zoom handler",
  );

  writeIfChanged(path, text);
}

function patchPdfViewer() {
  const path = "src/components/PdfViewer.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `  zoom: number;\n  highlightFieldIds?: Set<string>;`,
    `  zoom: number;\n  onZoomChange?: (zoom: number) => void;\n  highlightFieldIds?: Set<string>;`,
    "viewer prop type",
  );

  text = replaceOnce(
    text,
    `  zoom,\n  highlightFieldIds,`,
    `  zoom,\n  onZoomChange,\n  highlightFieldIds,`,
    "viewer prop destructuring",
  );

  text = insertAfter(
    text,
    `const MOBILE_DELETE_ZONE_HEIGHT = 112;\n`,
    `\nconst MIN_PINCH_ZOOM = 50;\nconst MAX_PINCH_ZOOM = 400;\n\ntype PinchZoomState = {\n  startDistance: number;\n  startZoom: number;\n  centerX: number;\n  centerY: number;\n  contentX: number;\n  contentY: number;\n};\n\nfunction distanceBetweenTouches(touches: TouchList) {\n  if (touches.length < 2) return 0;\n  const first = touches[0];\n  const second = touches[1];\n  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);\n}\n\nfunction centerBetweenTouches(touches: TouchList) {\n  const first = touches[0];\n  const second = touches[1];\n  return {\n    x: (first.clientX + second.clientX) / 2,\n    y: (first.clientY + second.clientY) / 2,\n  };\n}\n\nfunction clampPinchZoom(nextZoom: number) {\n  const rounded = Math.round(nextZoom / 5) * 5;\n  return Math.max(MIN_PINCH_ZOOM, Math.min(MAX_PINCH_ZOOM, rounded));\n}\n`,
    "pinch helpers",
  );

  text = replaceOnce(
    text,
    `  const dragStartedRef = useRef(false);\n  const mouseDownPos = useRef<{x: number, y: number} | null>(null);`,
    `  const dragStartedRef = useRef(false);\n  const pinchZoomRef = useRef<PinchZoomState | null>(null);\n  const lastPinchZoomAtRef = useRef(0);\n  const mouseDownPos = useRef<{x: number, y: number} | null>(null);`,
    "pinch refs",
  );

  const touchHandlers = `\n  const handleTouchStart = useCallback(\n    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (!onZoomChange || e.touches.length !== 2) return;\n      const scroller = containerRef.current?.parentElement;\n      if (!scroller) return;\n\n      const distance = distanceBetweenTouches(e.touches);\n      if (distance <= 0) return;\n\n      const center = centerBetweenTouches(e.touches);\n      const scrollerRect = scroller.getBoundingClientRect();\n      const centerX = center.x - scrollerRect.left;\n      const centerY = center.y - scrollerRect.top;\n\n      pinchZoomRef.current = {\n        startDistance: distance,\n        startZoom: zoom,\n        centerX,\n        centerY,\n        contentX: scroller.scrollLeft + centerX,\n        contentY: scroller.scrollTop + centerY,\n      };\n      e.preventDefault();\n    },\n    [onZoomChange, zoom],\n  );\n\n  const handleTouchMove = useCallback(\n    (e: React.TouchEvent<HTMLDivElement>) => {\n      const pinch = pinchZoomRef.current;\n      if (!pinch || !onZoomChange || e.touches.length !== 2) return;\n\n      const scroller = containerRef.current?.parentElement;\n      if (!scroller) return;\n\n      const distance = distanceBetweenTouches(e.touches);\n      if (distance <= 0) return;\n\n      const nextZoom = clampPinchZoom(pinch.startZoom * (distance / pinch.startDistance));\n      onZoomChange(nextZoom);\n\n      const zoomRatio = nextZoom / pinch.startZoom;\n      requestAnimationFrame(() => {\n        scroller.scrollLeft = pinch.contentX * zoomRatio - pinch.centerX;\n        scroller.scrollTop = pinch.contentY * zoomRatio - pinch.centerY;\n      });\n      e.preventDefault();\n    },\n    [onZoomChange],\n  );\n\n  const handleTouchCancel = useCallback(() => {\n    if (pinchZoomRef.current) lastPinchZoomAtRef.current = Date.now();\n    pinchZoomRef.current = null;\n  }, []);\n`;

  text = insertAfter(
    text,
    `  );\n\n  const handleTouchEnd = useCallback(\n`,
    touchHandlers,
    "pinch touch handlers",
  );

  text = replaceOnce(
    text,
    `    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (!activeTool || !canvasRef.current) return;`,
    `    (e: React.TouchEvent<HTMLDivElement>) => {\n      if (pinchZoomRef.current) {\n        if (e.touches.length < 2) {\n          lastPinchZoomAtRef.current = Date.now();\n          pinchZoomRef.current = null;\n        }\n        return;\n      }\n\n      if (Date.now() - lastPinchZoomAtRef.current < 250) return;\n      if (!activeTool || !canvasRef.current) return;`,
    "pinch end guard",
  );

  text = replaceOnce(
    text,
    `      onTouchEnd={handleTouchEnd}\n      style={{ touchAction: activeTool || isDragging || (isMobileEditor && selectedFieldId) ? "none" : "pan-x pan-y" }}`,
    `      onTouchStart={handleTouchStart}\n      onTouchMove={handleTouchMove}\n      onTouchEnd={handleTouchEnd}\n      onTouchCancel={handleTouchCancel}\n      style={{ touchAction: activeTool || isDragging || (isMobileEditor && selectedFieldId) ? "none" : "pan-x pan-y" }}`,
    "wire pinch touch events",
  );

  writeIfChanged(path, text);
}

patchEditorPage();
patchPdfViewer();
