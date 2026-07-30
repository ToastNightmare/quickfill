import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  MIN_OVERLAY_FONT_SIZE,
  fitMultilineOverlayText,
  sanitizeMultiline,
  wrapOverlayTextLines,
} from "../pdf-utils";

describe("multiline overlay text layout", () => {
  it("honours explicit line breaks before applying width wrapping", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    expect(
      wrapOverlayTextLines(
        "First explicit line\nSecond explicit line",
        500,
        font,
        12,
      ),
    ).toEqual(["First explicit line", "Second explicit line"]);
  });

  it("greedily wraps words at the available width", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;
    const firstLineWidth = font.widthOfTextAtSize("Alpha beta", fontSize);

    expect(
      wrapOverlayTextLines(
        "Alpha beta gamma",
        firstLineWidth + 0.01,
        font,
        fontSize,
      ),
    ).toEqual(["Alpha beta", "gamma"]);
  });

  it("shrinks until every wrapped line fits the padded box height", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const layout = fitMultilineOverlayText(
      "Alpha beta gamma delta epsilon zeta",
      72,
      24,
      font,
      12,
      2,
    );

    expect(layout.fontSize).toBeLessThan(12);
    expect(layout.fontSize).toBeGreaterThanOrEqual(MIN_OVERLAY_FONT_SIZE);
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(20);
  });

  it("keeps the existing 4pt floor when the content cannot fit", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const layout = fitMultilineOverlayText(
      "One\nTwo\nThree",
      100,
      2,
      font,
      12,
    );

    expect(layout.fontSize).toBe(MIN_OVERLAY_FONT_SIZE);
  });

  it("keeps long-token fitting linear across the font-size search", () => {
    const token = "W".repeat(2_000);
    let measuredCharacters = 0;
    const font = {
      widthOfTextAtSize: (text: string, fontSize: number) => {
        measuredCharacters += Array.from(text).length;
        return Array.from(text).length * fontSize * 0.5;
      },
      heightAtSize: standardHeight,
    };

    const layout = fitMultilineOverlayText(
      token,
      400,
      100,
      font,
      12,
    );

    expect(layout.fontSize).toBeGreaterThan(MIN_OVERLAY_FONT_SIZE);
    expect(layout.fontSize).toBeLessThan(12);
    expect(measuredCharacters).toBeLessThan(token.length * 40);
  });

  it("keeps newlines while replacing every other control character", () => {
    expect(sanitizeMultiline("First\r\nSecond\tvalue\u0000")).toBe(
      "First\nSecond value ",
    );
  });
});

function standardHeight(fontSize: number) {
  return fontSize * 0.925;
}
