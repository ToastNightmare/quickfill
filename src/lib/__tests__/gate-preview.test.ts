/**
 * Direct regression coverage for the download-gate page compositor.
 *
 * The compositor draws editor fields onto a pdf.js-rendered page canvas.
 * Both the editor and the compositor call getViewport without a rotation
 * override, so field coordinates (top-left viewport points at scale 1)
 * must land at identical spots for 0/90/180/270 degree pages. These tests
 * pin that coordinate math and the signature/whiteout/mask transforms
 * using a recording canvas context.
 */
import { renderGatePagePreview } from "@/lib/gate-preview";
import { loadPdfjsClient } from "@/lib/pdfjs-client";
import type { EditorField } from "@/lib/types";

jest.mock("@/lib/pdfjs-client", () => ({
  loadPdfjsClient: jest.fn(),
}));

const mockedLoadPdfjs = loadPdfjsClient as jest.MockedFunction<typeof loadPdfjsClient>;

interface RecordedOp {
  op: string;
  args: unknown[];
}

interface FakeCanvas {
  width: number;
  height: number;
  ops: RecordedOp[];
  getContext: (kind: string) => unknown;
  toDataURL: () => string;
}

function recordingContext(ops: RecordedOp[]) {
  const methods = [
    "fillRect",
    "strokeRect",
    "fillText",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
    "save",
    "restore",
    "translate",
    "rotate",
    "scale",
    "drawImage",
    "clip",
    "rect",
  ];
  const target: Record<string, unknown> = {};
  for (const method of methods) {
    target[method] = (...args: unknown[]) => {
      ops.push({ op: method, args });
    };
  }
  return new Proxy(target, {
    set(obj, prop, value) {
      ops.push({ op: `set:${String(prop)}`, args: [value] });
      obj[prop as string] = value;
      return true;
    },
  });
}

function fakeCanvas(): FakeCanvas {
  const ops: RecordedOp[] = [];
  const ctx = recordingContext(ops);
  return {
    width: 0,
    height: 0,
    ops,
    getContext: (kind: string) => (kind === "2d" ? ctx : null),
    toDataURL: () => "data:image/png;base64,fake",
  };
}

interface FakePageSpec {
  /** Unrotated page size in PDF points. */
  width: number;
  height: number;
  /** Page /Rotate value in degrees. */
  rotate: number;
}

/**
 * Mimics pdf.js PDFPageProxy.getViewport({ scale }) with the default
 * rotation (the page's own /Rotate): 90/270 swap width and height.
 */
function fakePdfDocument(pages: FakePageSpec[]) {
  return {
    numPages: pages.length,
    getPage: async (pageNumber: number) => {
      const spec = pages[pageNumber - 1];
      const normalized = ((spec.rotate % 360) + 360) % 360;
      const swapped = normalized % 180 !== 0;
      return {
        rotate: spec.rotate,
        getViewport: ({ scale }: { scale: number }) => ({
          width: (swapped ? spec.height : spec.width) * scale,
          height: (swapped ? spec.width : spec.height) * scale,
        }),
        render: () => ({ promise: Promise.resolve() }),
      };
    },
  };
}

function mockPdf(pages: FakePageSpec[]) {
  mockedLoadPdfjs.mockResolvedValue({
    getDocument: () => ({ promise: Promise.resolve(fakePdfDocument(pages)) }),
  } as unknown as Awaited<ReturnType<typeof loadPdfjsClient>>);
}

class FakeImage {
  naturalWidth = 200;
  naturalHeight = 100;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

function opsOf(canvas: FakeCanvas, op: string): RecordedOp[] {
  return canvas.ops.filter((entry) => entry.op === op);
}

const PDF_BYTES = new ArrayBuffer(8);

describe("renderGatePagePreview compositor", () => {
  const createdCanvases: FakeCanvas[] = [];
  const originalImage = global.Image;
  let createElementSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    createdCanvases.length = 0;
    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = jest
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string, ...rest: unknown[]) => {
        if (tagName === "canvas") {
          const canvas = fakeCanvas();
          createdCanvases.push(canvas);
          return canvas as unknown as HTMLElement;
        }
        return originalCreateElement(tagName, ...(rest as []));
      });
    (global as { Image: unknown }).Image = FakeImage;
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    (global as { Image: unknown }).Image = originalImage;
  });

  it("places text on an ordinary 0-degree page (baseline coordinate math)", async () => {
    // 500pt wide page: preview scale is exactly 1000 / 500 = 2.
    mockPdf([{ width: 500, height: 700, rotate: 0 }]);
    const fields: EditorField[] = [
      { id: "t1", type: "text", x: 10, y: 20, width: 100, height: 30, page: 0, value: "Hello", fontSize: 14 },
    ];

    const url = await renderGatePagePreview(PDF_BYTES, fields, 0);

    expect(url).toBe("data:image/png;base64,fake");
    const page = createdCanvases[0];
    expect(page.width).toBe(1000);
    expect(page.height).toBe(1400);
    const [fillText] = opsOf(page, "fillText");
    expect(fillText.args[0]).toBe("Hello");
    expect(fillText.args[1]).toBeCloseTo(10 * 2 + 2 * 2); // x*scale + 2*scale padding
    expect(fillText.args[2]).toBeCloseTo(20 * 2 + (30 * 2) / 2); // vertical middle
    const fontSets = page.ops.filter((entry) => entry.op === "set:font");
    expect(fontSets.some((entry) => entry.args[0] === "28px Arial")).toBe(true); // 14 * scale
  });

  it("composites fields on a 90-degree rotated page in rotated-viewport space", async () => {
    // Unrotated 600x800; rotated viewport is 800x600, so scale = 1000/800 = 1.25.
    mockPdf([{ width: 600, height: 800, rotate: 90 }]);
    const fields: EditorField[] = [
      { id: "w1", type: "whiteout", x: 40, y: 80, width: 100, height: 20, page: 0, fillColor: "#f4f1ea" },
      { id: "t1", type: "text", x: 10, y: 20, width: 100, height: 30, page: 0, value: "Rotated", fontSize: 14 },
    ];

    const url = await renderGatePagePreview(PDF_BYTES, fields, 0);

    expect(url).toBe("data:image/png;base64,fake");
    const page = createdCanvases[0];
    // Canvas takes the rotated viewport dimensions, same as the editor canvas.
    expect(page.width).toBe(1000);
    expect(page.height).toBe(750);

    const [whiteout] = opsOf(page, "fillRect");
    expect(whiteout.args).toEqual([40 * 1.25, 80 * 1.25, 100 * 1.25, 20 * 1.25]);

    const [fillText] = opsOf(page, "fillText");
    expect(fillText.args[0]).toBe("Rotated");
    expect(fillText.args[1]).toBeCloseTo(10 * 1.25 + 2 * 1.25);
    expect(fillText.args[2]).toBeCloseTo(20 * 1.25 + (30 * 1.25) / 2);
  });

  it("applies signature opacity, rotation and flip on a 90-degree page", async () => {
    mockPdf([{ width: 600, height: 800, rotate: 90 }]);
    const fields: EditorField[] = [
      {
        id: "s1",
        type: "signature",
        x: 0,
        y: 0,
        width: 100,
        height: 60,
        page: 0,
        value: "Signed",
        fontSize: 14,
        signatureDataUrl: "data:image/png;base64,sig",
        opacity: 0.5,
        rotation: 30,
        flipH: true,
      },
    ];

    await renderGatePagePreview(PDF_BYTES, fields, 0);

    const page = createdCanvases[0];
    const scale = 1.25;
    const [translate] = opsOf(page, "translate");
    expect(translate.args[0]).toBeCloseTo((100 * scale) / 2); // field centre x
    expect(translate.args[1]).toBeCloseTo((60 * scale) / 2); // field centre y
    const [rotate] = opsOf(page, "rotate");
    expect(rotate.args[0]).toBeCloseTo((30 * Math.PI) / 180);
    const [flip] = opsOf(page, "scale");
    expect(flip.args).toEqual([-1, 1]);
    expect(page.ops.some((entry) => entry.op === "set:globalAlpha" && entry.args[0] === 0.5)).toBe(true);

    // Fit-contain inside the padded field box (FakeImage is 200x100).
    const fit = Math.min((100 * scale - 4) / 200, (60 * scale - 4) / 100);
    const [drawImage] = opsOf(page, "drawImage");
    expect(drawImage.args[1]).toBeCloseTo((-200 * fit) / 2);
    expect(drawImage.args[2]).toBeCloseTo((-100 * fit) / 2);
    expect(drawImage.args[3]).toBeCloseTo(200 * fit);
    expect(drawImage.args[4]).toBeCloseTo(100 * fit);
  });

  it("composites on 180-degree and 270-degree pages", async () => {
    const field: EditorField[] = [
      { id: "t1", type: "text", x: 10, y: 20, width: 100, height: 30, page: 0, value: "Any", fontSize: 12 },
    ];

    mockPdf([{ width: 500, height: 700, rotate: 180 }]);
    await renderGatePagePreview(PDF_BYTES, field, 0);
    // 180 keeps the unrotated dimensions.
    expect(createdCanvases[0].width).toBe(1000);
    expect(createdCanvases[0].height).toBe(1400);
    expect(opsOf(createdCanvases[0], "fillText")).toHaveLength(1);

    createdCanvases.length = 0;
    mockPdf([{ width: 600, height: 800, rotate: 270 }]);
    await renderGatePagePreview(PDF_BYTES, field, 0);
    // 270 swaps dimensions like 90.
    expect(createdCanvases[0].width).toBe(1000);
    expect(createdCanvases[0].height).toBe(750);
    expect(opsOf(createdCanvases[0], "fillText")).toHaveLength(1);
  });

  it("only draws the requested page's fields", async () => {
    mockPdf([
      { width: 500, height: 700, rotate: 0 },
      { width: 500, height: 700, rotate: 0 },
    ]);
    const fields: EditorField[] = [
      { id: "p0", type: "text", x: 10, y: 20, width: 100, height: 30, page: 0, value: "Page one", fontSize: 14 },
      { id: "p1", type: "text", x: 10, y: 20, width: 100, height: 30, page: 1, value: "Page two", fontSize: 14 },
    ];

    await renderGatePagePreview(PDF_BYTES, fields, 1);

    const page = createdCanvases[0];
    const texts = opsOf(page, "fillText").map((entry) => entry.args[0]);
    expect(texts).toEqual(["Page two"]);
  });

  it("omits empty text and unchecked no-stamp checkboxes", async () => {
    mockPdf([{ width: 500, height: 700, rotate: 0 }]);
    const fields: EditorField[] = [
      { id: "t1", type: "text", x: 10, y: 20, width: 100, height: 30, page: 0, value: "   ", fontSize: 14 },
      { id: "c1", type: "checkbox", x: 50, y: 50, width: 20, height: 20, page: 0, checked: false },
    ];

    const url = await renderGatePagePreview(PDF_BYTES, fields, 0);

    expect(url).toBe("data:image/png;base64,fake");
    const page = createdCanvases[0];
    expect(opsOf(page, "fillText")).toHaveLength(0);
    expect(opsOf(page, "strokeRect")).toHaveLength(0);
    expect(opsOf(page, "stroke")).toHaveLength(0);
  });

  it("draws checkbox ticks and explicit none-stamp outlines", async () => {
    mockPdf([{ width: 500, height: 700, rotate: 0 }]);
    const fields: EditorField[] = [
      { id: "c1", type: "checkbox", x: 50, y: 50, width: 20, height: 20, page: 0, checked: true },
      { id: "c2", type: "checkbox", x: 90, y: 50, width: 20, height: 20, page: 0, checked: false, stamp: "none" },
    ];

    await renderGatePagePreview(PDF_BYTES, fields, 0);

    const page = createdCanvases[0];
    expect(opsOf(page, "stroke").length).toBeGreaterThanOrEqual(1); // tick strokes
    const [noneBox] = opsOf(page, "strokeRect");
    expect(noneBox.args).toEqual([90 * 2, 50 * 2, 20 * 2, 20 * 2]);
  });

  it("applies eraser masks on an isolated layer with destination-out", async () => {
    mockPdf([{ width: 500, height: 700, rotate: 90 }]);
    const fields: EditorField[] = [
      {
        id: "t1",
        type: "text",
        x: 10,
        y: 20,
        width: 100,
        height: 30,
        page: 0,
        value: "Masked",
        fontSize: 14,
        eraseMasks: [{ x: 30, y: 25, width: 10, height: 10 }],
      },
    ];

    await renderGatePagePreview(PDF_BYTES, fields, 0);

    expect(createdCanvases).toHaveLength(2);
    const [page, layer] = createdCanvases;
    // 90-degree page: viewport 700x500, scale = 1000/700.
    const scale = 1000 / 700;
    // Text draws on the layer, not the page.
    expect(opsOf(layer, "fillText")).toHaveLength(1);
    expect(opsOf(page, "fillText")).toHaveLength(0);
    // Mask erases only the layer.
    expect(layer.ops.some((entry) => entry.op === "set:globalCompositeOperation" && entry.args[0] === "destination-out")).toBe(true);
    const [maskRect] = opsOf(layer, "fillRect");
    expect(maskRect.args[0]).toBeCloseTo(30 * scale);
    expect(maskRect.args[1]).toBeCloseTo(25 * scale);
    expect(maskRect.args[2]).toBeCloseTo(10 * scale);
    expect(maskRect.args[3]).toBeCloseTo(10 * scale);
    // The erased layer is drawn back onto the page.
    const pageDraws = opsOf(page, "drawImage");
    expect(pageDraws).toHaveLength(1);
    expect(pageDraws[0].args[0]).toBe(layer);
  });

  it("returns null for an out-of-range page index", async () => {
    mockPdf([{ width: 500, height: 700, rotate: 0 }]);

    expect(await renderGatePagePreview(PDF_BYTES, [], 5)).toBeNull();
    expect(await renderGatePagePreview(PDF_BYTES, [], -1)).toBeNull();
  });
});
