import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { applyBorderWatermark, WATERMARK_TEXT, WATERMARK_URL } from "../watermark";

describe("applyBorderWatermark", () => {
  let pdfDoc: PDFDocument;
  let pages: ReturnType<PDFDocument["getPages"]>;
  let font: Awaited<ReturnType<PDFDocument["embedFont"]>>;

  beforeEach(async () => {
    pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595, 842]);
    pdfDoc.addPage([595, 842]);
    pdfDoc.addPage([595, 842]);

    pages = pdfDoc.getPages();
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  });

  function annotationUri(annotation: PDFDict) {
    const action = pdfDoc.context.lookup(annotation.get(PDFName.of("A"))!, PDFDict);
    const uri = action.get(PDFName.of("URI"));
    expect(uri).toBeInstanceOf(PDFString);
    return (uri as PDFString).decodeText();
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
});
