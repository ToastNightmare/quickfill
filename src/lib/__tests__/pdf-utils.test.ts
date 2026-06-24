import { fillPdf, orderFieldsForPdfDraw } from "../pdf-utils";
import type { EditorField } from "../types";

jest.mock("pdf-lib", () => ({
  PDFDocument: {
    load: jest.fn(),
  },
  rgb: jest.fn((red: number, green: number, blue: number) => ({ red, green, blue })),
  StandardFonts: {
    Helvetica: "Helvetica",
    HelveticaOblique: "HelveticaOblique",
  },
  PDFName: {
    of: jest.fn((name: string) => name),
  },
}));

const { PDFDocument } = jest.requireMock("pdf-lib") as {
  PDFDocument: { load: jest.Mock };
};

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

const checkbox = (overrides: Partial<EditorField> = {}): EditorField => ({
  id: "checkbox-1",
  type: "checkbox",
  x: 20,
  y: 30,
  width: 20,
  height: 20,
  page: 0,
  checked: true,
  stamp: "tick",
  ...overrides,
} as EditorField);

const line = (overrides: Partial<EditorField> = {}): EditorField => ({
  id: "line-1",
  type: "line",
  x: 10,
  y: 20,
  width: 120,
  height: 4,
  page: 0,
  orientation: "horizontal",
  color: "#000000",
  strokeWidth: 2,
  ...overrides,
} as EditorField);

function mockPdfDoc() {
  const page = {
    getHeight: jest.fn(() => 200),
    drawLine: jest.fn(),
    drawRectangle: jest.fn(),
    drawText: jest.fn(),
  };
  const pdfDoc = {
    embedFont: jest.fn(async (font: string) => ({ font })),
    getPages: jest.fn(() => [page]),
    getForm: jest.fn(),
    save: jest.fn(async () => new Uint8Array([37, 80, 68, 70])),
  };
  PDFDocument.load.mockResolvedValue(pdfDoc);
  return { page, pdfDoc };
}

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

describe("PDF checkbox export", () => {
  beforeEach(() => {
    PDFDocument.load.mockReset();
  });

  it("exports blue tick checkbox lines", async () => {
    const { page } = mockPdfDoc();

    await fillPdf(new ArrayBuffer(0), [checkbox({ color: "#2563eb" })], new Map(), false);

    expect(page.drawLine).toHaveBeenCalledTimes(2);
    expect(page.drawLine.mock.calls[0][0].color).toEqual({
      red: 37 / 255,
      green: 99 / 255,
      blue: 235 / 255,
    });
  });

  it("exports red cross checkbox lines", async () => {
    const { page } = mockPdfDoc();

    await fillPdf(new ArrayBuffer(0), [checkbox({ stamp: "cross", color: "#dc2626" })], new Map(), false);

    expect(page.drawLine).toHaveBeenCalledTimes(2);
    expect(page.drawLine.mock.calls[0][0].color).toEqual({
      red: 220 / 255,
      green: 38 / 255,
      blue: 38 / 255,
    });
  });

  it("exports an outline for empty checkbox stamps", async () => {
    const { page } = mockPdfDoc();

    await fillPdf(new ArrayBuffer(0), [checkbox({ checked: false, stamp: "none", color: "#000000" })], new Map(), false);

    expect(page.drawLine).not.toHaveBeenCalled();
    expect(page.drawRectangle).toHaveBeenCalledWith(expect.objectContaining({
      borderColor: { red: 0, green: 0, blue: 0 },
      borderWidth: expect.any(Number),
    }));
  });

  it("exports legacy checkboxes in near-black when color is absent", async () => {
    const { page } = mockPdfDoc();

    await fillPdf(new ArrayBuffer(0), [checkbox({ color: undefined })], new Map(), false);

    expect(page.drawLine.mock.calls[0][0].color).toEqual({
      red: 18 / 255,
      green: 23 / 255,
      blue: 38 / 255,
    });
  });
});

describe("PDF line export", () => {
  beforeEach(() => {
    PDFDocument.load.mockReset();
  });

  it("exports horizontal lines with full width and y midpoint", async () => {
    const { page } = mockPdfDoc();

    await fillPdf(new ArrayBuffer(0), [line()], new Map(), false);

    expect(page.drawLine).toHaveBeenCalledWith(expect.objectContaining({
      start: { x: 10, y: 178 },
      end: { x: 130, y: 178 },
      thickness: 2,
    }));
  });

  it("exports vertical lines with full height and x midpoint", async () => {
    const { page } = mockPdfDoc();

    await fillPdf(new ArrayBuffer(0), [line({ orientation: "vertical", width: 4, height: 120 })], new Map(), false);

    expect(page.drawLine).toHaveBeenCalledWith(expect.objectContaining({
      start: { x: 12, y: 60 },
      end: { x: 12, y: -60 },
      thickness: 2,
    }));
  });

  it("exports blue lines with blue RGB color", async () => {
    const { page } = mockPdfDoc();

    await fillPdf(new ArrayBuffer(0), [line({ color: "#2563eb" })], new Map(), false);

    expect(page.drawLine.mock.calls[0][0].color).toEqual({
      red: 37 / 255,
      green: 99 / 255,
      blue: 235 / 255,
    });
  });

  it("defaults no-color lines to black", async () => {
    const { page } = mockPdfDoc();

    await fillPdf(new ArrayBuffer(0), [line({ color: undefined })], new Map(), false);

    expect(page.drawLine.mock.calls[0][0].color).toEqual({
      red: 0,
      green: 0,
      blue: 0,
    });
  });
});
