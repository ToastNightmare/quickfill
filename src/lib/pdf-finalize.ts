import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { applyBorderWatermark } from "./watermark";
import { assertValidGeneratedPdf } from "./pdf-download-response";

export function cleanupEditedDocumentArtifacts(pdfDoc: PDFDocument) {
  try {
    pdfDoc.catalog.delete(PDFName.of("Perms"));
  } catch {
    // Edited PDFs invalidate source document signatures/certification permissions.
  }
}

export async function createViewerSafePdfDocument(sourceDoc: PDFDocument) {
  cleanupEditedDocumentArtifacts(sourceDoc);

  const outputDoc = await PDFDocument.create();
  const sourcePages = sourceDoc.getPages();
  const embeddedPages = await outputDoc.embedPages(sourcePages);

  for (let index = 0; index < sourcePages.length; index++) {
    const sourcePage = sourcePages[index];
    const page = outputDoc.addPage();
    page.setSize(sourcePage.getWidth(), sourcePage.getHeight());
    page.drawPage(embeddedPages[index], {
      x: 0,
      y: 0,
      width: sourcePage.getWidth(),
      height: sourcePage.getHeight(),
    });
    page.node.delete(PDFName.of("Annots"));
  }

  return outputDoc;
}

export async function finalizePdfForDownload(sourceDoc: PDFDocument, isPro: boolean) {
  const outputDoc = await createViewerSafePdfDocument(sourceDoc);

  // Stamp free-account branding after every user edit, whiteout, and compatibility pass.
  // This keeps QuickFill's own whiteout tool from covering it and preserves link annotations.
  const watermarkFont = await outputDoc.embedFont(StandardFonts.Helvetica);
  applyBorderWatermark(outputDoc.getPages(), watermarkFont, isPro);

  const resultBytes = await outputDoc.save({ updateFieldAppearances: false, useObjectStreams: false });
  assertValidGeneratedPdf(resultBytes);
  return resultBytes;
}
