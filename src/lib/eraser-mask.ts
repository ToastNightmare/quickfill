import type { EditorField, LineField, MaskRect } from "./types";

/**
 * Compute intersection of a square brush with a field rect.
 * All coordinates in page display space.
 * Returns null if there is no overlap.
 */
export function brushIntersectField(
  brushX: number,
  brushY: number,
  brushHalfSize: number,
  field: EditorField
): MaskRect | null {
  const left = Math.max(brushX - brushHalfSize, field.x);
  const top = Math.max(brushY - brushHalfSize, field.y);
  const right = Math.min(brushX + brushHalfSize, field.x + field.width);
  const bottom = Math.min(brushY + brushHalfSize, field.y + field.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Return a new EditorField with the given mask appended to eraseMasks.
 * Never mutates the input field.
 */
export function addEraserMask(field: EditorField, mask: MaskRect): EditorField {
  return {
    ...field,
    eraseMasks: [...(field.eraseMasks ?? []), mask],
  };
}

/**
 * For a horizontal or vertical line field, compute the surviving segments
 * after subtracting all eraser masks.
 *
 * For horizontal lines: returns [x_start, x_end] intervals in page coords.
 * For vertical lines: returns [y_start, y_end] intervals in page coords.
 *
 * Returns an array of [start, end] pairs. Empty array means fully erased.
 */
export function lineMaskSegments(field: LineField, masks: MaskRect[]): Array<[number, number]> {
  const isHorizontal = field.orientation === "horizontal";

  let segments: Array<[number, number]> = isHorizontal
    ? [[field.x, field.x + field.width]]
    : [[field.y, field.y + field.height]];

  for (const mask of masks) {
    if (isHorizontal) {
      if (mask.y >= field.y + field.height || mask.y + mask.height <= field.y) continue;
    } else {
      if (mask.x >= field.x + field.width || mask.x + mask.width <= field.x) continue;
    }

    const maskStart = isHorizontal ? mask.x : mask.y;
    const maskEnd = isHorizontal ? mask.x + mask.width : mask.y + mask.height;

    segments = segments.flatMap(([a, b]): Array<[number, number]> => {
      if (maskEnd <= a || maskStart >= b) return [[a, b]];
      const parts: Array<[number, number]> = [];
      if (maskStart > a) parts.push([a, maskStart]);
      if (maskEnd < b) parts.push([maskEnd, b]);
      return parts;
    });
  }

  return segments;
}

/**
 * Field types that the mask eraser is allowed to touch.
 */
export function isMaskErasable(field: EditorField): boolean {
  return (
    field.type === "line" ||
    field.type === "text" ||
    field.type === "date" ||
    field.type === "signature" ||
    field.type === "checkbox"
  );
}
