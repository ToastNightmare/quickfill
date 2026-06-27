import type { EditorField } from "@/lib/types";

export function eraserOverlapsField(
  field: EditorField,
  brushCenterX: number,
  brushCenterY: number,
  brushHalfSize: number
): boolean {
  return (
    field.x < brushCenterX + brushHalfSize &&
    field.x + field.width > brushCenterX - brushHalfSize &&
    field.y < brushCenterY + brushHalfSize &&
    field.y + field.height > brushCenterY - brushHalfSize
  );
}

export function collectEraserFieldIds(
  fields: EditorField[],
  brushCenterX: number,
  brushCenterY: number,
  brushHalfSize: number
): string[] {
  return fields
    .filter((field) => field.type !== "whiteout" && eraserOverlapsField(field, brushCenterX, brushCenterY, brushHalfSize))
    .map((field) => field.id);
}
