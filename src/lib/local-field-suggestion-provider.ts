import { detectAllBoxes, type SnapResult } from "./snap-detect";
import {
  FIELD_SUGGESTION_SCHEMA_VERSION,
  createFieldSuggestionId,
  validateFieldSuggestions,
  type FieldSuggestion,
  type FieldSuggestionBounds,
  type SuggestedFieldType,
} from "./field-suggestions";

interface Dimensions {
  width: number;
  height: number;
}

export interface LocalFieldSuggestionRequest {
  canvas: HTMLCanvasElement;
  viewport: Dimensions;
  documentRevision: string;
  pageIndex: number;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isUsableBox(box: SnapResult, canvas: Dimensions): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    isPositiveFinite(box.width) &&
    isPositiveFinite(box.height) &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= canvas.width &&
    box.y + box.height <= canvas.height
  );
}

export function renderedCanvasBoxToPageBounds(
  box: SnapResult,
  canvas: Dimensions,
  viewport: Dimensions,
): FieldSuggestionBounds | null {
  if (![canvas.width, canvas.height, viewport.width, viewport.height].every(isPositiveFinite)) return null;
  if (!isUsableBox(box, canvas)) return null;

  const scaleX = canvas.width / viewport.width;
  const scaleY = canvas.height / viewport.height;
  if (!isPositiveFinite(scaleX) || !isPositiveFinite(scaleY)) return null;

  return {
    x: box.x / scaleX,
    y: box.y / scaleY,
    width: box.width / scaleX,
    height: box.height / scaleY,
  };
}

function suggestedType(bounds: FieldSuggestionBounds): SuggestedFieldType {
  const aspectRatio = bounds.width / bounds.height;
  const largestSide = Math.max(bounds.width, bounds.height);
  return aspectRatio >= 0.75 && aspectRatio <= 1.33 && largestSide <= 36 ? "checkbox" : "text";
}

export function detectLocalFieldSuggestions(request: LocalFieldSuggestionRequest): FieldSuggestion[] {
  const canvasDimensions = { width: request.canvas.width, height: request.canvas.height };
  if (request.pageIndex !== 0) return [];
  if (![request.viewport.width, request.viewport.height].every(isPositiveFinite)) return [];
  if (![canvasDimensions.width, canvasDimensions.height].every(isPositiveFinite)) return [];

  const rawSuggestions = detectAllBoxes(request.canvas).flatMap((box) => {
    const boundingBox = renderedCanvasBoxToPageBounds(box, canvasDimensions, request.viewport);
    if (!boundingBox) return [];
    const type = suggestedType(boundingBox);

    return [{
      schemaVersion: FIELD_SUGGESTION_SCHEMA_VERSION,
      id: createFieldSuggestionId({
        documentRevision: request.documentRevision,
        pageIndex: request.pageIndex,
        boundingBox,
      }),
      documentRevision: request.documentRevision,
      type,
      pageIndex: request.pageIndex,
      boundingBox,
      coordinateSpace: {
        unit: "pdf-point",
        origin: "top-left",
        pageWidth: request.viewport.width,
        pageHeight: request.viewport.height,
      },
      confidence: type === "checkbox" ? 0.72 : 0.58,
      metadata: {
        category: "visual-box",
        reasoning: type === "checkbox" ? "small-square-boundary" : "rectangular-entry-boundary",
      },
    }];
  });

  return validateFieldSuggestions(rawSuggestions, {
    documentRevision: request.documentRevision,
    pageIndex: request.pageIndex,
    pageWidth: request.viewport.width,
    pageHeight: request.viewport.height,
  });
}
