/**
 * @jest-environment node
 */

import { createHash } from "node:crypto";
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { finalizePdfForDownload } from "../pdf-finalize";
import { WATERMARK_URL } from "../watermark";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l3hT2wAAAABJRU5ErkJggg==";
const ROTATION_SAFE_DOWNLOAD_FLAG = "NEXT_PUBLIC_QUICKFILL_ROTATION_SAFE_DOWNLOAD";
const FIXED_PDF_DATE = new Date("2026-01-02T03:04:05.000Z");
const originalRotationSafeDownloadFlag =
  process.env[ROTATION_SAFE_DOWNLOAD_FLAG];

function latin1(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("latin1");
}

function annotationUri(pdfDoc: PDFDocument, annotation: PDFDict) {
  const action = pdfDoc.context.lookup(annotation.get(PDFName.of("A"))!, PDFDict);
  const uri = action.get(PDFName.of("URI"));
  expect(uri).toBeInstanceOf(PDFString);
  return (uri as PDFString).decodeText();
}

function addSourceLinkAnnotation(pdfDoc: PDFDocument) {
  const page = pdfDoc.getPages()[0];
  const annotation = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [0, 0, 10, 10],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of("https://example.com/source-link"),
    },
  });
  page.node.set(PDFName.of("Annots"), pdfDoc.context.obj([annotation]));
}

async function createDeterministicSource(rotation = 90) {
  const sourceDoc = await PDFDocument.create();
  sourceDoc.setCreationDate(FIXED_PDF_DATE);
  sourceDoc.setModificationDate(FIXED_PDF_DATE);
  sourceDoc.setCreator("QuickFill rotation regression");
  sourceDoc.setProducer("QuickFill rotation regression");

  const page = sourceDoc.addPage([320, 180]);
  page.setRotation(degrees(rotation));
  page.drawRectangle({ x: 17, y: 23, width: 71, height: 39 });
  return sourceDoc;
}

async function finalizedPageRotation(rotation: number) {
  const sourceDoc = await createDeterministicSource(rotation);
  const resultBytes = await finalizePdfForDownload(sourceDoc, true);
  const resultDoc = await PDFDocument.load(resultBytes);
  const page = resultDoc.getPages()[0];

  return {
    angle: page.getRotation().angle,
    height: page.getHeight(),
    width: page.getWidth(),
  };
}

describe("finalizePdfForDownload", () => {
  afterEach(() => {
    jest.useRealTimers();
    if (originalRotationSafeDownloadFlag === undefined) {
      delete process.env[ROTATION_SAFE_DOWNLOAD_FLAG];
    } else {
      process.env[ROTATION_SAFE_DOWNLOAD_FLAG] =
        originalRotationSafeDownloadFlag;
    }
  });

  it("preserves embedded image signatures in the viewer-safe PDF copy", async () => {
    const sourceDoc = await PDFDocument.create();
    const page = sourceDoc.addPage([200, 200]);
    const signatureImage = await sourceDoc.embedPng(Buffer.from(ONE_PIXEL_PNG, "base64"));

    page.drawImage(signatureImage, {
      x: 24,
      y: 48,
      width: 96,
      height: 32,
    });

    const resultBytes = await finalizePdfForDownload(sourceDoc, true);

    expect(latin1(resultBytes)).toContain("/Subtype /Image");
  });

  it("adds clickable free watermarks after the viewer-safe PDF copy", async () => {
    const sourceDoc = await PDFDocument.create();
    sourceDoc.addPage([595, 842]);
    addSourceLinkAnnotation(sourceDoc);

    const resultBytes = await finalizePdfForDownload(sourceDoc, false);
    const resultDoc = await PDFDocument.load(resultBytes);
    const page = resultDoc.getPages()[0];
    const annotations = page.node.Annots();

    expect(annotations).toBeDefined();
    expect(annotations).toBeInstanceOf(PDFArray);
    expect(annotations!.size()).toBe(2);

    for (const annotationRef of annotations!.asArray()) {
      const annotation = resultDoc.context.lookup(annotationRef, PDFDict);
      expect(annotationUri(resultDoc, annotation)).toBe(WATERMARK_URL);
    }
  });

  it("does not add watermark annotations for Pro downloads", async () => {
    const sourceDoc = await PDFDocument.create();
    sourceDoc.addPage([595, 842]);

    const resultBytes = await finalizePdfForDownload(sourceDoc, true);
    const resultDoc = await PDFDocument.load(resultBytes);

    expect(resultDoc.getPages()[0].node.Annots()).toBeUndefined();
  });

  it("keeps default-off output byte-identical to the master baseline", async () => {
    jest.useFakeTimers({ now: FIXED_PDF_DATE });
    delete process.env[ROTATION_SAFE_DOWNLOAD_FLAG];

    const sourceDoc = await createDeterministicSource(90);
    const resultBytes = await finalizePdfForDownload(sourceDoc, true);
    const resultHash = createHash("sha256").update(resultBytes).digest("hex");

    expect(resultHash).toBe(
      "0dd5f2159094936b0a98620bea1b4f5fe78ca970cdabd08fe3decb1cf032fc25",
    );
  });

  it("enables rotation preservation only for the exact local-v1 flag", async () => {
    for (const disabledValue of [undefined, "true", "local-v1 ", "LOCAL-V1"]) {
      if (disabledValue === undefined) {
        delete process.env[ROTATION_SAFE_DOWNLOAD_FLAG];
      } else {
        process.env[ROTATION_SAFE_DOWNLOAD_FLAG] = disabledValue;
      }
      await expect(finalizedPageRotation(90)).resolves.toMatchObject({ angle: 0 });
    }

    process.env[ROTATION_SAFE_DOWNLOAD_FLAG] = "local-v1";
    await expect(finalizedPageRotation(90)).resolves.toMatchObject({ angle: 90 });
  });

  it.each([0, 90, 180, 270])(
    "preserves raw MediaBox dimensions while carrying page rotation %i°",
    async (rotation) => {
      process.env[ROTATION_SAFE_DOWNLOAD_FLAG] = "local-v1";

      await expect(finalizedPageRotation(rotation)).resolves.toEqual({
        angle: rotation,
        height: 180,
        width: 320,
      });
    },
  );
});
