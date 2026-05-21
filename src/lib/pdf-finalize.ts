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

async function stampAndSavePdf(pdfDoc: PDFDocument, isPro: boolean) {
  const watermarkFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  applyBorderWatermark(pdfDoc.getPages(), watermarkFont, isPro);

  const resultBytes = await pdfDoc.save({ updateFieldAppearances: false, useObjectStreams: false });
  assertValidGeneratedPdf(resultBytes);
  return resultBytes;
}

export async function finalizePdfForDownload(sourceDoc: PDFDocument, isPro: boolean) {
  try {
    const outputDoc = await createViewerSafePdfDocument(sourceDoc);

    // Stamp free-account branding after every user edit, whiteout, and compatibility pass.
    // This keeps QuickFill's own whiteout tool from covering it and preserves link annotations.
    return await stampAndSavePdf(outputDoc, isPro);
  } catch (error) {
    console.warn(
      "viewer-safe PDF finalization failed, saving edited document directly:",
      error instanceof Error ? error.message : error,
    );
    cleanupEditedDocumentArtifacts(sourceDoc);
    return await stampAndSavePdf(sourceDoc, isPro);
  }
}
