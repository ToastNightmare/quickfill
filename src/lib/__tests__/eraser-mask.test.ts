import {
  MASK_CACHE_PADDING_PX,
  MASK_ERASE_FILL,
  addEraserMask,
  brushIntersectField,
  interpolateMaskPath,
  isMaskErasable,
  lineMaskSegments,
  maskCacheConfig,
} from "../eraser-mask";
import type { EditorField, LineField, MaskRect } from "../types";

const baseField = (overrides: Partial<EditorField> = {}): EditorField => ({
  id: "field-1",
  type: "text",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  page: 0,
  value: "",
  fontSize: 14,
  ...overrides,
} as EditorField);

const lineField = (overrides: Partial<LineField> = {}): LineField => ({
  id: "line-1",
  type: "line",
  x: 10,
  y: 20,
  width: 100,
  height: 2,
  page: 0,
  orientation: "horizontal",
  color: "#000000",
  strokeWidth: 2,
  ...overrides,
});

describe("brushIntersectField", () => {
  it("returns full brush rect when brush is fully inside field", () => {
    expect(brushIntersectField(50, 45, 10, baseField())).toEqual({ x: 40, y: 35, width: 20, height: 20 });
  });

  it("returns clipped intersection for partial overlap", () => {
    expect(brushIntersectField(105, 65, 15, baseField())).toEqual({ x: 90, y: 50, width: 20, height: 20 });
  });

  it("returns null when there is no overlap", () => {
    expect(brushIntersectField(200, 200, 10, baseField())).toBeNull();
  });

  it("returns the field rect when brush is larger than field", () => {
    expect(brushIntersectField(60, 45, 100, baseField())).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });
});

describe("addEraserMask", () => {
  it("returns a new object and does not mutate the original", () => {
    const field = baseField();
    const mask: MaskRect = { x: 12, y: 22, width: 10, height: 10 };
    const updated = addEraserMask(field, mask);

    expect(updated).not.toBe(field);
    expect(updated.eraseMasks).toEqual([mask]);
    expect(field.eraseMasks).toBeUndefined();
  });

  it("appends to existing masks", () => {
    const first: MaskRect = { x: 12, y: 22, width: 10, height: 10 };
    const second: MaskRect = { x: 40, y: 25, width: 5, height: 5 };
    const updated = addEraserMask(baseField({ eraseMasks: [first] }), second);

    expect(updated.eraseMasks).toEqual([first, second]);
  });
});

describe("mask rendering constants", () => {
  it("uses a fully opaque erase fill", () => {
    expect(MASK_ERASE_FILL).toBe("rgba(0,0,0,1)");
  });

  it("pads cache bounds and keeps the requested pixel ratio", () => {
    expect(maskCacheConfig(baseField({ width: 20, height: 10 }), 2, 3)).toEqual({
      x: -MASK_CACHE_PADDING_PX,
      y: -MASK_CACHE_PADDING_PX,
      width: 20 * 2 + MASK_CACHE_PADDING_PX * 2,
      height: 10 * 2 + MASK_CACHE_PADDING_PX * 2,
      pixelRatio: 3,
    });
  });

  it("falls back to a valid cache pixel ratio", () => {
    expect(maskCacheConfig(baseField(), 1, 0).pixelRatio).toBe(1);
  });
});

describe("interpolateMaskPath", () => {
  it("returns the end point for a short segment", () => {
    expect(interpolateMaskPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 20)).toEqual([{ x: 10, y: 0 }]);
  });

  it("fills long drag gaps with overlapping steps", () => {
    expect(interpolateMaskPath({ x: 0, y: 0 }, { x: 48, y: 0 }, 19.2)).toEqual([
      { x: 16, y: 0 },
      { x: 32, y: 0 },
      { x: 48, y: 0 },
    ]);
  });

  it("falls back to a positive step size", () => {
    expect(interpolateMaskPath({ x: 0, y: 0 }, { x: 2, y: 0 }, 0)).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });
});

describe("lineMaskSegments", () => {
  it("returns two segments for a single mask in the middle of a horizontal line", () => {
    expect(lineMaskSegments(lineField(), [{ x: 40, y: 19, width: 20, height: 4 }])).toEqual([[10, 40], [60, 110]]);
  });

  it("returns one segment when a mask covers the start of a line", () => {
    expect(lineMaskSegments(lineField(), [{ x: 0, y: 19, width: 30, height: 4 }])).toEqual([[30, 110]]);
  });

  it("returns one segment when a mask covers the end of a line", () => {
    expect(lineMaskSegments(lineField(), [{ x: 80, y: 19, width: 50, height: 4 }])).toEqual([[10, 80]]);
  });

  it("returns an empty array when a mask covers the full line", () => {
    expect(lineMaskSegments(lineField(), [{ x: 0, y: 19, width: 130, height: 4 }])).toEqual([]);
  });

  it("returns three segments for two non-overlapping masks", () => {
    expect(lineMaskSegments(lineField(), [
      { x: 30, y: 19, width: 10, height: 4 },
      { x: 70, y: 19, width: 20, height: 4 },
    ])).toEqual([[10, 30], [40, 70], [90, 110]]);
  });

  it("leaves the segment unchanged when a mask does not overlap the line Y range", () => {
    expect(lineMaskSegments(lineField(), [{ x: 40, y: 40, width: 20, height: 10 }])).toEqual([[10, 110]]);
  });

  it("returns vertical line segments on the Y axis", () => {
    expect(lineMaskSegments(lineField({
      x: 50,
      y: 10,
      width: 2,
      height: 100,
      orientation: "vertical",
    }), [{ x: 49, y: 30, width: 4, height: 20 }])).toEqual([[10, 30], [50, 110]]);
  });
});

describe("isMaskErasable", () => {
  it("returns true for line, text, date, signature, and checkbox", () => {
    const fields: EditorField[] = [
      lineField(),
      baseField({ type: "text", value: "", fontSize: 14 }),
      baseField({ type: "date", value: "28/06/2026", fontSize: 14 }),
      baseField({ type: "signature", value: "", fontSize: 16 }),
      baseField({ type: "checkbox", checked: true }),
    ] as EditorField[];

    expect(fields.map(isMaskErasable)).toEqual([true, true, true, true, true]);
  });

  it("returns false for comb and whiteout", () => {
    const fields: EditorField[] = [
      baseField({ type: "comb", value: "", charCount: 9 }),
      baseField({ type: "whiteout", fillColor: "#ffffff" }),
    ] as EditorField[];

    expect(fields.map(isMaskErasable)).toEqual([false, false]);
  });
});
