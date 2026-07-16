import { createEditorFieldId } from "./field-ids";
import type { EditorField } from "./types";

export const FIELD_SUGGESTION_SCHEMA_VERSION = 1 as const;
export const FIELD_SUGGESTION_ID_PREFIX = "qf-suggestion-v1-";
export const DOCUMENT_REVISION_PREFIX = "qf-document-v1-";

export type SuggestedFieldType = "text" | "checkbox";

export interface FieldSuggestionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldSuggestionCoordinateSpace {
  unit: "pdf-point";
  origin: "top-left";
  pageWidth: number;
  pageHeight: number;
}

export interface FieldSuggestionMetadata {
  category: string;
  reasoning?: string;
}

export interface FieldSuggestion {
  schemaVersion: typeof FIELD_SUGGESTION_SCHEMA_VERSION;
  id: string;
  documentRevision: string;
  type: SuggestedFieldType;
  pageIndex: number;
  boundingBox: FieldSuggestionBounds;
  coordinateSpace: FieldSuggestionCoordinateSpace;
  confidence: number;
  label?: string;
  metadata?: FieldSuggestionMetadata;
}

export interface FieldSuggestionValidationContext {
  documentRevision: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hashString(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableHash(value: string): string {
  const first = hashString(value, 0x811c9dc5).toString(16).padStart(8, "0");
  const second = hashString(value, 0x9e3779b9).toString(16).padStart(8, "0");
  return `${first}${second}`;
}

function quantizeForId(value: number): number {
  return Math.round(value * 4) / 4;
}

export function isDocumentRevision(value: unknown): value is string {
  return (
    typeof value === "string" &&
    new RegExp(`^${DOCUMENT_REVISION_PREFIX}[a-f0-9]{16,64}$`).test(value)
  );
}

export async function createDocumentRevision(bytes: ArrayBuffer): Promise<string> {
  const snapshot = bytes.slice(0);
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    const digest = await subtle.digest("SHA-256", snapshot);
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${DOCUMENT_REVISION_PREFIX}${hex}`;
  }

  const values = new Uint8Array(snapshot);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const value of values) {
    first = Math.imul((first ^ value) >>> 0, 0x01000193) >>> 0;
    second = Math.imul((second ^ value) >>> 0, 0x85ebca6b) >>> 0;
  }
  const fallback = `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
  return `${DOCUMENT_REVISION_PREFIX}${fallback}`;
}

export function createFieldSuggestionId(input: {
  documentRevision: string;
  pageIndex: number;
  boundingBox: FieldSuggestionBounds;
}): string {
  const { boundingBox } = input;
  const stableInput = [
    input.documentRevision,
    input.pageIndex,
    quantizeForId(boundingBox.x),
    quantizeForId(boundingBox.y),
    quantizeForId(boundingBox.width),
    quantizeForId(boundingBox.height),
  ].join(":");
  return `${FIELD_SUGGESTION_ID_PREFIX}${stableHash(stableInput)}`;
}

export function parseFieldSuggestion(
  value: unknown,
  context: FieldSuggestionValidationContext,
): FieldSuggestion | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== FIELD_SUGGESTION_SCHEMA_VERSION) return null;
  if (!isDocumentRevision(value.documentRevision) || value.documentRevision !== context.documentRevision) return null;
  if (value.type !== "text" && value.type !== "checkbox") return null;
  if (!Number.isInteger(value.pageIndex) || value.pageIndex !== context.pageIndex) return null;
  if (!isFiniteNumber(value.confidence) || value.confidence < 0 || value.confidence > 1) return null;
  if (!isRecord(value.boundingBox) || !isRecord(value.coordinateSpace)) return null;

  const { x, y, width, height } = value.boundingBox;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return null;
  if (!isFiniteNumber(context.pageWidth) || !isFiniteNumber(context.pageHeight)) return null;
  if (context.pageWidth <= 0 || context.pageHeight <= 0) return null;
  if (x + width > context.pageWidth || y + height > context.pageHeight) return null;

  const coordinateSpace = value.coordinateSpace;
  if (coordinateSpace.unit !== "pdf-point" || coordinateSpace.origin !== "top-left") return null;
  if (coordinateSpace.pageWidth !== context.pageWidth || coordinateSpace.pageHeight !== context.pageHeight) return null;

  const boundingBox = { x, y, width, height };
  const expectedId = createFieldSuggestionId({
    documentRevision: context.documentRevision,
    pageIndex: context.pageIndex,
    boundingBox,
  });
  if (value.id !== expectedId) return null;

  if (value.label !== undefined && (typeof value.label !== "string" || value.label.length > 200)) return null;
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) return null;
    if (typeof value.metadata.category !== "string" || value.metadata.category.length === 0 || value.metadata.category.length > 80) {
      return null;
    }
    if (
      value.metadata.reasoning !== undefined &&
      (typeof value.metadata.reasoning !== "string" || value.metadata.reasoning.length > 240)
    ) {
      return null;
    }
  }

  return value as unknown as FieldSuggestion;
}

export function validateFieldSuggestions(
  values: readonly unknown[],
  context: FieldSuggestionValidationContext,
): FieldSuggestion[] {
  const suggestions = new Map<string, FieldSuggestion>();
  for (const value of values) {
    const suggestion = parseFieldSuggestion(value, context);
    if (suggestion) suggestions.set(suggestion.id, suggestion);
  }
  return Array.from(suggestions.values());
}

export function replaceFieldSuggestions(incoming: readonly FieldSuggestion[]): FieldSuggestion[] {
  const suggestions = new Map<string, FieldSuggestion>();
  for (const suggestion of incoming) suggestions.set(suggestion.id, suggestion);
  return Array.from(suggestions.values());
}

export function withSuggestionType(
  suggestion: FieldSuggestion,
  type: SuggestedFieldType,
): FieldSuggestion {
  return { ...suggestion, type };
}

export function fieldSuggestionsToEditorFields(
  suggestions: readonly FieldSuggestion[],
  existingFields: readonly Pick<EditorField, "id">[],
): EditorField[] {
  const reservedIds = existingFields.map((field) => field.id);

  return suggestions.map((suggestion) => {
    const id = createEditorFieldId(reservedIds, `suggested-${suggestion.type}`);
    reservedIds.push(id);
    const base = {
      id,
      x: suggestion.boundingBox.x,
      y: suggestion.boundingBox.y,
      width: suggestion.boundingBox.width,
      height: suggestion.boundingBox.height,
      page: suggestion.pageIndex,
    };

    if (suggestion.type === "checkbox") {
      return { ...base, type: "checkbox", checked: false };
    }

    return {
      ...base,
      type: "text",
      value: "",
      fontSize: Math.max(8, Math.min(36, Math.round(suggestion.boundingBox.height * 0.65))),
    };
  });
}
