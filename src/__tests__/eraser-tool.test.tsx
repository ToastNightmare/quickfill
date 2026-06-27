import { collectEraserFieldIds, eraserOverlapsField } from "@/lib/eraser-tool";
import type { EditorField } from "@/lib/types";
import { __historyTestUtils } from "@/lib/use-history";

const textField = (overrides: Partial<EditorField> = {}): EditorField => ({
  id: "field-a",
  type: "text",
  x: 40,
  y: 40,
  width: 20,
  height: 20,
  page: 0,
  value: "",
  fontSize: 14,
  ...overrides,
} as EditorField);

describe("eraserOverlapsField", () => {
  it("returns true when a field is fully inside the brush", () => {
    expect(eraserOverlapsField(textField({ x: 45, y: 45, width: 10, height: 10 }), 50, 50, 20)).toBe(true);
  });

  it("returns true when a field partially overlaps the brush", () => {
    expect(eraserOverlapsField(textField({ x: 65, y: 45, width: 20, height: 10 }), 50, 50, 20)).toBe(true);
  });

  it("returns false when a field is adjacent but not touching", () => {
    expect(eraserOverlapsField(textField({ x: 70, y: 45, width: 10, height: 10 }), 50, 50, 20)).toBe(false);
  });

  it("returns false when a field is completely outside the brush", () => {
    expect(eraserOverlapsField(textField({ x: 120, y: 120, width: 10, height: 10 }), 50, 50, 20)).toBe(false);
  });
});

describe("eraser field collection", () => {
  it("does not include overlapping whiteout fields", () => {
    const fields: EditorField[] = [
      textField({ id: "text-a", x: 45, y: 45, width: 10, height: 10 }),
      {
        id: "whiteout-a",
        type: "whiteout",
        x: 45,
        y: 45,
        width: 10,
        height: 10,
        page: 0,
        fillColor: "#ffffff",
      },
    ];

    expect(collectEraserFieldIds(fields, 50, 50, 20)).toEqual(["text-a"]);
  });
});

describe("eraser batch deletion history", () => {
  it("creates one history entry when deleting multiple fields in a batch", () => {
    const fields = [
      textField({ id: "a" }),
      textField({ id: "b" }),
      textField({ id: "c" }),
    ];
    const state = { past: [], present: fields, future: [] };
    const ids = new Set(["a", "b"]);

    const next = __historyTestUtils.reducer(state, {
      type: "SET",
      updater: (prev: EditorField[]) => prev.filter((field) => !ids.has(field.id)),
    });

    expect(next.present.map((field) => field.id)).toEqual(["c"]);
    expect(next.past).toHaveLength(1);
  });
});
