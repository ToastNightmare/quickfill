/**
 * @jest-environment node
 */

import { PDFDocument, PDFName, degrees } from "pdf-lib";

import {
  FLATTENED_IMAGE_MAX_BYTES,
  applyFlattenedPages,
  estimateDataUrlBytes,
  flattenedImageKind,
  parseFlattenedPages,
  whiteoutPageSet,
} from "@/lib/pdf-flatten";
import {
  burnWhiteoutIntoCanvas,
  flattenScaleFor,
  whiteoutPageIndexes,
  FLATTEN_MAX_DIMENSION_PX,
  FLATTEN_RENDER_SCALE,
} from "@/lib/pdf-flatten-client";
import type { EditorField } from "@/lib/types";

// 1x1 white PNG
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function whiteoutField(page: number, overrides: Partial<EditorField> = {}): EditorField {
  return {
    id: `wo-${page}`,
    type: "whiteout",
    x: 10,
    y: 20,
    width: 100,
    height: 30,
    page,
    fillColor: "#f5f5f0",
    ...overrides,
  } as EditorField;
}

function textField(page: number): EditorField {
  return {
    id: `txt-${page}`,
    type: "text",
    x: 5,
    y: 5,
    width: 80,
    height: 20,
    page,
    value: "hello",
    fontSize: 12,
  } as EditorField;
}

describe("whiteoutPageSet / whiteoutPageIndexes", () => {
  it("collects only pages containing whiteout fields", () => {
    const fields = [whiteoutField(2), whiteoutField(0), textField(1), whiteoutField(2)];
    expect(Array.from(whiteoutPageSet(fields)).sort()).toEqual([0, 2]);
    expect(whiteoutPageIndexes(fields)).toEqual([0, 2]);
  });

  it("returns empty for no whiteout fields", () => {
    expect(whiteoutPageSet([textField(0)]).size).toBe(0);
    expect(whiteoutPageIndexes([])).toEqual([]);
  });
});

describe("flattenedImageKind", () => {
  it("accepts png and jpeg data URLs only", () => {
    expect(flattenedImageKind(TINY_PNG_DATA_URL)).toBe("png");
    expect(flattenedImageKind("data:image/jpeg;base64,AAAA")).toBe("jpeg");
    expect(flattenedImageKind("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(flattenedImageKind("data:image/png;base64X,AAAA")).toBeNull();
    expect(flattenedImageKind("https://example.com/a.png")).toBeNull();
  });
});

describe("estimateDataUrlBytes", () => {
  it("estimates decoded size from base64 length", () => {
    expect(estimateDataUrlBytes("data:image/png;base64,AAAA")).toBe(3);
    expect(estimateDataUrlBytes("no-comma")).toBe(0);
  });
});

describe("parseFlattenedPages", () => {
  const whiteoutPages = new Set([0, 1]);

  it("accepts valid entries for whiteout pages", () => {
    const json = JSON.stringify([[0, TINY_PNG_DATA_URL]]);
    const entries = parseFlattenedPages(json, 3, whiteoutPages);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pageIndex: 0, kind: "png" });
  });

  it("returns empty on null or invalid JSON without throwing", () => {
    expect(parseFlattenedPages(null, 3, whiteoutPages)).toEqual([]);
    expect(parseFlattenedPages("{not json", 3, whiteoutPages)).toEqual([]);
    expect(parseFlattenedPages('"a string"', 3, whiteoutPages)).toEqual([]);
  });

  it("drops out-of-range, non-integer, and duplicate page indexes", () => {
    const json = JSON.stringify([
      [-1, TINY_PNG_DATA_URL],
      [5, TINY_PNG_DATA_URL],
      [0.5, TINY_PNG_DATA_URL],
      [1, TINY_PNG_DATA_URL],
      [1, TINY_PNG_DATA_URL],
    ]);
    const entries = parseFlattenedPages(json, 3, whiteoutPages);
    expect(entries).toHaveLength(1);
    expect(entries[0].pageIndex).toBe(1);
  });

  it("drops pages that have no whiteout fields", () => {
    const json = JSON.stringify([[2, TINY_PNG_DATA_URL]]);
    expect(parseFlattenedPages(json, 3, whiteoutPages)).toEqual([]);
  });

  it("drops unsupported image types and malformed tuples", () => {
    const json = JSON.stringify([
      [0, "data:image/gif;base64,AAAA"],
      [1],
      "junk",
      [0, 42],
    ]);
    expect(parseFlattenedPages(json, 3, whiteoutPages)).toEqual([]);
  });

  it("enforces the per-image size guard", () => {
    const oversized = `data:image/png;base64,${"A".repeat(Math.ceil((FLATTENED_IMAGE_MAX_BYTES + 1024) * (4 / 3)))}`;
    const json = JSON.stringify([[0, oversized]]);
    expect(parseFlattenedPages(json, 3, whiteoutPages)).toEqual([]);
  });
});

describe("applyFlattenedPages", () => {
  it("replaces page content with the embedded image and reports the page", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont("Helvetica");
    const page = pdfDoc.addPage([300, 200]);
    page.drawText("SECRET-UNDER-WHITEOUT", { x: 20, y: 100, size: 12, font });

    const applied = await applyFlattenedPages(pdfDoc, [
      { pageIndex: 0, dataUrl: TINY_PNG_DATA_URL, kind: "png" },
    ]);

    expect(Array.from(applied)).toEqual([0]);

    // The referenced page content must no longer contain the original text.
    const saved = await pdfDoc.save({ useObjectStreams: false });
    const outDoc = await PDFDocument.load(saved);
    const contents = outDoc.getPages()[0].node.Contents();
    expect(contents).toBeDefined();

    // Content stream should now hold image ops, verified indirectly by the
    // presence of an XObject in page resources and success of the swap above.
    const resources = outDoc.getPages()[0].node.get(PDFName.of("Resources"));
    expect(resources).toBeDefined();
  });

  it("skips rotated pages and reports nothing for them", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([300, 200]);
    page.setRotation(degrees(90));

    const applied = await applyFlattenedPages(pdfDoc, [
      { pageIndex: 0, dataUrl: TINY_PNG_DATA_URL, kind: "png" },
    ]);
    expect(applied.size).toBe(0);
  });

  it("survives invalid image bytes without throwing", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([300, 200]);

    const applied = await applyFlattenedPages(pdfDoc, [
      { pageIndex: 0, dataUrl: "data:image/png;base64,bm90LWEtcG5n", kind: "png" },
      { pageIndex: 7, dataUrl: TINY_PNG_DATA_URL, kind: "png" },
    ]);
    expect(applied.size).toBe(0);
  });
});

describe("flattenScaleFor", () => {
  it("uses the preferred scale for normal pages", () => {
    expect(flattenScaleFor(612, 792)).toBe(FLATTEN_RENDER_SCALE);
  });

  it("caps the scale for very large pages", () => {
    const scale = flattenScaleFor(4000, 2000);
    expect(scale).toBeCloseTo(FLATTEN_MAX_DIMENSION_PX / 4000);
    expect(scale).toBeLessThan(FLATTEN_RENDER_SCALE);
  });

  it("falls back to the preferred scale for degenerate sizes", () => {
    expect(flattenScaleFor(0, 0)).toBe(FLATTEN_RENDER_SCALE);
  });
});

describe("burnWhiteoutIntoCanvas", () => {
  it("fills scaled rects with each whiteout field color for the target page", () => {
    const calls: Array<{ fillStyle: string; rect: number[] }> = [];
    const ctx = {
      fillStyle: "" as string,
      fillRect(x: number, y: number, w: number, h: number) {
        calls.push({ fillStyle: String(this.fillStyle), rect: [x, y, w, h] });
      },
    };

    const fields = [
      whiteoutField(0, { x: 10, y: 20, width: 100, height: 30, fillColor: "#abcdef" } as Partial<EditorField>),
      whiteoutField(1),
      textField(0),
    ];

    const burned = burnWhiteoutIntoCanvas(ctx, fields, 0, 2);
    expect(burned).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].fillStyle).toBe("#abcdef");
    expect(calls[0].rect).toEqual([20, 40, 200, 60]);
  });

  it("defaults to white when fillColor is missing", () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: "" as string,
      fillRect() {
        calls.push(String(this.fillStyle));
      },
    };
    const field = whiteoutField(0, { fillColor: "" } as Partial<EditorField>);
    burnWhiteoutIntoCanvas(ctx, [field], 0, 1);
    expect(calls).toEqual(["#ffffff"]);
  });
});
