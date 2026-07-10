/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";

import { POST } from "../route";
import { recordDownloadLog } from "@/lib/admin-logs";
import { PDF_UPLOAD_MAX_BYTES, PDF_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";
import { maskToPdfRect } from "@/lib/pdf-mask-transform";

jest.mock("@/lib/admin-logs", () => ({
  recordDownloadLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/entitlements", () => ({
  getRequestEntitlement: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/redis", () => ({
  getRedis: jest.fn(() => ({
    expire: jest.fn(),
    get: jest.fn(),
    incr: jest.fn(),
  })),
}));

async function createSourcePdf() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([300, 200]);
  return await pdfDoc.save();
}

async function makeFillPdfRequest() {
  const sourceBytes = await createSourcePdf();
  const formData = new FormData();

  formData.set("pdf", new Blob([sourceBytes], { type: "application/pdf" }), "edge sample.pdf");
  formData.set(
    "fields",
    JSON.stringify([
      {
        id: "field-1",
        type: "text",
        x: 24,
        y: 32,
        width: 120,
        height: 24,
        page: 0,
        value: "Edge compatible",
        fontSize: 12,
      },
    ]),
  );
  formData.set("pageScales", JSON.stringify([[0, 1]]));
  formData.set("hasAcroForm", "false");

  return new NextRequest("https://getquickfill.com/api/fill-pdf", {
    method: "POST",
    body: formData,
    headers: {
      "x-quickfill-qa-token": "test-token",
    },
  });
}

function makeOversizeFillPdfRequest() {
  const formData = new FormData();

  formData.set(
    "pdf",
    new Blob([new Uint8Array(PDF_UPLOAD_MAX_BYTES + 1)], { type: "application/pdf" }),
    "too-large.pdf",
  );
  formData.set("fields", JSON.stringify([]));
  formData.set("pageScales", JSON.stringify([[0, 1]]));
  formData.set("hasAcroForm", "false");

  return new NextRequest("https://getquickfill.com/api/fill-pdf", {
    method: "POST",
    body: formData,
    headers: {
      "x-quickfill-qa-token": "test-token",
    },
  });
}

describe("fill-pdf route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUICKFILL_QA_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.QUICKFILL_QA_TOKEN;
  });

  it("returns a viewer-safe filled PDF with browser download headers", async () => {
    const response = await POST(await makeFillPdfRequest());
    const bytes = new Uint8Array(await response.arrayBuffer());
    const resultDoc = await PDFDocument.load(bytes);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("accept-ranges")).toBe("none");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("content-disposition")).toContain('filename="edge sample-filled.pdf"');
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(Buffer.from(bytes).toString("latin1")).toContain("%%EOF");
    expect(resultDoc.getPageCount()).toBe(1);
    expect(recordDownloadLog).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("rejects PDFs over the shared upload limit", async () => {
    const response = await POST(makeOversizeFillPdfRequest());

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: `PDF too large (max ${PDF_UPLOAD_MAX_LABEL})`,
    });
    expect(recordDownloadLog).toHaveBeenCalledWith(expect.objectContaining({
      reason: "file_too_large",
      status: "blocked",
    }));
  });
});

// 1x1 white PNG used as a stand-in flattened page image.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function createTwoPageTextPdf() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont("Helvetica");
  const pageOne = pdfDoc.addPage([300, 200]);
  pageOne.drawText("SECRETCOVEREDTEXT", { x: 24, y: 120, size: 12, font });
  const pageTwo = pdfDoc.addPage([300, 200]);
  pageTwo.drawText("KEEPPAGETWOTEXT", { x: 24, y: 120, size: 12, font });
  return await pdfDoc.save();
}

/**
 * Check whether a text marker is still recoverable from the PDF's decoded
 * content streams, either as a literal string or as the hex-encoded form
 * pdf-lib writes for standard-font text (<...> Tj). This mirrors what text
 * extraction tools like pdf.js getTextContent can recover.
 */
async function hasTextEvidence(bytes: Uint8Array, marker: string): Promise<boolean> {
  const doc = await PDFDocument.load(bytes);
  let decoded = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        decoded += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
      } catch {
        decoded += Buffer.from(obj.getContents()).toString("latin1");
      }
    }
  }
  const haystack = decoded.toLowerCase();
  const literal = marker.toLowerCase();
  const hex = Buffer.from(marker, "latin1").toString("hex").toLowerCase();
  return haystack.includes(literal) || haystack.includes(hex);
}

interface FlattenRequestOptions {
  flattenedPages?: [number, string][] | string;
  includeWhiteout?: boolean;
}

async function makeFlattenRequest(options: FlattenRequestOptions = {}) {
  const sourceBytes = await createTwoPageTextPdf();
  const formData = new FormData();

  const fields: Record<string, unknown>[] = [
    {
      id: "overlay-1",
      type: "text",
      x: 24,
      y: 40,
      width: 200,
      height: 24,
      page: 0,
      value: "OVERLAYVISIBLETEXT",
      fontSize: 12,
    },
  ];
  if (options.includeWhiteout !== false) {
    fields.push({
      id: "whiteout-1",
      type: "whiteout",
      x: 20,
      y: 70,
      width: 200,
      height: 30,
      page: 0,
      fillColor: "#ffffff",
    });
  }

  formData.set("pdf", new Blob([sourceBytes], { type: "application/pdf" }), "flatten-sample.pdf");
  formData.set("fields", JSON.stringify(fields));
  formData.set("pageScales", JSON.stringify([[0, 1], [1, 1]]));
  formData.set("hasAcroForm", "false");
  if (options.flattenedPages !== undefined) {
    formData.set(
      "flattenedPages",
      typeof options.flattenedPages === "string"
        ? options.flattenedPages
        : JSON.stringify(options.flattenedPages),
    );
  }

  return new NextRequest("https://getquickfill.com/api/fill-pdf", {
    method: "POST",
    body: formData,
    headers: {
      "x-quickfill-qa-token": "test-token",
    },
  });
}

describe("fill-pdf flattened whiteout export", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUICKFILL_QA_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.QUICKFILL_QA_TOKEN;
  });

  it("keeps covered text evidence when no flattened image is sent (current behaviour)", async () => {
    const response = await POST(await makeFlattenRequest());
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined();
    // Vector whiteout only covers visually; original text operators remain.
    await expect(hasTextEvidence(bytes, "SECRETCOVEREDTEXT")).resolves.toBe(true);
  });

  it("removes covered original text from flattened whiteout pages", async () => {
    const response = await POST(
      await makeFlattenRequest({ flattenedPages: [[0, TINY_PNG_DATA_URL]] }),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const resultDoc = await PDFDocument.load(bytes);

    expect(response.status).toBe(200);
    expect(resultDoc.getPageCount()).toBe(2);
    // Covered original text is gone from the flattened page.
    await expect(hasTextEvidence(bytes, "SECRETCOVEREDTEXT")).resolves.toBe(false);
    // User-added overlay text is still drawn as real text.
    await expect(hasTextEvidence(bytes, "OVERLAYVISIBLETEXT")).resolves.toBe(true);
    // Non-whiteout pages keep their original text.
    await expect(hasTextEvidence(bytes, "KEEPPAGETWOTEXT")).resolves.toBe(true);
    expect(recordDownloadLog).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("ignores flattened images for pages without whiteout fields", async () => {
    const response = await POST(
      await makeFlattenRequest({ flattenedPages: [[1, TINY_PNG_DATA_URL]] }),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    // Page two has no whiteout, so its image must be rejected and text kept.
    await expect(hasTextEvidence(bytes, "KEEPPAGETWOTEXT")).resolves.toBe(true);
  });

  it("falls back to a valid PDF when flattenedPages is malformed", async () => {
    const response = await POST(await makeFlattenRequest({ flattenedPages: "{not-json" }));
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined();
    await expect(hasTextEvidence(bytes, "SECRETCOVEREDTEXT")).resolves.toBe(true);
  });

  it("falls back to a valid PDF when the flattened image bytes are invalid", async () => {
    const response = await POST(
      await makeFlattenRequest({ flattenedPages: [[0, "data:image/png;base64,bm90LWEtcG5n"]] }),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined();
    // Embed failed, so the vector whiteout fallback keeps the page intact.
    await expect(hasTextEvidence(bytes, "SECRETCOVEREDTEXT")).resolves.toBe(true);
  });
});

describe("maskToPdfRect", () => {
  it("uses the same PDF point coordinate system and Y flip as fields", () => {
    expect(maskToPdfRect({ x: 100, y: 120, width: 40, height: 30 }, 800)).toEqual({
      x: 100,
      y: 650,
      width: 40,
      height: 30,
    });
  });
});
