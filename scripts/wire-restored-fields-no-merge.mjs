import { readFileSync, writeFileSync } from "node:fs";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function writeIfChanged(path, next) {
  const current = normalize(readFileSync(path, "utf8"));
  if (current !== next) writeFileSync(path, next);
}

function replaceRequired(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) {
    throw new Error(`Missing restored-fields no-merge anchor (${label}): ${search.slice(0, 160)}`);
  }
  return text.replace(search, replacement);
}

function patchEditorPage() {
  const path = "src/app/editor/page.tsx";
  let text = normalize(readFileSync(path, "utf8"));

  const helperAnchor = `function matchProfileKey(fieldId: string): string | null {
  const lower = fieldId.toLowerCase().replace(/[_\\-\\.]/g, " ");
  for (const { key, keywords } of PROFILE_MATCHERS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return key;
    }
  }
  return null;
}
`;

  const helperReplacement = `${helperAnchor}
function normalizeRestoredFields(fields: EditorField[]): EditorField[] {
  return fields.map((field) => {
    if ((field.type !== "text" && field.type !== "date") || !field.snapBounds) return field;

    const bounds = field.snapBounds;
    const grewPastOriginalBox =
      field.width > bounds.width + Math.max(8, bounds.width * 0.15) ||
      field.height > bounds.height + Math.max(6, bounds.height * 0.25);

    if (!grewPastOriginalBox) return field;

    return {
      ...field,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    } as EditorField;
  });
}
`;

  text = replaceRequired(text, helperAnchor, helperReplacement, "normalize helper");

  text = replaceRequired(
    text,
    `      const savedFields = loadFieldsFromLocalStorage();`,
    `      const savedFields = normalizeRestoredFields(loadFieldsFromLocalStorage());`,
    "restore load normalization",
  );

  text = replaceRequired(
    text,
    `      if (savedFields.length > 0) {
        reset(savedFields);
      }`,
    `      if (savedFields.length > 0) {
        reset(savedFields);
        saveFieldsToLocalStorage(savedFields);
      }`,
    "persist normalized restore",
  );

  writeIfChanged(path, text);
}

patchEditorPage();
