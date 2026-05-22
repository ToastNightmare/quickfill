import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement.trim())) return text;
  if (!text.includes(search)) {
    throw new Error(`Missing mobile editor polish anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function replacePattern(text, pattern, replacement, label) {
  if (text.includes(replacement.trim())) return text;
  const next = text.replace(pattern, replacement);
  if (next === text) {
    throw new Error(`Missing mobile editor polish anchor (${label})`);
  }
  return next;
}

function replaceNthOrLast(text, search, replacement, occurrence, label) {
  if (text.includes(replacement.trim())) return text;

  const indexes = [];
  let from = 0;
  while (true) {
    const index = text.indexOf(search, from);
    if (index === -1) break;
    indexes.push(index);
    from = index + search.length;
  }

  if (!indexes.length) {
    throw new Error(`Missing mobile editor polish anchor (${label})`);
  }

  const index = indexes[Math.min(occurrence - 1, indexes.length - 1)];
  return text.slice(0, index) + replacement + text.slice(index + search.length);
}

function patchContextPanel() {
  const path = "src/components/ContextPanel.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `  const [isExpanded, setIsExpanded] = useState(false);\n\n  useEffect(() => {\n    setIsExpanded(false);\n  }, [selectedField.id]);`,
    `  const [isExpanded, setIsExpanded] = useState(false);\n  const [isMovingField, setIsMovingField] = useState(false);\n\n  useEffect(() => {\n    setIsExpanded(false);\n    setIsMovingField(false);\n  }, [selectedField.id]);\n\n  useEffect(() => {\n    const handleFieldMoving = (event: Event) => {\n      const moving = Boolean((event as CustomEvent<{ moving?: boolean }>).detail?.moving);\n      setIsMovingField(moving);\n      if (moving) setIsExpanded(false);\n    };\n\n    window.addEventListener("quickfill:mobile-field-moving", handleFieldMoving as EventListener);\n    return () => window.removeEventListener("quickfill:mobile-field-moving", handleFieldMoving as EventListener);\n  }, []);`,
    "mobile moving state",
  );

  text = replaceOnce(
    text,
    `  if (!isExpanded) {\n    return (`,
    `  if (isMovingField) {\n    return (\n      <div className="pointer-events-none fixed bottom-[7.75rem] left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-surface/95 px-4 py-2 text-xs font-semibold text-text-muted shadow-lg backdrop-blur sm:hidden">\n        Release to place\n      </div>\n    );\n  }\n\n  if (!isExpanded) {\n    return (`,
    "hide sheet while moving",
  );

  text = replacePattern(
    text,
    /<div className="fixed bottom-\[[^\]]+\] left-3 right-3 z-30 rounded-2xl border border-border bg-surface shadow-xl sm:hidden">/,
    `<div className="fixed bottom-[7.5rem] left-3 right-3 z-30 rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur sm:hidden">`,
    "compact collapsed mobile sheet",
  );

  text = replacePattern(
    text,
    /<div className="fixed bottom-\[[^\]]+\] left-3 right-3 z-30 max-h-\[[^\]]+\] overflow-y-auto rounded-2xl border border-border bg-surface(?:\/95)? shadow-2xl(?: backdrop-blur)? sm:hidden">/,
    `<div className="fixed bottom-[7.5rem] left-3 right-3 z-30 max-h-[34svh] overflow-y-auto rounded-2xl border border-border bg-surface/95 shadow-2xl backdrop-blur sm:hidden">`,
    "shorter expanded mobile sheet",
  );

  const doneButton = `        <button\n          onClick={onFieldDeselect}\n          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-alt hover:text-text"\n        >\n          Done\n        </button>`;

  text = replaceNthOrLast(
    text,
    doneButton,
    `        <div className="flex shrink-0 items-center gap-2">\n          <button\n            onClick={() => setIsExpanded(false)}\n            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-alt hover:text-text"\n          >\n            Minimize\n          </button>\n          <button\n            onClick={onFieldDeselect}\n            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-alt hover:text-text"\n          >\n            Done\n          </button>\n        </div>`,
    2,
    "expanded mobile sheet minimize button",
  );

  writeIfChanged(path, text);
}

function patchPdfViewer() {
  const path = "src/components/PdfViewer.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  text = replaceOnce(
    text,
    `function isEventInMobileDeleteZone(evt?: Event | null) {\n  if (typeof window === "undefined") return false;\n  const y = clientYFromEvent(evt);\n  if (y === null) return false;\n  return y >= window.innerHeight - MOBILE_DELETE_ZONE_HEIGHT;\n}\n`,
    `function isEventInMobileDeleteZone(evt?: Event | null) {\n  if (typeof window === "undefined") return false;\n  const y = clientYFromEvent(evt);\n  if (y === null) return false;\n  return y >= window.innerHeight - MOBILE_DELETE_ZONE_HEIGHT;\n}\n\nfunction setMobileFieldMoving(moving: boolean) {\n  if (typeof window === "undefined") return;\n  window.dispatchEvent(new CustomEvent("quickfill:mobile-field-moving", { detail: { moving } }));\n}\n`,
    "mobile moving event helper",
  );

  text = replaceOnce(
    text,
    `                  if (isMobileEditor) setDeleteDrop({ visible: true, active: false });`,
    `                  if (isMobileEditor) {\n                    setDeleteDrop({ visible: true, active: false });\n                    setMobileFieldMoving(true);\n                  }`,
    "drag start moving event",
  );

  text = replaceOnce(
    text,
    `                  setIsDragging(false);\n                  setCursorStyle("move");\n                  if (finishMobileFieldDrag(field.id, evt)) {`,
    `                  setIsDragging(false);\n                  setCursorStyle("move");\n                  if (isMobileEditor) setMobileFieldMoving(false);\n                  if (finishMobileFieldDrag(field.id, evt)) {`,
    "drag end moving event",
  );

  text = replaceOnce(
    text,
    `                onTransformStart={() => {\n                  setEditingFieldId(null);\n                }}\n                onTransformEnd={(width, height, x, y) => {\n                  // Convert from Stage coords to PDF point space\n                  onFieldUpdate(field.id, {\n                    width: width / fitScale,\n                    height: height / fitScale,\n                    x: x / fitScale,\n                    y: y / fitScale,\n                  });\n                }}`,
    `                onTransformStart={() => {\n                  setEditingFieldId(null);\n                  if (isMobileEditor) setMobileFieldMoving(true);\n                }}\n                onTransformEnd={(width, height, x, y) => {\n                  // Convert from Stage coords to PDF point space\n                  onFieldUpdate(field.id, {\n                    width: width / fitScale,\n                    height: height / fitScale,\n                    x: x / fitScale,\n                    y: y / fitScale,\n                  });\n                  if (isMobileEditor) setMobileFieldMoving(false);\n                }}`,
    "transform moving event",
  );

  text = replaceOnce(
    text,
    `      style={{ touchAction: activeTool || isDragging || (isMobileEditor && selectedFieldId) ? "none" : "pan-x pan-y" }}`,
    `      style={{ touchAction: activeTool || isDragging ? "none" : "pan-x pan-y", overscrollBehavior: "contain" }}`,
    "selected field touch action",
  );

  writeIfChanged(path, text);
}

patchContextPanel();
patchPdfViewer();
