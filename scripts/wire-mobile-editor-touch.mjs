import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/PdfViewer.tsx";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = readFileSync(path, "utf8");
  if (current !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing mobile editor touch anchor: ${search.slice(0, 100)}`);
  return text.replace(search, replacement);
}

function ensureImport(text, after, addition) {
  if (normalize(text).includes(addition.trim())) return text;
  const anchor = after.replace(/\r?\n$/, "");
  const index = text.indexOf(anchor);
  if (index === -1) throw new Error(`Missing import anchor: ${after.trim()}`);
  const lineEndStart = index + anchor.length;
  const lineEnd = text.startsWith("\r\n", lineEndStart) ? "\r\n" : "\n";
  return text.slice(0, lineEndStart + lineEnd.length) + addition.replace(/\r?\n/g, lineEnd) + text.slice(lineEndStart + lineEnd.length);
}

let text = readFileSync(path, "utf8");
text = normalize(text);

text = ensureImport(
  text,
  'import type Konva from "konva";\n',
  'import { Trash2 } from "lucide-react";\n',
);

text = replaceOnce(
  text,
  `}\n\nexport const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer({`,
  `}\n\nconst MOBILE_DELETE_ZONE_HEIGHT = 112;\n\nfunction isMobileEditorPointer() {\n  if (typeof window === "undefined") return false;\n  return window.innerWidth < 768 || window.matchMedia?.("(pointer: coarse)").matches === true;\n}\n\nfunction clientYFromEvent(evt?: Event | null) {\n  if (!evt) return null;\n  const touchEvent = evt as TouchEvent;\n  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0];\n  if (touch) return touch.clientY;\n  const mouseEvent = evt as MouseEvent;\n  return Number.isFinite(mouseEvent.clientY) ? mouseEvent.clientY : null;\n}\n\nfunction isEventInMobileDeleteZone(evt?: Event | null) {\n  if (typeof window === "undefined") return false;\n  const y = clientYFromEvent(evt);\n  if (y === null) return false;\n  return y >= window.innerHeight - MOBILE_DELETE_ZONE_HEIGHT;\n}\n\nexport const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer({`,
);

text = replaceOnce(
  text,
  `  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, fieldId: string } | null>(null);\n  const [whiteoutColorInternal, setWhiteoutColorInternal] = useState<string | null>(null);`,
  `  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, fieldId: string } | null>(null);\n  const [isMobileEditor, setIsMobileEditor] = useState(false);\n  const [deleteDrop, setDeleteDrop] = useState({ visible: false, active: false });\n  const [whiteoutColorInternal, setWhiteoutColorInternal] = useState<string | null>(null);`,
);

text = replaceOnce(
  text,
  `  }, []);\n\n\n\n\n  // Register/unregister node callbacks for FieldShape`,
  `  }, []);\n\n  useEffect(() => {\n    const updateMobileEditor = () => setIsMobileEditor(isMobileEditorPointer());\n    updateMobileEditor();\n\n    const media = window.matchMedia?.("(pointer: coarse)");\n    window.addEventListener("resize", updateMobileEditor);\n    media?.addEventListener?.("change", updateMobileEditor);\n\n    return () => {\n      window.removeEventListener("resize", updateMobileEditor);\n      media?.removeEventListener?.("change", updateMobileEditor);\n    };\n  }, []);\n\n  // Register/unregister node callbacks for FieldShape`,
);

text = replaceOnce(
  text,
  `  }, [contextMenu]);\n\n  // Update cursor based on context`,
  `  }, [contextMenu]);\n\n  const handleMobileFieldDragMove = useCallback((e: Konva.KonvaEventObject<Event>) => {\n    if (!isMobileEditor) return;\n    setDeleteDrop({ visible: true, active: isEventInMobileDeleteZone(e.evt) });\n  }, [isMobileEditor]);\n\n  const finishMobileFieldDrag = useCallback((fieldId: string, evt?: Event | null) => {\n    if (!isMobileEditor) {\n      setDeleteDrop({ visible: false, active: false });\n      return false;\n    }\n\n    const shouldDelete = isEventInMobileDeleteZone(evt);\n    setDeleteDrop({ visible: false, active: false });\n\n    if (shouldDelete) {\n      onFieldDelete(fieldId);\n      onFieldSelect(null);\n      return true;\n    }\n\n    return false;\n  }, [isMobileEditor, onFieldDelete, onFieldSelect]);\n\n  // Update cursor based on context`,
);

text = replaceOnce(
  text,
  `      style={{ touchAction: activeTool ? "none" : "pan-x pan-y" }}\n    >`,
  `      style={{ touchAction: activeTool || isDragging || (isMobileEditor && selectedFieldId) ? "none" : "pan-x pan-y" }}\n    >`,
);

text = replaceOnce(
  text,
  `                isHovered={field.id === hoveredFieldId}\n                onSelect={() => {`,
  `                isHovered={field.id === hoveredFieldId}\n                allowSnappedDrag={isMobileEditor}\n                onSelect={() => {`,
);

text = replaceOnce(
  text,
  `                  if (!dragStartedRef.current && field.type !== "signature" && field.type !== "whiteout" && field.type !== "comb") {\n                    setEditingFieldId(field.id);`,
  `                  if (!dragStartedRef.current && !isMobileEditor && field.type !== "signature" && field.type !== "whiteout" && field.type !== "comb") {\n                    setEditingFieldId(field.id);`,
);

text = replaceOnce(
  text,
  `                onDragStart={() => {\n                  // Whiteout fields don't drag - skip\n                  if (field.type === "whiteout") return;\n                  dragStartedRef.current = true;\n                  setIsDragging(true);\n                  setEditingFieldId(null);\n                  setCursorStyle("grabbing");\n                }}\n                onDragEnd={(x, y) => {\n                  // Whiteout fields don't drag - skip\n                  if (field.type === "whiteout") return;\n                  setIsDragging(false);\n                  setCursorStyle("move");\n                  // Convert from Stage coords to PDF point space\n                  onFieldUpdate(field.id, { x: x / fitScale, y: y / fitScale });\n                  setTimeout(() => { dragStartedRef.current = false; }, 50);\n                }}\n                onTransformStart={() => {`,
  `                onDragStart={() => {\n                  // Whiteout fields don't drag - skip\n                  if (field.type === "whiteout") return;\n                  dragStartedRef.current = true;\n                  onFieldSelect(field.id);\n                  onToolSelect(null);\n                  setIsDragging(true);\n                  setEditingFieldId(null);\n                  setCursorStyle("grabbing");\n                  if (isMobileEditor) setDeleteDrop({ visible: true, active: false });\n                }}\n                onDragMove={handleMobileFieldDragMove}\n                onDragEnd={(x, y, evt) => {\n                  // Whiteout fields don't drag - skip\n                  if (field.type === "whiteout") return;\n                  setIsDragging(false);\n                  setCursorStyle("move");\n                  if (finishMobileFieldDrag(field.id, evt)) {\n                    setTimeout(() => { dragStartedRef.current = false; }, 50);\n                    return;\n                  }\n                  // Convert from Stage coords to PDF point space\n                  onFieldUpdate(field.id, { x: x / fitScale, y: y / fitScale });\n                  setTimeout(() => { dragStartedRef.current = false; }, 50);\n                }}\n                onTransformStart={() => {`,
);

text = replaceOnce(
  text,
  `          if (!selectedField || !selectedField.snapped) return null;`,
  `          if (!selectedField || !selectedField.snapped || isMobileEditor) return null;`,
);

text = replaceOnce(
  text,
  `            );\n          })()}\n      </div>\n    </div>`,
  `            );\n          })()}\n      </div>\n\n      {isMobileEditor && deleteDrop.visible && (\n        <div\n          className={\`fixed left-1/2 bottom-5 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold shadow-2xl transition-all $\{\n            deleteDrop.active\n              ? "scale-105 border-red-500 bg-red-600 text-white"\n              : "border-slate-200 bg-white text-slate-700"\n          }\`}\n          style={{ pointerEvents: "none" }}\n        >\n          <Trash2 size={18} />\n          <span>{deleteDrop.active ? "Release to delete" : "Drag here to delete"}</span>\n        </div>\n      )}\n    </div>`,
);

text = replaceOnce(
  text,
  `  isHovered,\n  onSelect,`,
  `  isHovered,\n  allowSnappedDrag,\n  onSelect,`,
);

text = replaceOnce(
  text,
  `  onDragStart,\n  onDragEnd,`,
  `  onDragStart,\n  onDragMove,\n  onDragEnd,`,
);

text = replaceOnce(
  text,
  `  isHovered: boolean;\n  onSelect: () => void;`,
  `  isHovered: boolean;\n  allowSnappedDrag: boolean;\n  onSelect: () => void;`,
);

text = replaceOnce(
  text,
  `  onDragStart?: () => void;\n  onDragEnd: (x: number, y: number) => void;`,
  `  onDragStart?: () => void;\n  onDragMove?: (e: Konva.KonvaEventObject<Event>) => void;\n  onDragEnd: (x: number, y: number, evt?: Event) => void;`,
);

text = text.replaceAll("draggable={!isSnapped}", "draggable={allowSnappedDrag || !isSnapped}");
text = text.replace(
  `draggable={field.type === "signature" ? true : !isSnapped}`,
  `draggable={field.type === "signature" ? true : allowSnappedDrag || !isSnapped}`,
);

text = text.replaceAll(
  `        onDragStart={() => {\n          setDragOpacity(0.85);\n          onDragStart?.();\n        }}\n        onDragEnd={(e) => {\n          setDragOpacity(1);\n          onDragEnd(e.target.x(), e.target.y());\n        }}`,
  `        onDragStart={() => {\n          setDragOpacity(0.85);\n          onDragStart?.();\n        }}\n        onDragMove={(e) => onDragMove?.(e)}\n        onDragEnd={(e) => {\n          setDragOpacity(1);\n          onDragEnd(e.target.x(), e.target.y(), e.evt);\n        }}`,
);

text = replaceOnce(
  text,
  `          onClick={(e) => {\n            e.cancelBubble = true;\n            onSelect();\n          }}\n          onDragStart={() => {`,
  `          onClick={(e) => {\n            e.cancelBubble = true;\n            onSelect();\n          }}\n          onTap={(e) => {\n            e.cancelBubble = true;\n            onSelect();\n          }}\n          onDragStart={() => {`,
);

text = replaceOnce(
  text,
  `        onClick={(e) => {\n          e.cancelBubble = true;\n          onSelect();\n        }}\n        onDblClick={(e) => {`,
  `        onClick={(e) => {\n          e.cancelBubble = true;\n          onSelect();\n        }}\n        onTap={(e) => {\n          e.cancelBubble = true;\n          if (isSelected && field.type !== "signature") {\n            onDoubleClick();\n          } else {\n            onSelect();\n          }\n        }}\n        onDblClick={(e) => {`,
);

text = replaceOnce(
  text,
  `        onDblClick={(e) => {\n          e.cancelBubble = true;\n          onDoubleClick();\n        }}\n        onDragStart={() => {`,
  `        onDblClick={(e) => {\n          e.cancelBubble = true;\n          onDoubleClick();\n        }}\n        onDblTap={(e) => {\n          e.cancelBubble = true;\n          onDoubleClick();\n        }}\n        onDragStart={() => {`,
);

writeIfChanged(path, text);
