import {
  concatTransformationMatrix,
  PDFName,
  PDFPage,
  PDFFont,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";

/**
 * Apply a light, clickable border watermark for free/guest downloads.
 * Pro users get clean downloads with no watermark.
 */
export const WATERMARK_TEXT = "QuickFill Free · getquickfill.com";
export const WATERMARK_URL = "https://getquickfill.com/pricing?source=pdf_watermark";

type PageRotation = 0 | 90 | 180 | 270;
type PageTransform = [number, number, number, number, number, number];

function normalizedPageRotation(page: PDFPage): PageRotation {
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  return rotation === 90 || rotation === 180 || rotation === 270
    ? rotation
    : 0;
}

function rotationTransform(
  page: PDFPage,
  rotation: PageRotation,
): PageTransform | null {
  const { width, height } = page.getSize();
  if (rotation === 90) return [0, 1, -1, 0, width, 0];
  if (rotation === 180) return [-1, 0, 0, -1, width, height];
  if (rotation === 270) return [0, -1, 1, 0, 0, height];
  return null;
}

function displayPageSize(page: PDFPage, rotation: PageRotation) {
  const { width, height } = page.getSize();
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

function transformedLinkRect(
  page: PDFPage,
  rotation: PageRotation,
  rect: [number, number, number, number],
) {
  const transform = rotationTransform(page, rotation);
  if (!transform) return rect;

  const [a, b, c, d, e, f] = transform;
  const [left, bottom, right, top] = rect;
  const transformPoint = (x: number, y: number): [number, number] => [
    a * x + c * y + e,
    b * x + d * y + f,
  ];
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

function addWatermarkLink(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  rotation: PageRotation,
) {
  try {
    const context = page.doc.context;
    const rect = transformedLinkRect(
      page,
      rotation,
      [x - 2, y - 2, x + width + 2, y + fontSize + 3],
    );
    const annotation = context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rect,
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

function drawLinkedWatermark(
  page: PDFPage,
  font: PDFFont,
  pageWidth: number,
  y: number,
  fontSize: number,
  opacity: number,
  rotation: PageRotation,
) {
  const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, fontSize);
  const x = pageWidth / 2 - textWidth / 2;

  page.drawText(WATERMARK_TEXT, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(0.4, 0.4, 0.4),
    opacity,
  });

  addWatermarkLink(page, x, y, textWidth, fontSize, rotation);
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
  const rotationSafeDownload =
    process.env.NEXT_PUBLIC_QUICKFILL_ROTATION_SAFE_DOWNLOAD === "local-v1";

  for (const page of pages) {
    const rotation = rotationSafeDownload
      ? normalizedPageRotation(page)
      : 0;
    const { width, height } = displayPageSize(page, rotation);
    const transform = rotationTransform(page, rotation);

    if (transform) {
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(...transform),
      );
    }

    try {
      drawLinkedWatermark(
        page,
        font,
        width,
        height - 14,
        fontSize,
        opacity,
        rotation,
      );
      drawLinkedWatermark(
        page,
        font,
        width,
        8,
        fontSize,
        opacity,
        rotation,
      );
    } finally {
      if (transform) {
        page.pushOperators(popGraphicsState());
      }
    }
  }
}
