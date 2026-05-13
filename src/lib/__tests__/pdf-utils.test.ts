import { orderFieldsForPdfDraw } from "../pdf-utils";
import type { EditorField } from "../types";

const whiteout = (id: string): EditorField => ({
  id,
  type: "whiteout",
  x: 10,
  y: 10,
  width: 100,
  height: 20,
  page: 0,
  fillColor: "#ffffff",
});

const text = (id: string): EditorField => ({
  id,
  type: "text",
  x: 12,
  y: 12,
  width: 80,
  height: 18,
  page: 0,
  value: "Replacement text",
  fontSize: 12,
});

const signature = (id: string): EditorField => ({
  id,
  type: "signature",
  x: 12,
  y: 36,
  width: 120,
  height: 32,
  page: 0,
  value: "Signed name",
  fontSize: 16,
});

describe("PDF export field ordering", () => {
  it("draws whiteout fields before visible replacement fields", () => {
    const fields = [text("text-1"), whiteout("whiteout-1"), signature("signature-1")];

    expect(orderFieldsForPdfDraw(fields).map((field) => field.id)).toEqual([
      "whiteout-1",
      "text-1",
      "signature-1",
    ]);
  });

  it("keeps relative order inside each layer", () => {
    const fields = [
      text("text-1"),
      whiteout("whiteout-1"),
      signature("signature-1"),
      whiteout("whiteout-2"),
      text("text-2"),
    ];

    expect(orderFieldsForPdfDraw(fields).map((field) => field.id)).toEqual([
      "whiteout-1",
      "whiteout-2",
      "text-1",
      "signature-1",
      "text-2",
    ]);
  });
});
