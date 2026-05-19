import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { finalizePdfForDownload } from "../pdf-finalize";
import { WATERMARK_URL } from "../watermark";

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

describe("finalizePdfForDownload", () => {
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
});
