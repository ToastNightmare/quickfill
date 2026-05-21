import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/ContextPanel.tsx";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = readFileSync(path, "utf8");
  if (normalize(current) !== next) writeFileSync(path, next);
}

function replaceOnce(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing mobile nudge anchor (${label}): ${search.slice(0, 120)}`);
  return text.replace(search, replacement);
}

let text = normalize(readFileSync(path, "utf8"));

text = replaceOnce(
  text,
  `  ChevronUp,\n  SquareSplitHorizontal,\n} from "lucide-react";`,
  `  ChevronUp,\n  SquareSplitHorizontal,\n  ArrowUp,\n  ArrowDown,\n  ArrowLeft,\n  ArrowRight,\n} from "lucide-react";`,
  "arrow imports",
);

text = replaceOnce(
  text,
  `}) {\n  const TypeIcon = fieldIcon(selectedField.type);\n\n  return (`,
  `}) {\n  const TypeIcon = fieldIcon(selectedField.type);\n  const nudgeField = (dx: number, dy: number) => {\n    onFieldUpdate(selectedField.id, {\n      x: Math.max(0, selectedField.x + dx),\n      y: Math.max(0, selectedField.y + dy),\n    } as Partial<EditorField>);\n  };\n\n  return (`,
  "nudge handler",
);

text = replaceOnce(
  text,
  `      {selectedField.type === "comb" && (\n        <CombControls\n          selectedField={selectedField}\n          expanded={charCountExpanded}\n          onExpandedChange={onCharCountExpandedChange}\n          onFieldUpdate={onFieldUpdate}\n        />\n      )}\n\n      <Section>`,
  `      {selectedField.type === "comb" && (\n        <CombControls\n          selectedField={selectedField}\n          expanded={charCountExpanded}\n          onExpandedChange={onCharCountExpandedChange}\n          onFieldUpdate={onFieldUpdate}\n        />\n      )}\n\n      {selectedField.type !== "whiteout" && (\n        <Section label="Move">\n          <div className="mx-auto grid max-w-[180px] grid-cols-3 gap-2">\n            <span aria-hidden="true" />\n            <NudgeButton label="Move up" icon={ArrowUp} onClick={() => nudgeField(0, -2)} />\n            <span aria-hidden="true" />\n            <NudgeButton label="Move left" icon={ArrowLeft} onClick={() => nudgeField(-2, 0)} />\n            <button\n              onClick={onFieldDeselect}\n              className="flex h-10 items-center justify-center rounded-xl border border-border bg-surface-alt px-3 text-xs font-bold text-text-muted"\n            >\n              Done\n            </button>\n            <NudgeButton label="Move right" icon={ArrowRight} onClick={() => nudgeField(2, 0)} />\n            <span aria-hidden="true" />\n            <NudgeButton label="Move down" icon={ArrowDown} onClick={() => nudgeField(0, 2)} />\n            <span aria-hidden="true" />\n          </div>\n        </Section>\n      )}\n\n      <Section>`,
  "mobile nudge controls",
);

text = replaceOnce(
  text,
  `}\n\nfunction LayerControls({ selectedField }: { selectedField: EditorField }) {`,
  `}\n\nfunction NudgeButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Type; onClick: () => void }) {\n  return (\n    <button\n      aria-label={label}\n      title={label}\n      onClick={onClick}\n      className="flex h-10 items-center justify-center rounded-xl border border-border bg-surface-alt text-text-muted transition-colors hover:border-accent hover:text-accent"\n    >\n      <Icon className="h-4 w-4" />\n    </button>\n  );\n}\n\nfunction LayerControls({ selectedField }: { selectedField: EditorField }) {`,
  "NudgeButton component",
);

writeIfChanged(path, text);
