import { PDFDocument } from "pdf-lib";
import { TextDecoder, TextEncoder } from "util";
import { deflateSync } from "zlib";
import {
  DocumentIntakeError,
  filledDocumentFilename,
  imageToPdfBytes,
  normalizeDocumentUpload,
} from "@/lib/document-intake";
import { PDF_UPLOAD_MAX_BYTES } from "@/lib/upload-limits";

global.TextDecoder = TextDecoder as typeof global.TextDecoder;
global.TextEncoder = TextEncoder as typeof global.TextEncoder;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createPngFixture(width = 32, height = 32) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) {
      rows.push(24, 110 + ((x + y) % 80), 180);
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.from(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const ONE_PIXEL_PNG = createPngFixture();

const ONE_PIXEL_JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QP//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QP//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QP//Z",
  "base64"
);

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function blobPartToBytes(part: BlobPart) {
  if (typeof part === "string") return new TextEncoder().encode(part);
  if (part instanceof ArrayBuffer) return new Uint8Array(part);
  if (ArrayBuffer.isView(part)) {
    return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
  }
  return new Uint8Array();
}

function file(name: string, type: string, bytes: BlobPart[]) {
  const sourceBytes = bytes.flatMap((part) => Array.from(blobPartToBytes(part)));
  const nextFile = new File(bytes, name, { type });
  Object.defineProperty(nextFile, "arrayBuffer", {
    value: async () => exactArrayBuffer(new Uint8Array(sourceBytes)),
  });
  return nextFile;
}

describe("document intake", () => {
  it("accepts PDFs without changing bytes", async () => {
    const source = new TextEncoder().encode("%PDF-1.7\n%%EOF");

    const upload = await normalizeDocumentUpload(file("form.pdf", "application/pdf", [source]));

    expect(upload.fileName).toBe("form.pdf");
    expect(upload.sourceType).toBe("pdf");
    expect(upload.skipAcroFormDetection).toBe(false);
    expect(new Uint8Array(upload.pdfBytes)).toEqual(source);
  });

  it("accepts JPG, JPEG, and PNG uploads", async () => {
    await expect(normalizeDocumentUpload(file("photo.jpg", "image/jpeg", [ONE_PIXEL_JPG]))).resolves.toMatchObject({
      sourceType: "image",
      skipAcroFormDetection: true,
    });
    await expect(normalizeDocumentUpload(file("photo.jpeg", "image/jpeg", [ONE_PIXEL_JPG]))).resolves.toMatchObject({
      sourceType: "image",
      skipAcroFormDetection: true,
    });
    await expect(normalizeDocumentUpload(file("scan.png", "image/png", [ONE_PIXEL_PNG]))).resolves.toMatchObject({
      sourceType: "image",
      skipAcroFormDetection: true,
    });
  });

  it("rejects unsupported file types", async () => {
    await expect(normalizeDocumentUpload(file("notes.txt", "text/plain", ["hello"]))).rejects.toThrow(DocumentIntakeError);
    await expect(normalizeDocumentUpload(file("photo.heic", "image/heic", ["heic"]))).rejects.toThrow(DocumentIntakeError);
    await expect(normalizeDocumentUpload(file("doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ["doc"]))).rejects.toThrow(DocumentIntakeError);
  });

  it("rejects oversized files", async () => {
    const oversized = file("large.pdf", "application/pdf", [new Uint8Array(PDF_UPLOAD_MAX_BYTES + 1)]);

    await expect(normalizeDocumentUpload(oversized)).rejects.toThrow("under 15MB");
  });

  it("converts JPG and PNG to loadable one-page PDFs", async () => {
    const jpgPdf = await PDFDocument.load(await imageToPdfBytes(exactArrayBuffer(ONE_PIXEL_JPG), "jpeg"));
    const pngPdf = await PDFDocument.load(await imageToPdfBytes(exactArrayBuffer(ONE_PIXEL_PNG), "png"));

    expect(jpgPdf.getPageCount()).toBe(1);
    expect(pngPdf.getPageCount()).toBe(1);
  });

  it("returns exact PDF bytes from converted image byte slices", async () => {
    const paddedPng = new Uint8Array(ONE_PIXEL_PNG.byteLength + 8);
    paddedPng.set(ONE_PIXEL_PNG, 4);
    const pngSlice = paddedPng.subarray(4, 4 + ONE_PIXEL_PNG.byteLength);

    const pngPdfBytes = await imageToPdfBytes(pngSlice, "png");

    expect(pngPdfBytes.byteLength).toBe(new Uint8Array(pngPdfBytes).byteLength);
    expect(new TextDecoder().decode(new Uint8Array(pngPdfBytes, 0, 8))).toBe("%PDF-1.7");
    await expect(PDFDocument.load(pngPdfBytes)).resolves.toHaveProperty("getPageCount");
  });

  it("embeds JPG byte views without leaking their backing buffer", async () => {
    const paddedJpg = new Uint8Array(ONE_PIXEL_JPG.byteLength + 12);
    paddedJpg.set(ONE_PIXEL_JPG, 6);
    const jpgSlice = paddedJpg.subarray(6, 6 + ONE_PIXEL_JPG.byteLength);

    const pdfBytes = await imageToPdfBytes(jpgSlice, "jpeg");
    const pdf = await PDFDocument.load(pdfBytes);

    expect(new TextDecoder().decode(new Uint8Array(pdfBytes, 0, 8))).toBe("%PDF-1.7");
    expect(pdf.getPageCount()).toBe(1);
  });

  it("creates reasonable page dimensions for converted images", async () => {
    const pdf = await PDFDocument.load(await imageToPdfBytes(exactArrayBuffer(ONE_PIXEL_PNG), "png"));
    const page = pdf.getPage(0);

    expect(page.getWidth()).toBeGreaterThan(0);
    expect(page.getHeight()).toBeGreaterThan(0);
    expect(page.getWidth()).toBeLessThanOrEqual(1200);
    expect(page.getHeight()).toBeLessThanOrEqual(1200);
  });

  it("creates clean filled PDF filenames", () => {
    expect(filledDocumentFilename("form.pdf")).toBe("form-filled.pdf");
    expect(filledDocumentFilename("photo.jpg")).toBe("photo-filled.pdf");
    expect(filledDocumentFilename("scan.jpeg")).toBe("scan-filled.pdf");
    expect(filledDocumentFilename("receipt.png")).toBe("receipt-filled.pdf");
  });
});
