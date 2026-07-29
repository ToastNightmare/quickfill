import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  MIN_OVERLAY_FONT_SIZE,
  fitOverlayFontSize,
  fitOverlayTextPadding,
  standardOverlayTextHeightAtSize,
} from "../pdf-utils";

describe("overlay text field fitting", () => {
  const metric = (fontSize: number) => fontSize * 0.925;

  it("returns the requested size when the padded box is already tall enough", () => {
    expect(fitOverlayFontSize(24, 14, metric, 2)).toBe(14);
  });

  it("is monotonic as box height grows and never exceeds the requested size", () => {
    const fitted = [4, 6, 8, 10, 12, 16, 24].map((boxHeight) =>
      fitOverlayFontSize(boxHeight, 14, metric, 0.8),
    );

    expect(fitted).toEqual([...fitted].sort((left, right) => left - right));
    expect(fitted.every((fontSize) => fontSize <= 14)).toBe(true);
  });

  it("holds the 4pt floor when even the minimum full line height cannot fit", () => {
    expect(fitOverlayFontSize(2, 14, metric, 0.2)).toBe(
      MIN_OVERLAY_FONT_SIZE,
    );
  });

  it("keeps ten-percent padding from collapsing the inner content area", () => {
    expect(fitOverlayTextPadding(8, 8, 4)).toBe(0.8);
    expect(fitOverlayTextPadding(100, 20, 4)).toBe(2);
    expect(fitOverlayTextPadding(100, 60, 4)).toBe(4);
  });

  it.each([StandardFonts.Helvetica, StandardFonts.HelveticaOblique])(
    "matches the pdf-lib %s full-height formula used by the server",
    async (fontName) => {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(fontName);
      const padding = fitOverlayTextPadding(8, 8, 4);

      for (const requested of [8, 14, 16, 24]) {
        const clientSize = fitOverlayFontSize(
          8,
          requested,
          standardOverlayTextHeightAtSize,
          padding,
        );
        const serverSize = fitOverlayFontSize(
          8,
          requested,
          (fontSize) => font.heightAtSize(fontSize),
          padding,
        );

        expect(clientSize).toBeCloseTo(serverSize, 10);
      }
    },
  );
});
