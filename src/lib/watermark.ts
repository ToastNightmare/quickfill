import { PDFPage, PDFFont, rgb, degrees } from "pdf-lib";

/**
 * Apply border watermark to all pages of a PDF for free/guest users.
 * Pro users get clean downloads with no watermark.
 * 
 * Watermark appears on all 4 edges of every page:
 * - Top edge: horizontal, centred, near top (y = page.getHeight() - 14)
 * - Bottom edge: horizontal, centred, near bottom (y = 8)
 * - Left edge: rotated 90 degrees, centred vertically, near left (x = 12)
 * - Right edge: rotated -90 degrees, centred vertically, near right (x = page.getWidth() - 12)
 */
export function applyBorderWatermark(
  pages: PDFPage[],
  font: PDFFont,
  isPro: boolean
): void {
  // Skip watermark for Pro users
  if (isPro) {
    return;
  }

  const watermarkText = "QuickFill Free · getquickfill.com";
  const fontSize = 8;
  const color = rgb(0.4, 0.4, 0.4);
  const opacity = 0.35;

  for (const page of pages) {
    const { width, height } = page.getSize();

    // Top edge: horizontal, centred, near top
    const topY = height - 14;
    page.drawText(watermarkText, {
      x: width / 2 - font.widthOfTextAtSize(watermarkText, fontSize) / 2,
      y: topY,
      size: fontSize,
      font,
      color,
      opacity,
    });

    // Bottom edge: horizontal, centred, near bottom
    const bottomY = 8;
    page.drawText(watermarkText, {
      x: width / 2 - font.widthOfTextAtSize(watermarkText, fontSize) / 2,
      y: bottomY,
      size: fontSize,
      font,
      color,
      opacity,
    });

    // Left edge: rotated 90 degrees, centred vertically, near left
    const leftX = 12;
    const leftY = height / 2 - font.widthOfTextAtSize(watermarkText, fontSize) / 2;
    page.drawText(watermarkText, {
      x: leftX,
      y: leftY,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(90),
    });

    // Right edge: rotated -90 degrees, centred vertically, near right
    const rightX = width - 12;
    const rightY = height / 2 + font.widthOfTextAtSize(watermarkText, fontSize) / 2;
    page.drawText(watermarkText, {
      x: rightX,
      y: rightY,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(-90),
    });
  }
}
