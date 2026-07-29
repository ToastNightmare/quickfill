import {
  concatTransformationMatrix,
  drawObject,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  popGraphicsState,
  pushGraphicsState,
} from "pdf-lib";

export const CONTENT_PRESERVE_ERROR_CODE = "content_preserve_failed";
export const CONTENT_PRESERVE_ERROR_MESSAGE =
  "We couldn't safely preserve all existing PDF content. Please save the PDF again in your PDF app, then try uploading it to QuickFill.";

const HIDDEN_ANNOTATION_FLAG = 1 << 1;
const NO_VIEW_ANNOTATION_FLAG = 1 << 5;
const VISIBLE_CONTENT_SUBTYPES = new Set([
  "FreeText",
  "Stamp",
  "Ink",
  "Square",
  "Circle",
  "Line",
  "Polygon",
  "PolyLine",
  "Highlight",
  "Underline",
  "Squiggly",
  "StrikeOut",
]);

type AppearanceFailure = {
  pageIndex: number;
  subtype: string;
};

export class ContentPreserveError extends Error {
  readonly code = CONTENT_PRESERVE_ERROR_CODE;
  readonly pageIndex: number;
  readonly subtype: string;

  constructor({ pageIndex, subtype }: AppearanceFailure) {
    super(CONTENT_PRESERVE_ERROR_MESSAGE);
    this.name = "ContentPreserveError";
    this.pageIndex = pageIndex;
    this.subtype = subtype;
  }
}

export function isContentPreserveError(
  error: unknown,
): error is ContentPreserveError {
  return error instanceof ContentPreserveError;
}

function logUnparseableAnnotation(pageIndex: number, subtype: string) {
  console.warn("Dropping unparseable PDF annotation", {
    pageIndex,
    subtype,
  });
}

function failContentPreservation(pageIndex: number, subtype: string): never {
  console.warn("PDF annotation content preservation failed", {
    pageIndex,
    subtype,
  });
  throw new ContentPreserveError({ pageIndex, subtype });
}

function arrayNumbers(array: PDFArray, expectedSize: number) {
  if (array.size() !== expectedSize) {
    throw new Error("Unexpected PDF array size");
  }

  const values: number[] = [];
  for (let index = 0; index < expectedSize; index++) {
    const value = array.lookup(index, PDFNumber).asNumber();
    if (!Number.isFinite(value)) throw new Error("Non-finite PDF number");
    values.push(value);
  }
  return values;
}

function appearanceStreamRef(
  pdfDoc: PDFDocument,
  annotation: PDFDict,
): { ref: PDFRef; stream: PDFStream } {
  const appearanceDictionary = annotation.lookup(
    PDFName.of("AP"),
    PDFDict,
  );
  const normalEntry = appearanceDictionary.get(PDFName.of("N"));
  if (!normalEntry) throw new Error("Missing normal appearance");

  const normalAppearance = pdfDoc.context.lookup(normalEntry);
  let streamEntry = normalEntry;
  let stream: PDFStream;

  if (normalAppearance instanceof PDFStream) {
    stream = normalAppearance;
  } else if (normalAppearance instanceof PDFDict) {
    const appearanceState = annotation.lookup(PDFName.of("AS"), PDFName);
    const selectedEntry = normalAppearance.get(appearanceState);
    if (!selectedEntry) throw new Error("Missing selected appearance state");
    streamEntry = selectedEntry;
    stream = pdfDoc.context.lookup(selectedEntry, PDFStream);
  } else {
    throw new Error("Invalid normal appearance");
  }

  const ref =
    streamEntry instanceof PDFRef
      ? streamEntry
      : pdfDoc.context.getObjectRef(stream) ?? pdfDoc.context.register(stream);
  return { ref, stream };
}

function transformedBoundingBox(
  bbox: number[],
  matrix: number[],
): { minX: number; minY: number; width: number; height: number } {
  const [left, bottom, right, top] = bbox;
  const [a, b, c, d, e, f] = matrix;
  const points = [
    [left, bottom],
    [left, top],
    [right, bottom],
    [right, top],
  ].map(([x, y]) => ({
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  }));

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) throw new Error("Empty appearance bounds");

  return { minX, minY, width, height };
}

function burnAnnotationAppearance(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument["getPages"]>[number],
  annotation: PDFDict,
) {
  const rectValues = arrayNumbers(
    annotation.lookup(PDFName.of("Rect"), PDFArray),
    4,
  );
  const rectLeft = Math.min(rectValues[0], rectValues[2]);
  const rectBottom = Math.min(rectValues[1], rectValues[3]);
  const rectWidth = Math.abs(rectValues[2] - rectValues[0]);
  const rectHeight = Math.abs(rectValues[3] - rectValues[1]);
  if (rectWidth <= 0 || rectHeight <= 0) {
    throw new Error("Empty annotation rectangle");
  }

  const { ref, stream } = appearanceStreamRef(pdfDoc, annotation);
  const bbox = arrayNumbers(
    stream.dict.lookup(PDFName.of("BBox"), PDFArray),
    4,
  );
  const matrixArray = stream.dict.lookupMaybe(
    PDFName.of("Matrix"),
    PDFArray,
  );
  const matrix = matrixArray
    ? arrayNumbers(matrixArray, 6)
    : [1, 0, 0, 1, 0, 0];
  const transformed = transformedBoundingBox(bbox, matrix);
  const scaleX = rectWidth / transformed.width;
  const scaleY = rectHeight / transformed.height;
  const translateX = rectLeft - transformed.minX * scaleX;
  const translateY = rectBottom - transformed.minY * scaleY;
  const xObjectKey = page.node.newXObject("QuickFillAnnot", ref);

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      scaleX,
      0,
      0,
      scaleY,
      translateX,
      translateY,
    ),
    drawObject(xObjectKey),
    popGraphicsState(),
  );
}

export function flattenVisibleContentAnnotations(pdfDoc: PDFDocument) {
  for (const [pageIndex, page] of pdfDoc.getPages().entries()) {
    let annotations: PDFArray | undefined;
    try {
      annotations = page.node.Annots();
    } catch {
      logUnparseableAnnotation(pageIndex, "Unknown");
      page.node.delete(PDFName.of("Annots"));
      continue;
    }
    if (!annotations) continue;

    const keptAnnotations = PDFArray.withContext(pdfDoc.context);
    for (let index = 0; index < annotations.size(); index++) {
      const annotationEntry = annotations.get(index);
      let annotation: PDFDict;
      let subtype = "Unknown";

      try {
        annotation = pdfDoc.context.lookup(annotationEntry, PDFDict);
        subtype = annotation
          .lookup(PDFName.of("Subtype"), PDFName)
          .decodeText();
      } catch {
        logUnparseableAnnotation(pageIndex, subtype);
        continue;
      }

      let flags = 0;
      try {
        flags =
          annotation
            .lookupMaybe(PDFName.of("F"), PDFNumber)
            ?.asNumber() ?? 0;
        if (!Number.isInteger(flags) || flags < 0) {
          throw new Error("Invalid annotation flags");
        }
      } catch {
        logUnparseableAnnotation(pageIndex, subtype);
        continue;
      }

      const hidden =
        (flags & (HIDDEN_ANNOTATION_FLAG | NO_VIEW_ANNOTATION_FLAG)) !== 0;
      if (hidden || !VISIBLE_CONTENT_SUBTYPES.has(subtype)) {
        keptAnnotations.push(annotationEntry);
        continue;
      }

      try {
        burnAnnotationAppearance(pdfDoc, page, annotation);
      } catch {
        failContentPreservation(pageIndex, subtype);
      }
    }

    if (keptAnnotations.size() > 0) {
      page.node.set(PDFName.of("Annots"), keptAnnotations);
    } else {
      page.node.delete(PDFName.of("Annots"));
    }
  }
}
