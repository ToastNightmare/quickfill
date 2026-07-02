import { PDFDocument } from "pdf-lib";
import { TextDecoder, TextEncoder } from "util";
import {
  applyDocumentModeToPixels,
  cleanupImageToJpeg,
  cleanupPhotoFile,
  downscaleDimensions,
  isCleanablePhoto,
  MAX_CLEANUP_EDGE_PX,
  normalizeQuarterTurns,
  rotatedDimensions,
} from "@/lib/image-cleanup";
import { imageToPdfBytes } from "@/lib/document-intake";

global.TextDecoder = TextDecoder as typeof global.TextDecoder;
global.TextEncoder = TextEncoder as typeof global.TextEncoder;

const ONE_PIXEL_JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QP//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QP//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QP//Z",
  "base64"
);

describe("pure helpers", () => {
  it("normalizes quarter turns into 0..3", () => {
    expect(normalizeQuarterTurns(0)).toBe(0);
    expect(normalizeQuarterTurns(1)).toBe(1);
    expect(normalizeQuarterTurns(4)).toBe(0);
    expect(normalizeQuarterTurns(-1)).toBe(3);
    expect(normalizeQuarterTurns(-5)).toBe(3);
  });

  it("swaps dimensions on odd quarter turns", () => {
    expect(rotatedDimensions(400, 300, 0)).toEqual({ width: 400, height: 300 });
    expect(rotatedDimensions(400, 300, 1)).toEqual({ width: 300, height: 400 });
    expect(rotatedDimensions(400, 300, 2)).toEqual({ width: 400, height: 300 });
    expect(rotatedDimensions(400, 300, 3)).toEqual({ width: 300, height: 400 });
  });

  it("caps the longest edge without upscaling", () => {
    expect(downscaleDimensions(1000, 500)).toEqual({ width: 1000, height: 500, scale: 1 });
    const big = downscaleDimensions(4400, 2200);
    expect(big.width).toBe(MAX_CLEANUP_EDGE_PX);
    expect(big.height).toBe(1100);
    const tall = downscaleDimensions(1100, 8800);
    expect(tall.height).toBe(MAX_CLEANUP_EDGE_PX);
    expect(tall.width).toBe(275);
  });

  it("recognizes photos and skips PDFs", () => {
    expect(isCleanablePhoto(new File([""], "scan.png", { type: "image/png" }))).toBe(true);
    expect(isCleanablePhoto(new File([""], "photo.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isCleanablePhoto(new File([""], "photo.JPEG", { type: "" }))).toBe(true);
    expect(isCleanablePhoto(new File([""], "form.pdf", { type: "application/pdf" }))).toBe(false);
  });
});

describe("applyDocumentModeToPixels", () => {
  function rgbaPixels(colors: [number, number, number][]) {
    const data = new Uint8ClampedArray(colors.length * 4);
    colors.forEach(([r, g, b], index) => {
      data[index * 4] = r;
      data[index * 4 + 1] = g;
      data[index * 4 + 2] = b;
      data[index * 4 + 3] = 255;
    });
    return data;
  }

  it("produces grayscale output and preserves length and alpha", () => {
    const data = rgbaPixels([[200, 40, 90], [10, 240, 130]]);
    const length = data.length;

    applyDocumentModeToPixels(data);

    expect(data.length).toBe(length);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i + 1]).toBe(data[i + 2]);
      expect(data[i + 3]).toBe(255);
    }
  });

  it("stretches contrast so dark ink darkens and paper whitens", () => {
    // Simulate a dull photo: paper at ~180 luminance, ink at ~80.
    const colors: [number, number, number][] = [];
    for (let i = 0; i < 90; i += 1) colors.push([180, 180, 180]);
    for (let i = 0; i < 10; i += 1) colors.push([80, 80, 80]);
    const data = rgbaPixels(colors);

    applyDocumentModeToPixels(data);

    const paper = data[0];
    const ink = data[90 * 4];
    expect(paper).toBeGreaterThan(230);
    expect(ink).toBeLessThan(40);
  });

  it("handles empty pixel data", () => {
    expect(() => applyDocumentModeToPixels(new Uint8ClampedArray(0))).not.toThrow();
  });
});

function jpegBlob() {
  const blob = new Blob([new Uint8Array(ONE_PIXEL_JPG)], { type: "image/jpeg" });
  if (typeof blob.arrayBuffer !== "function") {
    Object.defineProperty(blob, "arrayBuffer", {
      value: async () =>
        ONE_PIXEL_JPG.buffer.slice(
          ONE_PIXEL_JPG.byteOffset,
          ONE_PIXEL_JPG.byteOffset + ONE_PIXEL_JPG.byteLength
        ),
    });
  }
  return blob;
}

describe("cleanupImageToJpeg pipeline", () => {
  let capturedCanvasSizes: { width: number; height: number }[];
  let documentModeApplied: boolean;

  function fakeContext(canvas: { width: number; height: number }) {
    return {
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      fillRect: jest.fn(),
      drawImage: jest.fn(),
      set fillStyle(_v: string) {},
      getImageData: jest.fn(() => ({
        data: new Uint8ClampedArray(Math.max(4, canvas.width * canvas.height * 4)),
      })),
      putImageData: jest.fn(() => {
        documentModeApplied = true;
      }),
    };
  }

  beforeEach(() => {
    capturedCanvasSizes = [];
    documentModeApplied = false;

    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: jest.fn(async () => ({
        width: 4400,
        height: 2200,
        close: jest.fn(),
      })),
    });

    jest.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") {
        throw new Error(`unexpected createElement(${tag})`);
      }
      const canvas: Record<string, unknown> = { width: 0, height: 0 };
      canvas.getContext = jest.fn(() => fakeContext(canvas as { width: number; height: number }));
      canvas.toBlob = jest.fn((cb: (blob: Blob | null) => void) => {
        capturedCanvasSizes.push({
          width: (canvas as { width: number }).width,
          height: (canvas as { height: number }).height,
        });
        cb(jpegBlob());
      });
      return canvas;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("downscales, rotates, and outputs bytes accepted by the image-to-PDF pipeline", async () => {
    const input = new Blob([new Uint8Array(ONE_PIXEL_JPG)], { type: "image/jpeg" });

    const bytes = await cleanupImageToJpeg(input, { rotateQuarterTurns: 1, documentMode: false });

    // 4400x2200 source -> capped to 2200x1100 -> rotated to 1100x2200
    expect(capturedCanvasSizes[0]).toEqual({ width: 1100, height: 2200 });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const pdf = await PDFDocument.load(await imageToPdfBytes(bytes, "jpeg"));
    expect(pdf.getPageCount()).toBe(1);
  });

  it("applies document mode pixels when enabled", async () => {
    const input = new Blob([new Uint8Array(ONE_PIXEL_JPG)], { type: "image/jpeg" });

    await cleanupImageToJpeg(input, { rotateQuarterTurns: 0, documentMode: true });
    expect(documentModeApplied).toBe(true);

    documentModeApplied = false;
    await cleanupImageToJpeg(input, { rotateQuarterTurns: 0, documentMode: false });
    expect(documentModeApplied).toBe(false);
  });

  it("requests EXIF-aware decoding", async () => {
    const input = new Blob([new Uint8Array(ONE_PIXEL_JPG)], { type: "image/jpeg" });

    await cleanupImageToJpeg(input, { rotateQuarterTurns: 0, documentMode: false });

    expect(window.createImageBitmap).toHaveBeenCalledWith(input, { imageOrientation: "from-image" });
  });

  it("builds a cleaned .jpg File preserving the base name", async () => {
    const input = new File([new Uint8Array(ONE_PIXEL_JPG)], "receipt scan.PNG", { type: "image/png" });

    const cleaned = await cleanupPhotoFile(input, { rotateQuarterTurns: 0, documentMode: true });

    expect(cleaned.name).toBe("receipt scan.jpg");
    expect(cleaned.type).toBe("image/jpeg");
    expect(cleaned.size).toBeGreaterThan(0);
  });
});
