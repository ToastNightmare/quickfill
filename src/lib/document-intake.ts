import { PDFDocument, rgb } from "pdf-lib";
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
    public readonly code: "unsupported" | "too_large" | "unreadable_image"
  ) {
    super(message);
    this.name = "DocumentIntakeError";
  }
}

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

export function filledDocumentFilename(originalName: string | null | undefined) {
  const baseName = (originalName ?? "").split(/[\\/]/).pop()?.trim() || "quickfill";
  const withoutKnownExtension = [...IMAGE_EXTENSIONS, ".pdf"].reduce(
    (name, extension) => name.replace(new RegExp(`${extension.replace(".", "\\.")}$`, "i"), ""),
    baseName
  );
  return filledPdfFilename(sanitizePdfFilename(`${withoutKnownExtension}.pdf`, "quickfill.pdf"));
}
