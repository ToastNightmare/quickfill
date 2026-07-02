import { PDFDocument } from "pdf-lib";
import { TextDecoder, TextEncoder } from "util";
import { deflateSync } from "zlib";
import {
  appendUploadToDocument,
  DocumentIntakeError,
  filledDocumentFilename,
  imageToPdfBytes,
  normalizeDocumentUpload,
  removePageFromDocument,
  shiftFieldsAfterPageRemoval,
} from "@/lib/document-intake";
import type { EditorField } from "@/lib/types";
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

async function createPdfBytes(pageCount: number, size: [number, number] = [612, 792]) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    doc.addPage(size);
  }
  return exactArrayBuffer(await doc.save({ useObjectStreams: false })) as ArrayBuffer;
}

describe("appendUploadToDocument", () => {
  it("appends a one-page PDF and reports the first added page index", async () => {
    const existing = await createPdfBytes(2);
    const incoming = new Uint8Array(await createPdfBytes(1, [500, 700]));

    const result = await appendUploadToDocument(existing, file("extra.pdf", "application/pdf", [incoming]));

    expect(result.addedPageCount).toBe(1);
    expect(result.firstAddedPageIndex).toBe(2);
    const merged = await PDFDocument.load(result.pdfBytes);
    expect(merged.getPageCount()).toBe(3);
  });

  it("appends all pages from a multi-page PDF", async () => {
    const existing = await createPdfBytes(1);
    const incoming = new Uint8Array(await createPdfBytes(3));

    const result = await appendUploadToDocument(existing, file("multi.pdf", "application/pdf", [incoming]));

    expect(result.addedPageCount).toBe(3);
    expect(result.firstAddedPageIndex).toBe(1);
    const merged = await PDFDocument.load(result.pdfBytes);
    expect(merged.getPageCount()).toBe(4);
  });

  it("appends JPG and PNG uploads as one new page each", async () => {
    const existing = await createPdfBytes(1);

    const jpgResult = await appendUploadToDocument(existing, file("photo.jpg", "image/jpeg", [ONE_PIXEL_JPG]));
    expect(jpgResult.addedPageCount).toBe(1);
    expect(jpgResult.firstAddedPageIndex).toBe(1);
    expect((await PDFDocument.load(jpgResult.pdfBytes)).getPageCount()).toBe(2);

    const pngResult = await appendUploadToDocument(jpgResult.pdfBytes, file("scan.png", "image/png", [ONE_PIXEL_PNG]));
    expect(pngResult.addedPageCount).toBe(1);
    expect(pngResult.firstAddedPageIndex).toBe(2);
    expect((await PDFDocument.load(pngResult.pdfBytes)).getPageCount()).toBe(3);
  });

  it("keeps existing page order and dimensions stable", async () => {
    const existingDoc = await PDFDocument.create();
    existingDoc.addPage([612, 792]);
    existingDoc.addPage([792, 612]);
    const existing = exactArrayBuffer(await existingDoc.save({ useObjectStreams: false })) as ArrayBuffer;
    const incoming = new Uint8Array(await createPdfBytes(1, [400, 400]));

    const result = await appendUploadToDocument(existing, file("extra.pdf", "application/pdf", [incoming]));
    const merged = await PDFDocument.load(result.pdfBytes);

    expect(merged.getPage(0).getWidth()).toBe(612);
    expect(merged.getPage(0).getHeight()).toBe(792);
    expect(merged.getPage(1).getWidth()).toBe(792);
    expect(merged.getPage(1).getHeight()).toBe(612);
    expect(merged.getPage(2).getWidth()).toBe(400);
    expect(merged.getPage(2).getHeight()).toBe(400);
  });

  it("strips widget annotations from appended pages", async () => {
    const sourceDoc = await PDFDocument.create();
    const sourcePage = sourceDoc.addPage([612, 792]);
    const form = sourceDoc.getForm();
    const textField = form.createTextField("applicant.name");
    textField.addToPage(sourcePage, { x: 50, y: 700, width: 200, height: 24 });
    const incoming = new Uint8Array(await sourceDoc.save({ useObjectStreams: false }));

    const existing = await createPdfBytes(1);
    const result = await appendUploadToDocument(existing, file("form.pdf", "application/pdf", [incoming]));

    const merged = await PDFDocument.load(result.pdfBytes);
    expect(merged.getPageCount()).toBe(2);
    expect(merged.getForm().getFields()).toHaveLength(0);
    const appendedAnnots = merged.getPage(1).node.Annots?.();
    expect(appendedAnnots?.size() ?? 0).toBe(0);
  });

  it("rejects a merged document larger than the size cap", async () => {
    const bigDoc = await PDFDocument.create();
    bigDoc.addPage([612, 792]);
    // Incompressible noise so the attachment stream stays near its raw size.
    const noise = new Uint8Array(PDF_UPLOAD_MAX_BYTES);
    let seed = 0x9e3779b9;
    for (let index = 0; index < noise.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      noise[index] = (seed >>> 16) & 0xff;
    }
    await bigDoc.attach(noise, "noise.bin", { mimeType: "application/octet-stream" });
    const existing = exactArrayBuffer(await bigDoc.save({ useObjectStreams: false })) as ArrayBuffer;
    const incoming = new Uint8Array(await createPdfBytes(1));

    await expect(
      appendUploadToDocument(existing, file("extra.pdf", "application/pdf", [incoming]))
    ).rejects.toMatchObject({ code: "merged_too_large" });
  });

  it("rejects unsupported and oversized uploads before merging", async () => {
    const existing = await createPdfBytes(1);

    await expect(
      appendUploadToDocument(existing, file("notes.txt", "text/plain", ["hello"]))
    ).rejects.toMatchObject({ code: "unsupported" });

    await expect(
      appendUploadToDocument(existing, file("big.pdf", "application/pdf", [new Uint8Array(PDF_UPLOAD_MAX_BYTES + 1)]))
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("rejects an unreadable incoming PDF with a friendly error", async () => {
    const existing = await createPdfBytes(1);

    await expect(
      appendUploadToDocument(existing, file("broken.pdf", "application/pdf", ["not a pdf at all"]))
    ).rejects.toMatchObject({ code: "append_failed" });
  });
});

describe("removePageFromDocument", () => {
  async function createSizedPdfBytes(sizes: [number, number][]) {
    const doc = await PDFDocument.create();
    for (const size of sizes) {
      doc.addPage(size);
    }
    return exactArrayBuffer(await doc.save({ useObjectStreams: false })) as ArrayBuffer;
  }

  it("removes the first page", async () => {
    const existing = await createSizedPdfBytes([[100, 100], [200, 200], [300, 300]]);

    const result = await removePageFromDocument(existing, 0);

    expect(result.newPageCount).toBe(2);
    const doc = await PDFDocument.load(result.pdfBytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getWidth()).toBe(200);
    expect(doc.getPage(1).getWidth()).toBe(300);
  });

  it("removes a middle page", async () => {
    const existing = await createSizedPdfBytes([[100, 100], [200, 200], [300, 300]]);

    const result = await removePageFromDocument(existing, 1);

    expect(result.newPageCount).toBe(2);
    const doc = await PDFDocument.load(result.pdfBytes);
    expect(doc.getPage(0).getWidth()).toBe(100);
    expect(doc.getPage(1).getWidth()).toBe(300);
  });

  it("removes the last page", async () => {
    const existing = await createSizedPdfBytes([[100, 100], [200, 200], [300, 300]]);

    const result = await removePageFromDocument(existing, 2);

    expect(result.newPageCount).toBe(2);
    const doc = await PDFDocument.load(result.pdfBytes);
    expect(doc.getPage(0).getWidth()).toBe(100);
    expect(doc.getPage(1).getWidth()).toBe(200);
  });

  it("refuses to remove the only page", async () => {
    const existing = await createSizedPdfBytes([[100, 100]]);

    await expect(removePageFromDocument(existing, 0)).rejects.toMatchObject({ code: "last_page" });
  });

  it("rejects out-of-range page indexes", async () => {
    const existing = await createSizedPdfBytes([[100, 100], [200, 200]]);

    await expect(removePageFromDocument(existing, 5)).rejects.toMatchObject({ code: "remove_failed" });
    await expect(removePageFromDocument(existing, -1)).rejects.toMatchObject({ code: "remove_failed" });
  });

  it("rejects unreadable input", async () => {
    const broken = new TextEncoder().encode("not a pdf").buffer as ArrayBuffer;

    await expect(removePageFromDocument(broken, 0)).rejects.toMatchObject({ code: "remove_failed" });
  });
});

describe("shiftFieldsAfterPageRemoval", () => {
  const makeField = (id: string, page: number): EditorField => ({
    id,
    type: "text",
    x: 10,
    y: 20,
    width: 100,
    height: 24,
    page,
    value: "",
    fontSize: 12,
  });

  it("drops fields on the removed page and shifts later pages down", () => {
    const fields = [makeField("a", 0), makeField("b", 1), makeField("c", 1), makeField("d", 2), makeField("e", 3)];

    const result = shiftFieldsAfterPageRemoval(fields, 1);

    expect(result.map((f) => f.id)).toEqual(["a", "d", "e"]);
    expect(result.map((f) => f.page)).toEqual([0, 1, 2]);
  });

  it("leaves fields on earlier pages untouched", () => {
    const fields = [makeField("a", 0), makeField("b", 1)];

    const result = shiftFieldsAfterPageRemoval(fields, 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(fields[0]);
  });

  it("handles empty field lists", () => {
    expect(shiftFieldsAfterPageRemoval([], 0)).toEqual([]);
  });
});
