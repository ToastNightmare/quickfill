/**
 * @jest-environment node
 */

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
  StandardFonts,
} from "pdf-lib";
import {
  CONTENT_PRESERVE_ERROR_CODE,
  CONTENT_PRESERVE_ERROR_MESSAGE,
  ContentPreserveError,
  flattenVisibleContentAnnotations,
} from "../pdf-annot-flatten";

type AnnotationOptions = {
  bbox?: [number, number, number, number];
  flags?: number;
  matrix?: [number, number, number, number, number, number];
  rect?: [number, number, number, number];
  state?: string;
  subtype?: string;
};

async function addAppearanceAnnotation(
  pdfDoc: PDFDocument,
  marker: string,
  options: AnnotationOptions = {},
) {
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const appearance = pdfDoc.context.stream(
    `BT /F1 12 Tf 0 0 Td (${marker}) Tj ET`,
    {
      Type: "XObject",
      Subtype: "Form",
      BBox: options.bbox ?? [0, 0, 100, 20],
      Matrix: options.matrix,
      Resources: { Font: { F1: font.ref } },
    },
  );
  const appearanceRef = pdfDoc.context.register(appearance);
  let normalAppearance: PDFRef | PDFDict = appearanceRef;
  if (options.state) {
    normalAppearance = pdfDoc.context.obj({
      [options.state]: appearanceRef,
    });
  }

  const annotation = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: options.subtype ?? "FreeText",
    Rect: options.rect ?? [20, 30, 220, 70],
    F: options.flags,
    AP: { N: normalAppearance },
    AS: options.state,
  });
  const annotationRef = pdfDoc.context.register(annotation);
  const annotations =
    page.node.Annots() ?? PDFArray.withContext(pdfDoc.context);
  annotations.push(annotationRef);
  page.node.set(PDFName.of("Annots"), annotations);
}

async function decodedStreams(pdfDoc: PDFDocument) {
  const saved = await pdfDoc.save({ useObjectStreams: false });
  const loaded = await PDFDocument.load(saved);
  let decoded = "";
  for (const [, object] of loaded.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    try {
      decoded += Buffer.from(decodePDFRawStream(object).decode()).toString(
        "latin1",
      );
    } catch {
      decoded += Buffer.from(object.getContents()).toString("latin1");
    }
  }
  return decoded;
}

describe("flattenVisibleContentAnnotations", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("burns a normal appearance with its BBox and Matrix mapped to Rect", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([400, 300]);
    await addAppearanceAnnotation(pdfDoc, "FREETEXTMARKER", {
      bbox: [10, 20, 110, 70],
      matrix: [2, 0, 0, 3, 5, 7],
      rect: [50, 60, 250, 210],
    });

    flattenVisibleContentAnnotations(pdfDoc);

    expect(pdfDoc.getPages()[0].node.Annots()).toBeUndefined();
    const streams = await decodedStreams(pdfDoc);
    expect(streams).toContain("FREETEXTMARKER");
    expect(streams).toContain("1 0 0 1 25 -7 cm");
    expect(streams).toMatch(/\/QuickFillAnnot-\d+ Do/);
  });

  it("resolves an appearance-state dictionary through the annotation AS entry", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([300, 200]);
    await addAppearanceAnnotation(pdfDoc, "STATEAPPEARANCE", {
      state: "Selected",
      subtype: "Stamp",
    });

    flattenVisibleContentAnnotations(pdfDoc);

    await expect(decodedStreams(pdfDoc)).resolves.toContain("STATEAPPEARANCE");
  });

  it.each([
    ["Hidden", 1 << 1],
    ["NoView", 1 << 5],
  ])(
    "skips %s annotations and drops corrupt entries without logging contents",
    async (_label, flags) => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([300, 200]);
      await addAppearanceAnnotation(pdfDoc, "HIDDENMARKER", {
        flags,
      });
      const annotations = page.node.Annots()!;
      annotations.push(PDFString.of("private annotation contents"));
      const warn = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      flattenVisibleContentAnnotations(pdfDoc);

      expect(page.node.Annots()?.size()).toBe(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        "private annotation contents",
      );
      expect(warn).toHaveBeenCalledWith(
        "Dropping unparseable PDF annotation",
        {
          pageIndex: 0,
          subtype: "Unknown",
        },
      );
      const streams = await decodedStreams(pdfDoc);
      expect(streams).not.toMatch(/\/QuickFillAnnot-\d+ Do/);
    },
  );

  it.each(["Widget", "Link", "Popup", "Text"])(
    "does not burn excluded %s annotations",
    async (subtype) => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([300, 200]);
      await addAppearanceAnnotation(pdfDoc, "EXCLUDEDMARKER", { subtype });

      flattenVisibleContentAnnotations(pdfDoc);

      expect(page.node.Annots()?.size()).toBe(1);
      const streams = await decodedStreams(pdfDoc);
      expect(streams).not.toMatch(/\/QuickFillAnnot-\d+ Do/);
    },
  );

  it("fails closed when visible allowlisted content has no normal appearance", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([300, 200]);
    const annotation = pdfDoc.context.obj({
      Type: "Annot",
      Subtype: "FreeText",
      Rect: [20, 30, 220, 70],
    });
    page.node.set(
      PDFName.of("Annots"),
      pdfDoc.context.obj([pdfDoc.context.register(annotation)]),
    );
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => flattenVisibleContentAnnotations(pdfDoc)).toThrow(
      expect.objectContaining({
        code: CONTENT_PRESERVE_ERROR_CODE,
        message: CONTENT_PRESERVE_ERROR_MESSAGE,
        pageIndex: 0,
        subtype: "FreeText",
      }) as ContentPreserveError,
    );
  });
});
