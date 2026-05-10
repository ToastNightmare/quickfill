import { moveFieldInLayer, orderFieldsForLayering } from "../field-layering";
import type { EditorField } from "../types";

function field(id: string, type: EditorField["type"]): EditorField {
  const base = { id, type, x: 0, y: 0, width: 100, height: 20, page: 0 };

  if (type === "checkbox") return { ...base, type, checked: false };
  if (type === "whiteout") return { ...base, type, fillColor: "#ffffff" };
  if (type === "comb") return { ...base, type, value: "", charCount: 4 };
  return { ...base, type, value: "", fontSize: 14 };
}

describe("field layering", () => {
  it("always draws whiteout below fillable content, even when added last", () => {
    const fields = [
      field("text", "text"),
      field("signature", "signature"),
      field("whiteout", "whiteout"),
    ];

    expect(orderFieldsForLayering(fields).map((item) => item.id)).toEqual([
      "whiteout",
      "text",
      "signature",
    ]);
  });

  it("keeps user order for non-whiteout fields", () => {
    const fields = [
      field("signature", "signature"),
      field("text", "text"),
      field("checkbox", "checkbox"),
      field("whiteout", "whiteout"),
    ];

    expect(orderFieldsForLayering(fields).map((item) => item.id)).toEqual([
      "whiteout",
      "signature",
      "text",
      "checkbox",
    ]);
  });

  it("moves a field within its own layer without putting it under whiteout", () => {
    const fields = [
      field("whiteout", "whiteout"),
      field("name", "text"),
      field("date", "date"),
      field("signature", "signature"),
    ];

    expect(moveFieldInLayer(fields, "name", "front").map((item) => item.id)).toEqual([
      "whiteout",
      "date",
      "signature",
      "name",
    ]);
  });

  it("can reorder multiple whiteout patches behind all fillable fields", () => {
    const fields = [
      field("whiteout-a", "whiteout"),
      field("name", "text"),
      field("whiteout-b", "whiteout"),
      field("signature", "signature"),
    ];

    expect(moveFieldInLayer(fields, "whiteout-b", "back").map((item) => item.id)).toEqual([
      "whiteout-b",
      "whiteout-a",
      "name",
      "signature",
    ]);
  });
});
