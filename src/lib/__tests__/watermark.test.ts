import {
  degrees,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
} from "pdf-lib";
import { applyBorderWatermark, WATERMARK_TEXT, WATERMARK_URL } from "../watermark";

const ROTATION_SAFE_DOWNLOAD_FLAG = "NEXT_PUBLIC_QUICKFILL_ROTATION_SAFE_DOWNLOAD";
const originalRotationSafeDownloadFlag =
  process.env[ROTATION_SAFE_DOWNLOAD_FLAG];

function transformDisplayRect(
  rect: [number, number, number, number],
  rotation: number,
  rawWidth: number,
  rawHeight: number,
) {
  const [left, bottom, right, top] = rect;
  const transformPoint = (x: number, y: number): [number, number] => {
    if (rotation === 90) return [rawWidth - y, x];
    if (rotation === 180) return [rawWidth - x, rawHeight - y];
    if (rotation === 270) return [y, rawHeight - x];
    return [x, y];
  };
  const points = [
    transformPoint(left, bottom),
    transformPoint(left, top),
    transformPoint(right, bottom),
    transformPoint(right, top),
  ];

  return [
    Math.min(...points.map(([x]) => x)),
    Math.min(...points.map(([, y]) => y)),
    Math.max(...points.map(([x]) => x)),
    Math.max(...points.map(([, y]) => y)),
  ];
}

describe("applyBorderWatermark", () => {
  let pdfDoc: PDFDocument;
  let pages: ReturnType<PDFDocument["getPages"]>;
  let font: Awaited<ReturnType<PDFDocument["embedFont"]>>;

  beforeEach(async () => {
    delete process.env[ROTATION_SAFE_DOWNLOAD_FLAG];
    pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595, 842]);
    pdfDoc.addPage([595, 842]);
    pdfDoc.addPage([595, 842]);

    pages = pdfDoc.getPages();
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  });

  afterEach(() => {
    if (originalRotationSafeDownloadFlag === undefined) {
      delete process.env[ROTATION_SAFE_DOWNLOAD_FLAG];
    } else {
      process.env[ROTATION_SAFE_DOWNLOAD_FLAG] =
        originalRotationSafeDownloadFlag;
    }
  });

  function annotationUri(annotation: PDFDict) {
    const action = pdfDoc.context.lookup(annotation.get(PDFName.of("A"))!, PDFDict);
    const uri = action.get(PDFName.of("URI"));
    expect(uri).toBeInstanceOf(PDFString);
    return (uri as PDFString).decodeText();
  }

  function annotationRect(annotation: PDFDict) {
    const rect = pdfDoc.context.lookup(
      annotation.get(PDFName.of("Rect"))!,
      PDFArray,
    );
    return rect.asArray().map((value) => (value as PDFNumber).asNumber());
  }

  it("should apply watermark to all pages when isPro is false", () => {
    const drawTextSpy = jest.spyOn(pages[0], "drawText");

    applyBorderWatermark(pages, font, false);

    expect(drawTextSpy).toHaveBeenCalledTimes(2);
    expect(drawTextSpy.mock.calls[0][0]).toBe(WATERMARK_TEXT);

    drawTextSpy.mockRestore();
  });

  it("should NOT apply watermark when isPro is true", () => {
    const drawTextSpy = jest.spyOn(pages[0], "drawText");

    applyBorderWatermark(pages, font, true);

    expect(drawTextSpy).not.toHaveBeenCalled();
    expect(pages[0].node.Annots()).toBeUndefined();

    drawTextSpy.mockRestore();
  });

  it("should apply watermark to each page individually", () => {
    const page0Spy = jest.spyOn(pages[0], "drawText");
    const page1Spy = jest.spyOn(pages[1], "drawText");
    const page2Spy = jest.spyOn(pages[2], "drawText");

    applyBorderWatermark(pages, font, false);

    expect(page0Spy).toHaveBeenCalledTimes(2);
    expect(page1Spy).toHaveBeenCalledTimes(2);
    expect(page2Spy).toHaveBeenCalledTimes(2);

    page0Spy.mockRestore();
    page1Spy.mockRestore();
    page2Spy.mockRestore();
  });

  it("should use correct watermark text", () => {
    const drawTextSpy = jest.spyOn(pages[0], "drawText");

    applyBorderWatermark(pages, font, false);

    for (const call of drawTextSpy.mock.calls) {
      expect(call[0]).toBe(WATERMARK_TEXT);
    }

    drawTextSpy.mockRestore();
  });

  it("should apply watermarks at correct positions for top and bottom edges", () => {
    const page = pages[0];
    const { height } = page.getSize();
    const drawTextSpy = jest.spyOn(page, "drawText");

    applyBorderWatermark([page], font, false);

    const topCall = drawTextSpy.mock.calls.find(
      (call) => call[1]?.y === height - 14 && call[1]?.rotate === undefined
    );
    expect(topCall).toBeDefined();

    const bottomCall = drawTextSpy.mock.calls.find(
      (call) => call[1]?.y === 8 && call[1]?.rotate === undefined
    );
    expect(bottomCall).toBeDefined();

    drawTextSpy.mockRestore();
  });

  it("should not draw side-edge rotated watermarks", () => {
    const page = pages[0];
    const drawTextSpy = jest.spyOn(page, "drawText");

    applyBorderWatermark([page], font, false);

    const rotatedCalls = drawTextSpy.mock.calls.filter(
      (call) => call[1]?.rotate !== undefined
    );

    expect(rotatedCalls).toHaveLength(0);

    drawTextSpy.mockRestore();
  });

  it("should make both watermark placements clickable", () => {
    const page = pages[0];

    applyBorderWatermark([page], font, false);

    const annotations = page.node.Annots();
    expect(annotations).toBeDefined();
    expect(annotations!.size()).toBe(2);

    for (const annotationRef of annotations!.asArray()) {
      const annotation = pdfDoc.context.lookup(annotationRef, PDFDict);
      const rect = pdfDoc.context.lookup(annotation.get(PDFName.of("Rect"))!, PDFArray);
      expect(rect.size()).toBe(4);
      expect(annotationUri(annotation)).toBe(WATERMARK_URL);
    }
  });

  it("should not add link annotations for Pro users", () => {
    applyBorderWatermark([pages[0]], font, true);

    expect(pages[0].node.Annots()).toBeUndefined();
  });

  it.each([90, 180, 270])(
    "places visible and clickable free watermarks on displayed edges at %i°",
    (rotation) => {
      process.env[ROTATION_SAFE_DOWNLOAD_FLAG] = "local-v1";
      const page = pages[0];
      page.setRotation(degrees(rotation));
      const drawTextSpy = jest.spyOn(page, "drawText");
      const { width: rawWidth, height: rawHeight } = page.getSize();
      const swapsDimensions = rotation === 90 || rotation === 270;
      const displayWidth = swapsDimensions ? rawHeight : rawWidth;
      const displayHeight = swapsDimensions ? rawWidth : rawHeight;
      const fontSize = 8;
      const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, fontSize);
      const textX = displayWidth / 2 - textWidth / 2;
      const displayYs = [displayHeight - 14, 8];

      applyBorderWatermark([page], font, false);

      expect(drawTextSpy).toHaveBeenCalledTimes(2);
      for (let index = 0; index < displayYs.length; index++) {
        expect(drawTextSpy.mock.calls[index][1]?.x).toBeCloseTo(textX);
        expect(drawTextSpy.mock.calls[index][1]?.y).toBeCloseTo(displayYs[index]);
      }

      const annotations = page.node.Annots();
      expect(annotations).toBeDefined();
      expect(annotations!.size()).toBe(2);
      for (let index = 0; index < displayYs.length; index++) {
        const annotation = pdfDoc.context.lookup(
          annotations!.get(index),
          PDFDict,
        );
        const displayY = displayYs[index];
        const expectedRect = transformDisplayRect(
          [textX - 2, displayY - 2, textX + textWidth + 2, displayY + fontSize + 3],
          rotation,
          rawWidth,
          rawHeight,
        );
        const actualRect = annotationRect(annotation);

        expect(annotationUri(annotation)).toBe(WATERMARK_URL);
        expect(actualRect).toHaveLength(4);
        actualRect.forEach((value, rectIndex) => {
          expect(value).toBeCloseTo(expectedRect[rectIndex]);
        });
      }

      drawTextSpy.mockRestore();
    },
  );

  it("keeps Pro output clean on a rotated page when the flag is enabled", () => {
    process.env[ROTATION_SAFE_DOWNLOAD_FLAG] = "local-v1";
    const page = pages[0];
    page.setRotation(degrees(90));
    const drawTextSpy = jest.spyOn(page, "drawText");

    applyBorderWatermark([page], font, true);

    expect(drawTextSpy).not.toHaveBeenCalled();
    expect(page.node.Annots()).toBeUndefined();
    drawTextSpy.mockRestore();
  });
});
