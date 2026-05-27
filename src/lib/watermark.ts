import { PDFName, PDFPage, PDFFont, PDFString, rgb } from "pdf-lib";

/**
 * Apply a light, clickable border watermark for free/guest downloads.
 * Pro users get clean downloads with no watermark.
 */
export const WATERMARK_TEXT = "QuickFill Free · getquickfill.com";
export const WATERMARK_URL = "https://getquickfill.com/pricing?source=pdf_watermark";

function addWatermarkLink(page: PDFPage, x: number, y: number, width: number, fontSize: number) {
  try {
    const context = page.doc.context;
    const annotation = context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x - 2, y - 2, x + width + 2, y + fontSize + 3],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of(WATERMARK_URL),
      },
    });

    const annotationRef = context.register(annotation);
    const annots = page.node.Annots();

    if (annots) {
      annots.push(annotationRef);
    } else {
      page.node.set(PDFName.of("Annots"), context.obj([annotationRef]));
    }
  } catch {
    // Some source PDFs carry malformed annotation state. The visible watermark
    // is still drawn; the link is best-effort so export cannot be blocked.
  }
}

function drawLinkedWatermark(page: PDFPage, font: PDFFont, y: number, fontSize: number, opacity: number) {
  const { width } = page.getSize();
  const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, fontSize);
  const x = width / 2 - textWidth / 2;

  page.drawText(WATERMARK_TEXT, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(0.4, 0.4, 0.4),
    opacity,
  });

  addWatermarkLink(page, x, y, textWidth, fontSize);
}

export function applyBorderWatermark(
  pages: PDFPage[],
  font: PDFFont,
  isPro: boolean
): void {
  if (isPro) {
    return;
  }

  const fontSize = 8;
  const opacity = 0.28;

  for (const page of pages) {
    const { height } = page.getSize();

    drawLinkedWatermark(page, font, height - 14, fontSize, opacity);
    drawLinkedWatermark(page, font, 8, fontSize, opacity);
  }
}
