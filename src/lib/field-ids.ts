import type { EditorField } from "./types";

type FieldIdSource = Pick<EditorField, "id"> | string;

const DEFAULT_PREFIX = "field";
const MAX_RANDOM_ATTEMPTS = 32;

let fallbackCounter = 0;

function getId(source: FieldIdSource): string {
  return typeof source === "string" ? source : source.id;
}

function collectIds(sources: Iterable<FieldIdSource>): Set<string> {
  const ids = new Set<string>();
  for (const source of sources) {
    const id = getId(source);
    if (id) ids.add(id);
  }
  return ids;
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || DEFAULT_PREFIX;
}

function randomToken(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  fallbackCounter += 1;
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function reserveFieldId(usedIds: Set<string>, prefix = DEFAULT_PREFIX): string {
  const safePrefix = normalizePrefix(prefix);

  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
    const id = `${safePrefix}-${randomToken()}`;
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }

  let id: string;
  do {
    fallbackCounter += 1;
    id = `${safePrefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
  } while (usedIds.has(id));

  usedIds.add(id);
  return id;
}

export function createEditorFieldId(existingIds: Iterable<FieldIdSource> = [], prefix = DEFAULT_PREFIX): string {
  return reserveFieldId(collectIds(existingIds), prefix);
}

export function withUniqueEditorFieldId<T extends EditorField>(
  field: T,
  existingFields: Iterable<FieldIdSource>,
  prefix = field.type,
): T {
  const usedIds = collectIds(existingFields);
  if (field.id.trim() && !usedIds.has(field.id)) return field;
  return { ...field, id: reserveFieldId(usedIds, prefix) } as T;
}

export function repairDuplicateEditorFieldIds(fields: readonly EditorField[]): EditorField[] {
  const usedIds = new Set<string>();
  let changed = false;

  const repaired = fields.map((field) => {
    if (field.id.trim() && !usedIds.has(field.id)) {
      usedIds.add(field.id);
      return field;
    }

    changed = true;
    return { ...field, id: reserveFieldId(usedIds, field.type) } as EditorField;
  });

  return changed ? repaired : (fields as EditorField[]);
}
