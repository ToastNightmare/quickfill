import { PDFDocument, StandardFonts } from "pdf-lib";
import { applyBorderWatermark } from "../watermark";

describe("applyBorderWatermark", () => {
  let pdfDoc: PDFDocument;
  let pages: ReturnType<PDFDocument["getPages"]>;
  let font: Awaited<ReturnType<PDFDocument["embedFont"]>>;

  beforeEach(async () => {
    pdfDoc = await PDFDocument.create();
    // Add a few pages for testing
    pdfDoc.addPage([595, 842]); // A4 size
    pdfDoc.addPage([595, 842]);
    pdfDoc.addPage([595, 842]);
    
    pages = pdfDoc.getPages();
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  });

  it("should apply watermark to all pages when isPro is false", () => {
    // Spy on page.drawText to verify it gets called
    const drawTextSpy = jest.spyOn(pages[0], "drawText");
    
    applyBorderWatermark(pages, font, false);
    
    // Should call drawText 4 times per page (top, bottom, left, right)
    // We have 3 pages, so 12 total calls
    expect(drawTextSpy).toHaveBeenCalledTimes(4);
    
    // Verify the watermark text is correct
    const firstCall = drawTextSpy.mock.calls[0][0];
    expect(firstCall).toBe("QuickFill Free · getquickfill.com");
    
    drawTextSpy.mockRestore();
  });

  it("should NOT apply watermark when isPro is true", () => {
    const drawTextSpy = jest.spyOn(pages[0], "drawText");
    
    applyBorderWatermark(pages, font, true);
    
    // Should NOT call drawText at all for Pro users
    expect(drawTextSpy).not.toHaveBeenCalled();
    
    drawTextSpy.mockRestore();
  });

  it("should apply watermark to each page individually", () => {
    const page0Spy = jest.spyOn(pages[0], "drawText");
    const page1Spy = jest.spyOn(pages[1], "drawText");
    const page2Spy = jest.spyOn(pages[2], "drawText");
    
    applyBorderWatermark(pages, font, false);
    
    // Each page should have 4 drawText calls (top, bottom, left, right)
    expect(page0Spy).toHaveBeenCalledTimes(4);
    expect(page1Spy).toHaveBeenCalledTimes(4);
    expect(page2Spy).toHaveBeenCalledTimes(4);
    
    page0Spy.mockRestore();
    page1Spy.mockRestore();
    page2Spy.mockRestore();
  });

  it("should use correct watermark text", () => {
    const drawTextSpy = jest.spyOn(pages[0], "drawText");
    
    applyBorderWatermark(pages, font, false);
    
    // All calls should use the same watermark text
    for (const call of drawTextSpy.mock.calls) {
      expect(call[0]).toBe("QuickFill Free · getquickfill.com");
    }
    
    drawTextSpy.mockRestore();
  });

  it("should apply watermarks at correct positions for top and bottom edges", () => {
    const page = pages[0];
    const { width, height } = page.getSize();
    const drawTextSpy = jest.spyOn(page, "drawText");
    
    applyBorderWatermark([page], font, false);
    
    // Check top edge call (y should be height - 14)
    const topCall = drawTextSpy.mock.calls.find(
      (call) => call[1]?.y === height - 14 && call[1]?.rotate === undefined
    );
    expect(topCall).toBeDefined();
    
    // Check bottom edge call (y should be 8)
    const bottomCall = drawTextSpy.mock.calls.find(
      (call) => call[1]?.y === 8 && call[1]?.rotate === undefined
    );
    expect(bottomCall).toBeDefined();
    
    drawTextSpy.mockRestore();
  });

  it("should apply watermarks with correct rotation for left and right edges", () => {
    const page = pages[0];
    const drawTextSpy = jest.spyOn(page, "drawText");
    
    applyBorderWatermark([page], font, false);
    
    // Check for rotated calls (90 and -90 degrees)
    const rotatedCalls = drawTextSpy.mock.calls.filter(
      (call) => call[1]?.rotate !== undefined
    );
    
    expect(rotatedCalls.length).toBe(2); // Left and right edges
    
    drawTextSpy.mockRestore();
  });
});
