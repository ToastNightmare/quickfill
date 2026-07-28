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
      const pushOperatorsSpy = jest.spyOn(page, "pushOperators");
      const { width: rawWidth, height: rawHeight } = page.getSize();
      const swapsDimensions = rotation === 90 || rotation === 270;
      const displayWidth = swapsDimensions ? rawHeight : rawWidth;
      const displayHeight = swapsDimensions ? rawWidth : rawHeight;
      const fontSize = 8;
      const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, fontSize);
      const textX = displayWidth / 2 - textWidth / 2;
      const displayYs = [displayHeight - 14, 8];

      applyBorderWatermark([page], font, false);

      const expectedTransform =
        rotation === 90
          ? "0 1 -1 0 595 0 cm"
          : rotation === 180
            ? "-1 0 0 -1 595 842 cm"
            : "0 -1 1 0 0 842 cm";
      const pushedOperators = pushOperatorsSpy.mock.calls
        .flat()
        .map((operator) => operator.toString());
      expect(pushedOperators).toEqual(
        expect.arrayContaining(["q", expectedTransform, "Q"]),
      );

      expect(drawTextSpy).toHaveBeenCalledTimes(2);
      for (let index = 0; index < displayYs.length; index++) {
        expect(drawTextSpy.mock.calls[index][1]?.x).toBeCloseTo(textX);
        expect(drawTextSpy.mock.calls[index][1]?.y).toBeCloseTo(displayYs[index]);
      }

      const annotations = page.node.Annots();
      expect(annotations).toBeDefined();
      expect(annotations!.size()).toBe(2);
      const centeredStart = textX - 2;
      const centeredEnd = textX + textWidth + 2;
      const expectedRects =
        rotation === 90
          ? [
              [3, centeredStart, 16, centeredEnd],
              [576, centeredStart, 589, centeredEnd],
            ]
          : rotation === 180
            ? [
                [centeredStart, 3, centeredEnd, 16],
                [centeredStart, 823, centeredEnd, 836],
              ]
            : [
                [579, centeredStart, 592, centeredEnd],
                [6, centeredStart, 19, centeredEnd],
              ];

      for (let index = 0; index < displayYs.length; index++) {
        const annotation = pdfDoc.context.lookup(
          annotations!.get(index),
          PDFDict,
        );
        const actualRect = annotationRect(annotation);

        expect(annotationUri(annotation)).toBe(WATERMARK_URL);
        expect(actualRect).toHaveLength(4);
        actualRect.forEach((value, rectIndex) => {
          expect(value).toBeCloseTo(expectedRects[index][rectIndex]);
        });
      }

      pushOperatorsSpy.mockRestore();
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
