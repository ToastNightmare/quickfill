import { PDFArray, PDFDict, PDFDocument, PDFName, rgb, type PDFObject } from "pdf-lib";
import type { EditorField } from "@/lib/types";
import { filledPdfFilename, sanitizePdfFilename } from "@/lib/pdf-download-response";
import { DOCUMENT_UPLOAD_LABEL, PDF_UPLOAD_MAX_BYTES, PDF_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";

export type DocumentSourceType = "pdf" | "image";

export type NormalizedDocumentUpload = {
  fileName: string;
  pdfBytes: ArrayBuffer;
  sourceType: DocumentSourceType;
  skipAcroFormDetection: boolean;
};

type SupportedUploadType = "pdf" | "jpeg" | "png";

const PORTRAIT_PAGE = { width: 612, height: 792 };
const LANDSCAPE_PAGE = { width: 792, height: 612 };
const IMAGE_PAGE_MARGIN = 36;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];

export class DocumentIntakeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unsupported"
      | "too_large"
      | "unreadable_image"
      | "merged_too_large"
      | "append_failed"
      | "last_page"
      | "remove_failed"
  ) {
    super(message);
    this.name = "DocumentIntakeError";
  }
}

export type AppendUploadResult = {
  pdfBytes: ArrayBuffer;
  addedPageCount: number;
  firstAddedPageIndex: number;
};

export type RemovePageResult = {
  pdfBytes: ArrayBuffer;
  newPageCount: number;
};

function fileExtension(fileName: string) {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  return match?.[0] ?? "";
}

function supportedUploadType(file: File): SupportedUploadType | null {
  const extension = fileExtension(file.name);
  if (file.type === "application/pdf" || extension === ".pdf") return "pdf";
  if (file.type === "image/jpeg" || extension === ".jpg" || extension === ".jpeg") return "jpeg";
  if (file.type === "image/png" || extension === ".png") return "png";
  return null;
}

function validateUploadFile(file: File) {
  if (file.size > PDF_UPLOAD_MAX_BYTES) {
    throw new DocumentIntakeError(
      `This file is too large. Please use a file under ${PDF_UPLOAD_MAX_LABEL}.`,
      "too_large"
    );
  }

  const uploadType = supportedUploadType(file);
  if (!uploadType) {
    throw new DocumentIntakeError(`Please upload a ${DOCUMENT_UPLOAD_LABEL}.`, "unsupported");
  }

  return uploadType;
}

function pageLayoutForImage(width: number, height: number) {
  const pageSize = width > height ? LANDSCAPE_PAGE : PORTRAIT_PAGE;
  const maxImageWidth = pageSize.width - IMAGE_PAGE_MARGIN * 2;
  const maxImageHeight = pageSize.height - IMAGE_PAGE_MARGIN * 2;
  const scale = Math.min(maxImageWidth / width, maxImageHeight / height);
  const imageWidth = width * scale;
  const imageHeight = height * scale;
  return {
    pageWidth: pageSize.width,
    pageHeight: pageSize.height,
    imageX: (pageSize.width - imageWidth) / 2,
    imageY: (pageSize.height - imageHeight) / 2,
    imageWidth,
    imageHeight,
  };
}

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function assertLoadablePdf(bytes: ArrayBuffer) {
  await PDFDocument.load(bytes, { ignoreEncryption: true });
}

async function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decode failed"));
    image.src = url;
  });
}

async function flattenPngToJpegBytes(bytes: Uint8Array) {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof Blob === "undefined") {
    return null;
  }
  if (typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
    return null;
  }
  if (typeof HTMLCanvasElement === "undefined" || typeof HTMLCanvasElement.prototype.toBlob !== "function") {
    return null;
  }

  const sourceBlob = new Blob([exactArrayBuffer(bytes)], { type: "image/png" });
  const objectUrl = URL.createObjectURL(sourceBlob);
  let image: ImageBitmap | HTMLImageElement | null = null;

  try {
    image = typeof window.createImageBitmap === "function"
      ? await window.createImageBitmap(sourceBlob)
      : await loadImageElement(objectUrl);

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("JPG conversion failed"));
        }
      }, "image/jpeg", 0.95);
    });
    return new Uint8Array(await jpegBlob.arrayBuffer());
  } catch {
    return null;
  } finally {
    if (image && "close" in image) {
      image.close();
    }
    URL.revokeObjectURL(objectUrl);
  }
}

export async function imageToPdfBytes(bytes: ArrayBuffer | Uint8Array, imageType: "jpeg" | "png"): Promise<ArrayBuffer> {
  try {
    const imageBytes = bytes instanceof Uint8Array
      ? new Uint8Array(exactArrayBuffer(bytes))
      : new Uint8Array(bytes);
    const flattenedJpegBytes = imageType === "png" ? await flattenPngToJpegBytes(imageBytes) : null;
    const embedType = flattenedJpegBytes ? "jpeg" : imageType;
    const embedBytes = flattenedJpegBytes ?? imageBytes;
    const pdfDoc = await PDFDocument.create();
    const image = embedType === "jpeg"
      ? await pdfDoc.embedJpg(embedBytes)
      : await pdfDoc.embedPng(embedBytes);
    const layout = pageLayoutForImage(image.width, image.height);
    const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

    page.drawRectangle({
      x: 0,
      y: 0,
      width: layout.pageWidth,
      height: layout.pageHeight,
      color: rgb(1, 1, 1),
    });
    page.drawImage(image, {
      x: layout.imageX,
      y: layout.imageY,
      width: layout.imageWidth,
      height: layout.imageHeight,
    });

    const pdfBytes = exactArrayBuffer(await pdfDoc.save({ useObjectStreams: false }));
    await assertLoadablePdf(pdfBytes);
    return pdfBytes;
  } catch {
    throw new DocumentIntakeError("This image could not be opened. Try a different JPG or PNG.", "unreadable_image");
  }
}

export async function normalizeDocumentUpload(file: File): Promise<NormalizedDocumentUpload> {
  const uploadType = validateUploadFile(file);
  const bytes = await file.arrayBuffer();

  if (uploadType === "pdf") {
    return {
      fileName: file.name,
      pdfBytes: bytes,
      sourceType: "pdf",
      skipAcroFormDetection: false,
    };
  }

  return {
    fileName: file.name,
    pdfBytes: await imageToPdfBytes(bytes, uploadType),
    sourceType: "image",
    skipAcroFormDetection: true,
  };
}

/**
 * Remove interactive widget annotations from a page so appended pages never
 * introduce orphan AcroForm widgets. Non-widget annotations (links, etc.) are kept.
 */
function stripWidgetAnnotations(page: ReturnType<PDFDocument["getPages"]>[number]) {
  try {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) return;

    const kept: PDFObject[] = [];
    for (let index = 0; index < annots.size(); index += 1) {
      const annotationRef = annots.get(index);
      const annotation = page.doc.context.lookupMaybe(annotationRef, PDFDict);
      const subtype = annotation?.get(PDFName.of("Subtype"));
      if (subtype === PDFName.of("Widget")) continue;
      kept.push(annotationRef);
    }

    if (kept.length === annots.size()) return;
    if (kept.length === 0) {
      page.node.delete(PDFName.of("Annots"));
      return;
    }
    page.node.set(PDFName.of("Annots"), page.doc.context.obj(kept));
  } catch {
    // Non-fatal: leave the page as-is rather than fail the append.
  }
}

/**
 * Append an uploaded PDF/JPG/PNG to an existing PDF document.
 *
 * - Images become one new page via the existing image-to-PDF path.
 * - Multi-page PDFs append all pages.
 * - Widget annotations are stripped from appended pages so the base
 *   document's AcroForm state stays intact.
 * - The merged result is rejected if it exceeds the upload size cap.
 */
export async function appendUploadToDocument(
  existingBytes: ArrayBuffer,
  file: File
): Promise<AppendUploadResult> {
  const incoming = await normalizeDocumentUpload(file);

  let mergedBytes: ArrayBuffer;
  let addedPageCount: number;
  let firstAddedPageIndex: number;

  try {
    const baseDoc = await PDFDocument.load(existingBytes, { ignoreEncryption: true });
    const sourceDoc = await PDFDocument.load(incoming.pdfBytes, { ignoreEncryption: true });

    firstAddedPageIndex = baseDoc.getPageCount();
    addedPageCount = sourceDoc.getPageCount();
    if (addedPageCount === 0) {
      throw new Error("Source document has no pages");
    }

    const copiedPages = await baseDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
    for (const copiedPage of copiedPages) {
      stripWidgetAnnotations(copiedPage);
      baseDoc.addPage(copiedPage);
    }

    mergedBytes = exactArrayBuffer(await baseDoc.save({ useObjectStreams: false }));
    await assertLoadablePdf(mergedBytes);
  } catch (error) {
    if (error instanceof DocumentIntakeError) throw error;
    throw new DocumentIntakeError(
      "This page could not be added. Try a different PDF, JPG, or PNG.",
      "append_failed"
    );
  }

  if (mergedBytes.byteLength > PDF_UPLOAD_MAX_BYTES) {
    throw new DocumentIntakeError(
      `Adding this page would make the document larger than ${PDF_UPLOAD_MAX_LABEL}. Try a smaller or compressed photo, or start a new file.`,
      "merged_too_large"
    );
  }

  return { pdfBytes: mergedBytes, addedPageCount, firstAddedPageIndex };
}

/**
 * Remove one page from an existing PDF document.
 *
 * - Refuses to remove the only page.
 * - Output is re-validated before being returned.
 */
export async function removePageFromDocument(
  existingBytes: ArrayBuffer,
  pageIndex: number
): Promise<RemovePageResult> {
  try {
    const doc = await PDFDocument.load(existingBytes, { ignoreEncryption: true });
    const pageCount = doc.getPageCount();

    if (pageCount <= 1) {
      throw new DocumentIntakeError(
        "You can't remove the only page. Start over to use a different document.",
        "last_page"
      );
    }
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
      throw new Error(`Page index ${pageIndex} out of range`);
    }

    doc.removePage(pageIndex);
    const pdfBytes = exactArrayBuffer(await doc.save({ useObjectStreams: false }));
    await assertLoadablePdf(pdfBytes);
    return { pdfBytes, newPageCount: pageCount - 1 };
  } catch (error) {
    if (error instanceof DocumentIntakeError) throw error;
    throw new DocumentIntakeError("This page could not be removed. Please try again.", "remove_failed");
  }
}

/**
 * Drop fields on the removed page and shift fields on later pages down by one.
 * Fields on earlier pages are returned unchanged.
 */
export function shiftFieldsAfterPageRemoval(fields: EditorField[], removedPageIndex: number): EditorField[] {
  return fields
    .filter((field) => field.page !== removedPageIndex)
    .map((field) => (field.page > removedPageIndex ? { ...field, page: field.page - 1 } : field));
}

export function filledDocumentFilename(originalName: string | null | undefined) {
  const baseName = (originalName ?? "").split(/[\\/]/).pop()?.trim() || "quickfill";
  const withoutKnownExtension = [...IMAGE_EXTENSIONS, ".pdf"].reduce(
    (name, extension) => name.replace(new RegExp(`${extension.replace(".", "\\.")}$`, "i"), ""),
    baseName
  );
  return filledPdfFilename(sanitizePdfFilename(`${withoutKnownExtension}.pdf`, "quickfill.pdf"));
}
