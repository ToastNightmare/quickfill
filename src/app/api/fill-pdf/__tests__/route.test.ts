/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import {
  decodePDFRawStream,
  degrees,
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRawStream,
  PDFRadioGroup,
  StandardFonts,
} from "pdf-lib";

import { POST } from "../route";
import { recordDownloadLog } from "@/lib/admin-logs";
import { getRequestEntitlement } from "@/lib/entitlements";
import { PDF_UPLOAD_MAX_BYTES, PDF_UPLOAD_MAX_LABEL } from "@/lib/upload-limits";
import { maskToPdfRect } from "@/lib/pdf-mask-transform";
import {
  fitMultilineOverlayText,
  fitOverlayFontSize,
  fitOverlayTextPadding,
  overlayTextBaseline,
  sanitizeMultiline,
} from "@/lib/pdf-utils";
import {
  WHITEOUT_REDACTION_ERROR_CODE,
  WHITEOUT_REDACTION_ERROR_MESSAGE,
} from "@/lib/pdf-flatten";
import {
  CONTENT_PRESERVE_ERROR_CODE,
  CONTENT_PRESERVE_ERROR_MESSAGE,
} from "@/lib/pdf-annot-flatten";

const ROTATION_SAFE_DOWNLOAD_FLAG = "NEXT_PUBLIC_QUICKFILL_ROTATION_SAFE_DOWNLOAD";
const DOWNLOAD_PRESERVE_FLAG = "NEXT_PUBLIC_QUICKFILL_DOWNLOAD_PRESERVE";
const MOBILE_POLISH_FLAG = "NEXT_PUBLIC_QUICKFILL_MOBILE_POLISH";
const FIELD_FIT_FLAG = "NEXT_PUBLIC_QUICKFILL_FIELD_FIT";
const FORM_FIDELITY_FLAG = "NEXT_PUBLIC_QUICKFILL_FORM_FIDELITY";
const originalRotationSafeDownloadFlag =
  process.env[ROTATION_SAFE_DOWNLOAD_FLAG];
const originalDownloadPreserveFlag = process.env[DOWNLOAD_PRESERVE_FLAG];
const originalMobilePolishFlag = process.env[MOBILE_POLISH_FLAG];
const originalFieldFitFlag = process.env[FIELD_FIT_FLAG];
const originalFormFidelityFlag = process.env[FORM_FIDELITY_FLAG];

jest.mock("@/lib/admin-logs", () => ({
  recordDownloadLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/entitlements", () => ({
  getRequestEntitlement: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
}));

const mockRedisExpire = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisIncr = jest.fn();

jest.mock("@/lib/redis", () => ({
  getRedis: jest.fn(() => ({
    expire: mockRedisExpire,
    get: mockRedisGet,
    incr: mockRedisIncr,
  })),
}));

const mockedGetRequestEntitlement =
  getRequestEntitlement as jest.MockedFunction<typeof getRequestEntitlement>;

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

function makeUnreadableFillPdfRequest() {
  const formData = new FormData();

  formData.set(
    "pdf",
    new Blob([new Uint8Array([0, 1, 2, 3])], { type: "application/pdf" }),
    "unreadable.pdf",
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

  it("keeps catch-all failure details in logs and returns a generic error", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(makeUnreadableFillPdfRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "We couldn't generate your PDF. Please try again.",
    });
    expect(recordDownloadLog).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.any(String),
      reason: "server_error",
      status: "failed",
    }));
    error.mockRestore();
  });
});

// 1x1 white PNG used as a stand-in flattened page image.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function createTwoPageTextPdf(rotation = 0) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont("Helvetica");
  const pageOne = pdfDoc.addPage([300, 200]);
  pageOne.drawText("SECRETCOVEREDTEXT", { x: 24, y: 120, size: 12, font });
  if (rotation !== 0) pageOne.setRotation(degrees(rotation));
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

async function decodedPdfStreams(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let decoded = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    try {
      decoded += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
    } catch {
      decoded += Buffer.from(obj.getContents()).toString("latin1");
    }
  }
  return decoded;
}

interface FlattenRequestOptions {
  flattenedPages?: [number, string][] | string;
  includeWhiteout?: boolean;
  qaBypass?: boolean;
  rotation?: number;
}

async function makeFlattenRequest(options: FlattenRequestOptions = {}) {
  const sourceBytes = await createTwoPageTextPdf(options.rotation);
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
    headers: options.qaBypass === false
      ? undefined
      : { "x-quickfill-qa-token": "test-token" },
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

  it("fails closed with no PDF or quota use when a whiteout page is not flattened", async () => {
    mockedGetRequestEntitlement.mockResolvedValue({
      userId: "free-user",
      anonymousId: null,
      tier: "free",
      limit: 3,
      isPaid: false,
      qa: false,
    });
    mockRedisGet.mockResolvedValue(0);

    const response = await POST(await makeFlattenRequest({ qaBypass: false }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: WHITEOUT_REDACTION_ERROR_MESSAGE,
      code: WHITEOUT_REDACTION_ERROR_CODE,
    });
    expect(mockRedisIncr).not.toHaveBeenCalled();
    expect(recordDownloadLog).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: WHITEOUT_REDACTION_ERROR_CODE,
        status: "failed",
      }),
    );
    expect(recordDownloadLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "success" }),
    );
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
      await makeFlattenRequest({
        flattenedPages: [[1, TINY_PNG_DATA_URL]],
        includeWhiteout: false,
      }),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    // Page two has no whiteout, so its image must be rejected and text kept.
    await expect(hasTextEvidence(bytes, "KEEPPAGETWOTEXT")).resolves.toBe(true);
  });

  it("fails closed when flattenedPages is malformed", async () => {
    const response = await POST(await makeFlattenRequest({ flattenedPages: "{not-json" }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: WHITEOUT_REDACTION_ERROR_MESSAGE,
      code: WHITEOUT_REDACTION_ERROR_CODE,
    });
  });

  it("fails closed when the flattened image bytes are invalid", async () => {
    const response = await POST(
      await makeFlattenRequest({ flattenedPages: [[0, "data:image/png;base64,bm90LWEtcG5n"]] }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: WHITEOUT_REDACTION_ERROR_MESSAGE,
      code: WHITEOUT_REDACTION_ERROR_CODE,
    });
  });

  it("flattens a rotated whiteout page upright at its display dimensions", async () => {
    const response = await POST(
      await makeFlattenRequest({
        flattenedPages: [[0, TINY_PNG_DATA_URL]],
        rotation: 90,
      }),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const resultDoc = await PDFDocument.load(bytes);
    const page = resultDoc.getPages()[0];

    expect(response.status).toBe(200);
    expect(page.getRotation().angle).toBe(0);
    expect(page.getWidth()).toBe(200);
    expect(page.getHeight()).toBe(300);
    await expect(hasTextEvidence(bytes, "SECRETCOVEREDTEXT")).resolves.toBe(false);
  });
});

async function makeSignatureRequest(signatureField: Record<string, unknown>) {
  const sourceBytes = await createSourcePdf();
  const formData = new FormData();

  formData.set("pdf", new Blob([sourceBytes], { type: "application/pdf" }), "signature sample.pdf");
  formData.set("fields", JSON.stringify([signatureField]));
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

function baseSignatureField(): Record<string, unknown> {
  return {
    id: "sig-1",
    type: "signature",
    x: 40,
    y: 60,
    width: 160,
    height: 50,
    page: 0,
    value: "",
    fontSize: 16,
    signatureDataUrl: TINY_PNG_DATA_URL,
  };
}

describe("fill-pdf signature adjustments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUICKFILL_QA_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.QUICKFILL_QA_TOKEN;
  });

  it("exports an unadjusted signature exactly as before", async () => {
    const response = await POST(await makeSignatureRequest(baseSignatureField()));
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined();
    // Full opacity draws without an ExtGState alpha entry.
    expect(Buffer.from(bytes).toString("latin1")).not.toContain("/ca 0.5");
  });

  it("applies opacity via a PDF ExtGState when set", async () => {
    const response = await POST(
      await makeSignatureRequest({ ...baseSignatureField(), opacity: 0.5 }),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined();
    expect(Buffer.from(bytes).toString("latin1")).toContain("/ca 0.5");
  });

  it("exports rotated and flipped signatures as a valid PDF", async () => {
    const response = await POST(
      await makeSignatureRequest({ ...baseSignatureField(), rotation: 30, flipH: true, opacity: 0.8 }),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    const resultDoc = await PDFDocument.load(bytes);
    expect(resultDoc.getPageCount()).toBe(1);
    expect(Buffer.from(bytes).toString("latin1")).toContain("/ca 0.8");
    expect(recordDownloadLog).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("tolerates out-of-range adjustment values without failing the export", async () => {
    const response = await POST(
      await makeSignatureRequest({ ...baseSignatureField(), rotation: 9999, opacity: 5 }),
    );

    expect(response.status).toBe(200);
    await expect(
      PDFDocument.load(new Uint8Array(await response.arrayBuffer())),
    ).resolves.toBeDefined();
  });
});

async function createRotatedSourcePdf(rotation: number) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([300, 200]);
  page.setRotation(degrees(rotation));
  return await pdfDoc.save();
}

async function makeRotatedFieldRequest(rotation: number) {
  const sourceBytes = await createRotatedSourcePdf(rotation);
  const displayWidth = rotation === 90 || rotation === 270 ? 200 : 300;
  const displayHeight = rotation === 90 || rotation === 270 ? 300 : 200;
  const formData = new FormData();

  formData.set(
    "pdf",
    new Blob([sourceBytes], { type: "application/pdf" }),
    `rotation-${rotation}.pdf`,
  );
  formData.set(
    "fields",
    JSON.stringify([
      {
        id: "rotated-text",
        type: "text",
        x: 20,
        y: 20,
        width: 120,
        height: 28,
        page: 0,
        value: "ROTATEDROUTETEXT",
        fontSize: 12,
        eraseMasks: [{ x: 72, y: 20, width: 24, height: 28 }],
      },
      {
        id: "rotated-checkbox",
        type: "checkbox",
        x: 20,
        y: 60,
        width: 24,
        height: 24,
        page: 0,
        checked: true,
      },
      {
        id: "rotated-signature",
        type: "signature",
        x: 20,
        y: 100,
        width: 100,
        height: 30,
        page: 0,
        value: "Signature fallback",
        fontSize: 16,
        signatureDataUrl: TINY_PNG_DATA_URL,
      },
    ]),
  );
  formData.set("pageScales", JSON.stringify([[0, 1]]));
  formData.set(
    "viewportDims",
    JSON.stringify([[0, { width: displayWidth, height: displayHeight }]]),
  );
  formData.set("hasAcroForm", "false");

  return new NextRequest("https://getquickfill.com/api/fill-pdf", {
    method: "POST",
    body: formData,
    headers: {
      "x-quickfill-qa-token": "test-token",
    },
  });
}

describe("fill-pdf rotated page placement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUICKFILL_QA_TOKEN = "test-token";
    process.env[ROTATION_SAFE_DOWNLOAD_FLAG] = "local-v1";
  });

  afterEach(() => {
    delete process.env.QUICKFILL_QA_TOKEN;
    if (originalRotationSafeDownloadFlag === undefined) {
      delete process.env[ROTATION_SAFE_DOWNLOAD_FLAG];
    } else {
      process.env[ROTATION_SAFE_DOWNLOAD_FLAG] =
        originalRotationSafeDownloadFlag;
    }
  });

  it.each([
    [90, "0 1 -1 0 300 0 cm"],
    [180, "-1 0 0 -1 300 200 cm"],
    [270, "0 -1 1 0 0 200 cm"],
  ])(
    "maps text, checkbox, signature, and mask geometry through a %i° page",
    async (rotation, expectedTransform) => {
      const response = await POST(await makeRotatedFieldRequest(rotation));
      const bytes = new Uint8Array(await response.arrayBuffer());
      const resultDoc = await PDFDocument.load(bytes);
      const resultPage = resultDoc.getPages()[0];
      const decodedStreams = await decodedPdfStreams(bytes);

      expect(response.status).toBe(200);
      expect(resultPage.getRotation().angle).toBe(rotation);
      expect(resultPage.getWidth()).toBe(300);
      expect(resultPage.getHeight()).toBe(200);
      await expect(hasTextEvidence(bytes, "ROTATEDROUTETEXT")).resolves.toBe(true);
      expect(Buffer.from(bytes).toString("latin1")).toContain("/Subtype /Image");
      expect(decodedStreams).toContain(expectedTransform);
      expect(decodedStreams).toContain("W*");
      expect(recordDownloadLog).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success" }),
      );
    },
  );
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

async function makeDownloadPreserveRequest(
  sourceBytes: Uint8Array,
  fields: Record<string, unknown>[],
  hasAcroForm: boolean,
) {
  const formData = new FormData();
  formData.set(
    "pdf",
    new Blob(
      [
        sourceBytes.buffer.slice(
          sourceBytes.byteOffset,
          sourceBytes.byteOffset + sourceBytes.byteLength,
        ) as ArrayBuffer,
      ],
      { type: "application/pdf" },
    ),
    "preserve-source.pdf",
  );
  formData.set("fields", JSON.stringify(fields));
  formData.set("pageScales", JSON.stringify([[0, 1]]));
  formData.set("hasAcroForm", String(hasAcroForm));

  return new NextRequest("https://getquickfill.com/api/fill-pdf", {
    method: "POST",
    body: formData,
    headers: { "x-quickfill-qa-token": "test-token" },
  });
}

function markerOccurrences(decoded: string, marker: string) {
  const normalized = decoded.toLowerCase();
  const literal = marker.toLowerCase();
  const hex = Buffer.from(marker, "latin1").toString("hex").toLowerCase();
  const count = (needle: string) =>
    normalized.split(needle).length - 1;
  return count(literal) + count(hex);
}

function textDrawsForMarker(decoded: string, marker: string) {
  const markerToken = `<${Buffer.from(marker, "latin1").toString("hex")}> Tj`;
  const normalized = decoded.toLowerCase();
  const normalizedMarker = markerToken.toLowerCase();
  const number = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?";
  const draws: { fontSize: number; x: number; y: number }[] = [];
  let searchFrom = 0;

  while (searchFrom < normalized.length) {
    const markerIndex = normalized.indexOf(normalizedMarker, searchFrom);
    if (markerIndex < 0) break;
    const prefix = decoded.slice(Math.max(0, markerIndex - 300), markerIndex);
    const fontMatches = [
      ...prefix.matchAll(new RegExp(`(${number}) Tf`, "gi")),
    ];
    const matrixMatches = [
      ...prefix.matchAll(
        new RegExp(`1 0 0 1 (${number}) (${number}) Tm`, "gi"),
      ),
    ];
    const fontMatch = fontMatches.at(-1);
    const matrixMatch = matrixMatches.at(-1);
    if (fontMatch && matrixMatch) {
      draws.push({
        fontSize: Number(fontMatch[1]),
        x: Number(matrixMatch[1]),
        y: Number(matrixMatch[2]),
      });
    }
    searchFrom = markerIndex + normalizedMarker.length;
  }

  if (draws.length === 0) {
    throw new Error(`Missing PDF text marker: ${marker}`);
  }
  return draws;
}

function textDrawForMarker(decoded: string, marker: string) {
  return textDrawsForMarker(decoded, marker)[0];
}

async function makeFieldFitRequest(sourceBytes?: Uint8Array) {
  const resolvedSourceBytes = sourceBytes ?? await createSourcePdf();
  const formData = new FormData();
  formData.set(
    "pdf",
    new Blob(
      [
        resolvedSourceBytes.buffer.slice(
          resolvedSourceBytes.byteOffset,
          resolvedSourceBytes.byteOffset + resolvedSourceBytes.byteLength,
        ) as ArrayBuffer,
      ],
      { type: "application/pdf" },
    ),
    "field-fit.pdf",
  );
  formData.set(
    "fields",
    JSON.stringify([
      {
        id: "field-fit-overlay",
        type: "text",
        x: 20,
        y: 40,
        width: 8,
        height: 8,
        page: 0,
        value: "FIELDFITMARKER",
        fontSize: 14,
      },
    ]),
  );
  formData.set("pageScales", JSON.stringify([[0, 1]]));
  formData.set("hasAcroForm", "false");

  return new NextRequest("https://getquickfill.com/api/fill-pdf", {
    method: "POST",
    body: formData,
    headers: { "x-quickfill-qa-token": "test-token" },
  });
}

async function createPrefilledTextForm() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([300, 200]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const textField = pdfDoc.getForm().createTextField("fullName");
  textField.setText("PREFILLEDONCE");
  textField.addToPage(page, {
    x: 20,
    y: 140,
    width: 180,
    height: 24,
    font,
  });
  return pdfDoc.save({ updateFieldAppearances: false });
}

async function createMultilineTextForm(
  value: string,
  rect = { x: 40, y: 80, width: 480, height: 90 },
) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 260]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const textField = pdfDoc.getForm().createTextField("claimDetails");
  textField.enableMultiline();
  textField.setText(value);
  textField.addToPage(page, {
    ...rect,
    font,
  });
  return pdfDoc.save({ updateFieldAppearances: false });
}

async function createNeedAppearancesForm() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([300, 240]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const form = pdfDoc.getForm();

  const textField = form.createTextField("needsText");
  textField.setText("NEEDSTEXT");
  textField.addToPage(page, {
    x: 20,
    y: 180,
    width: 160,
    height: 24,
    font,
  });
  for (const widget of textField.acroField.getWidgets()) {
    widget.dict.delete(PDFName.of("AP"));
  }

  const checkbox = form.createCheckBox("confirmed");
  checkbox.check();
  checkbox.addToPage(page, {
    x: 20,
    y: 135,
    width: 20,
    height: 20,
  });

  const dropdown = form.createDropdown("region");
  dropdown.setOptions(["East", "West"]);
  dropdown.select("West");
  dropdown.addToPage(page, {
    x: 20,
    y: 90,
    width: 120,
    height: 24,
    font,
  });

  const acroForm = pdfDoc.catalog.lookup(
    PDFName.of("AcroForm"),
    PDFDict,
  );
  acroForm.set(PDFName.of("NeedAppearances"), PDFBool.True);
  return pdfDoc.save({ updateFieldAppearances: false });
}

async function createSelectedDropdownForm() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([300, 200]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const dropdown = pdfDoc.getForm().createDropdown("region");
  dropdown.setOptions(["CHOICE_A", "CHOICE_B"]);
  dropdown.select("CHOICE_B");
  dropdown.addToPage(page, {
    x: 20,
    y: 140,
    width: 120,
    height: 24,
    font,
  });
  return pdfDoc.save({ updateFieldAppearances: false });
}

async function createSelectedChoiceForm() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 300]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const form = pdfDoc.getForm();

  const radio = form.createRadioGroup("contact");
  radio.addOptionToPage("EMAIL", page, {
    x: 20,
    y: 240,
    width: 20,
    height: 20,
  });
  radio.addOptionToPage("PHONE", page, {
    x: 60,
    y: 240,
    width: 20,
    height: 20,
  });
  radio.select("EMAIL");

  const dropdown = form.createDropdown("region");
  dropdown.setOptions(["NORTH", "WEST"]);
  dropdown.select("NORTH");
  dropdown.addToPage(page, {
    x: 20,
    y: 180,
    width: 120,
    height: 24,
    font,
  });

  const optionList = form.createOptionList("service");
  optionList.setOptions(["SUPPORT", "TRAINING"]);
  optionList.select("SUPPORT");
  optionList.addToPage(page, {
    x: 20,
    y: 90,
    width: 160,
    height: 60,
    font,
  });

  return pdfDoc.save({ updateFieldAppearances: false });
}

async function createMissingAppearanceAnnotationPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([300, 200]);
  const annotation = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "FreeText",
    Rect: [20, 30, 220, 70],
  });
  const annotations = PDFArray.withContext(pdfDoc.context);
  annotations.push(pdfDoc.context.register(annotation));
  page.node.set(PDFName.of("Annots"), annotations);
  return pdfDoc.save();
}

describe("fill-pdf download content preservation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUICKFILL_QA_TOKEN = "test-token";
    process.env[DOWNLOAD_PRESERVE_FLAG] = "v1";
    delete process.env[MOBILE_POLISH_FLAG];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.QUICKFILL_QA_TOKEN;
    if (originalDownloadPreserveFlag === undefined) {
      delete process.env[DOWNLOAD_PRESERVE_FLAG];
    } else {
      process.env[DOWNLOAD_PRESERVE_FLAG] =
        originalDownloadPreserveFlag;
    }
    if (originalMobilePolishFlag === undefined) {
      delete process.env[MOBILE_POLISH_FLAG];
    } else {
      process.env[MOBILE_POLISH_FLAG] = originalMobilePolishFlag;
    }
  });

  it("writes a matched prefilled text field into the form and burns it once", async () => {
    const response = await POST(
      await makeDownloadPreserveRequest(
        await createPrefilledTextForm(),
        [
          {
            id: "fullName",
            type: "text",
            x: 20,
            y: 36,
            width: 180,
            height: 24,
            page: 0,
            value: "PREFILLEDONCE",
            fontSize: 12,
          },
        ],
        true,
      ),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(markerOccurrences(await decodedPdfStreams(bytes), "PREFILLEDONCE")).toBe(1);
  });

  it("keeps the master encoded stream structure for a non-matching flag value", async () => {
    process.env[DOWNLOAD_PRESERVE_FLAG] = "true";
    const response = await POST(
      await makeDownloadPreserveRequest(
        await createPrefilledTextForm(),
        [
          {
            id: "fullName",
            type: "text",
            x: 20,
            y: 36,
            width: 180,
            height: 24,
            page: 0,
            value: "PREFILLEDONCE",
            fontSize: 12,
          },
        ],
        true,
      ),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    // Master retains one stale appearance stream in addition to the two
    // rendered copies. Browser-level QA below asserts the visible double draw.
    expect(markerOccurrences(await decodedPdfStreams(bytes), "PREFILLEDONCE")).toBe(3);
  });

  it("regenerates missing appearances and preserves checked and untouched choice values", async () => {
    const response = await POST(
      await makeDownloadPreserveRequest(
        await createNeedAppearancesForm(),
        [
          {
            id: "needsText",
            type: "text",
            x: 20,
            y: 36,
            width: 160,
            height: 24,
            page: 0,
            value: "NEEDSTEXT",
            fontSize: 12,
          },
          {
            id: "confirmed",
            type: "checkbox",
            x: 20,
            y: 85,
            width: 20,
            height: 20,
            page: 0,
            checked: true,
          },
          {
            id: "region",
            type: "text",
            x: 20,
            y: 126,
            width: 120,
            height: 24,
            page: 0,
            value: "West",
            fontSize: 12,
          },
        ],
        true,
      ),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const streams = await decodedPdfStreams(bytes);

    expect(response.status).toBe(200);
    expect(markerOccurrences(streams, "NEEDSTEXT")).toBe(1);
    expect(markerOccurrences(streams, "West")).toBe(1);
    expect(streams).toContain("-2.5 -4.9 l");
    expect(streams).toContain("6.8999999999999995 4.75 l");
  });

  it.each([
    ["changed", "CHOICE_C", "CHOICE_C"],
    ["unchanged", "CHOICE_B", "CHOICE_B"],
    ["empty", "", "CHOICE_B"],
  ])(
    "overlay-draws a %s submitted dropdown value only when it differs from the current selection",
    async (_case, submittedValue, expectedMarker) => {
      const response = await POST(
        await makeDownloadPreserveRequest(
          await createSelectedDropdownForm(),
          [
            {
              id: "region",
              type: "text",
              x: 20,
              y: 36,
              width: 120,
              height: 24,
              page: 0,
              value: submittedValue,
              fontSize: 12,
            },
          ],
          true,
        ),
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      const streams = await decodedPdfStreams(bytes);

      expect(response.status).toBe(200);
      if (submittedValue === "CHOICE_C") {
        expect(markerOccurrences(streams, expectedMarker)).toBeGreaterThan(0);
        expect(markerOccurrences(streams, "CHOICE_B")).toBe(1);
      } else {
        expect(markerOccurrences(streams, expectedMarker)).toBe(1);
      }
    },
  );

  it("selects valid radio, dropdown, and option-list values in the real form only when both flags are active", async () => {
    const sourceBytes = await createSelectedChoiceForm();
    const radioSelect = jest.spyOn(PDFRadioGroup.prototype, "select");
    const dropdownSelect = jest.spyOn(PDFDropdown.prototype, "select");
    const optionListSelect = jest.spyOn(PDFOptionList.prototype, "select");
    process.env[MOBILE_POLISH_FLAG] = "v1";

    const response = await POST(
      await makeDownloadPreserveRequest(
        sourceBytes,
        [
          {
            id: "contact",
            type: "text",
            choice: true,
            x: 20,
            y: 40,
            width: 20,
            height: 20,
            page: 0,
            value: "PHONE",
            fontSize: 12,
          },
          {
            id: "region",
            type: "text",
            choice: true,
            x: 20,
            y: 96,
            width: 120,
            height: 24,
            page: 0,
            value: "WEST",
            fontSize: 12,
          },
          {
            id: "service",
            type: "text",
            choice: true,
            x: 20,
            y: 150,
            width: 160,
            height: 60,
            page: 0,
            value: "TRAINING",
            fontSize: 12,
          },
        ],
        true,
      ),
    );

    expect(response.status).toBe(200);
    expect(radioSelect).toHaveBeenCalledWith("PHONE");
    expect(dropdownSelect).toHaveBeenCalledWith("WEST");
    expect(optionListSelect).toHaveBeenCalledWith("TRAINING");

    radioSelect.mockRestore();
    dropdownSelect.mockRestore();
    optionListSelect.mockRestore();
  });

  it.each([
    ["mobile flag", "true", "v1"],
    ["download-preserve flag", "v1", "true"],
  ])(
    "keeps the existing overlay fallback when the %s is not the exact rollout value",
    async (_flag, mobileFlag, preserveFlag) => {
      const sourceBytes = await createSelectedDropdownForm();
      const dropdownSelect = jest.spyOn(PDFDropdown.prototype, "select");
      process.env[MOBILE_POLISH_FLAG] = mobileFlag;
      process.env[DOWNLOAD_PRESERVE_FLAG] = preserveFlag;

      const response = await POST(
        await makeDownloadPreserveRequest(
          sourceBytes,
          [
            {
              id: "region",
              type: "text",
              choice: true,
              x: 20,
              y: 36,
              width: 120,
              height: 24,
              page: 0,
              value: "CHOICE_A",
              fontSize: 12,
            },
          ],
          true,
        ),
      );
      const bytes = new Uint8Array(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(dropdownSelect).not.toHaveBeenCalled();
      expect(
        markerOccurrences(await decodedPdfStreams(bytes), "CHOICE_A"),
      ).toBeGreaterThan(0);
      dropdownSelect.mockRestore();
    },
  );

  it("keeps an invalid mobile choice on the overlay fallback", async () => {
    const sourceBytes = await createSelectedDropdownForm();
    const dropdownSelect = jest.spyOn(PDFDropdown.prototype, "select");
    process.env[MOBILE_POLISH_FLAG] = "v1";

    const response = await POST(
      await makeDownloadPreserveRequest(
        sourceBytes,
        [
          {
            id: "region",
            type: "text",
            choice: true,
            x: 20,
            y: 36,
            width: 120,
            height: 24,
            page: 0,
            value: "CHOICE_C",
            fontSize: 12,
          },
        ],
        true,
      ),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const streams = await decodedPdfStreams(bytes);

    expect(response.status).toBe(200);
    expect(dropdownSelect).not.toHaveBeenCalled();
    expect(markerOccurrences(streams, "CHOICE_C")).toBeGreaterThan(0);
    expect(markerOccurrences(streams, "CHOICE_B")).toBe(1);
    dropdownSelect.mockRestore();
  });

  it("returns the typed 422 without quota use when visible content cannot be preserved", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await POST(
      await makeDownloadPreserveRequest(
        await createMissingAppearanceAnnotationPdf(),
        [],
        false,
      ),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: CONTENT_PRESERVE_ERROR_MESSAGE,
      code: CONTENT_PRESERVE_ERROR_CODE,
    });
    expect(mockRedisIncr).not.toHaveBeenCalled();
    expect(recordDownloadLog).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: CONTENT_PRESERVE_ERROR_CODE,
        status: "failed",
      }),
    );
    expect(recordDownloadLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "success" }),
    );
  });
});

describe("fill-pdf form-fidelity multiline overlay", () => {
  const multilineValue =
    "The policy holder confirms the insured property remains occupied during the working day.\nAdditional claim details stay inside this full-width multiline box.";
  const multilineField = (value: string) => ({
    id: "claimDetails",
    type: "text",
    x: 40,
    y: 90,
    width: 480,
    height: 90,
    page: 0,
    value,
    fontSize: 12,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUICKFILL_QA_TOKEN = "test-token";
    process.env[DOWNLOAD_PRESERVE_FLAG] = "v1";
    process.env[MOBILE_POLISH_FLAG] = "v1";
    process.env[FIELD_FIT_FLAG] = "v1";
    process.env[FORM_FIDELITY_FLAG] = "v1";
  });

  afterEach(() => {
    delete process.env.QUICKFILL_QA_TOKEN;
    for (const [name, original] of [
      [DOWNLOAD_PRESERVE_FLAG, originalDownloadPreserveFlag],
      [MOBILE_POLISH_FLAG, originalMobilePolishFlag],
      [FIELD_FIT_FLAG, originalFieldFitFlag],
      [FORM_FIDELITY_FLAG, originalFormFidelityFlag],
    ] as const) {
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
  });

  it("draws a matched multiline value exactly once and keeps every line inside the widget", async () => {
    const response = await POST(
      await makeDownloadPreserveRequest(
        await createMultilineTextForm(multilineValue),
        [multilineField(multilineValue)],
        true,
      ),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const decoded = await decodedPdfStreams(bytes);
    const metricsDoc = await PDFDocument.create();
    const font = await metricsDoc.embedFont(StandardFonts.Helvetica);
    const padding = fitOverlayTextPadding(480, 90, 4);
    const layout = fitMultilineOverlayText(
      sanitizeMultiline(multilineValue),
      480 - padding * 2,
      90,
      font,
      12,
      padding,
    );
    const drawnLines = layout.lines.filter(Boolean);
    const ascent = font.heightAtSize(layout.fontSize, { descender: false });
    const descent = layout.lineHeight - ascent;

    expect(response.status).toBe(200);
    expect(drawnLines.join(" ").replace(/\s+/g, " ").trim()).toBe(
      multilineValue.replace(/\s+/g, " ").trim(),
    );
    for (const line of drawnLines) {
      const insideDraws = Array.from(
        new Map(
          textDrawsForMarker(decoded, line)
            .filter((draw) => {
              const lineWidth = font.widthOfTextAtSize(line, draw.fontSize);
              return (
                draw.x >= 40 &&
                draw.x + lineWidth <= 520 &&
                draw.y - descent >= 80 &&
                draw.y + ascent <= 170
              );
            })
            // Viewer-safe finalization serializes the source stream and its
            // painted Form XObject with identical operators. Deduplicate that
            // storage detail; pdf.js QA below asserts the visible occurrence.
            .map((draw) => [
              `${draw.fontSize}:${draw.x}:${draw.y}`,
              draw,
            ] as const),
        ).values(),
      );
      expect(insideDraws).toHaveLength(1);
      const draw = insideDraws[0];
      expect(draw.fontSize).toBeCloseTo(layout.fontSize, 8);
      expect(draw.x).toBeGreaterThanOrEqual(40);
      expect(
        draw.x + font.widthOfTextAtSize(line, draw.fontSize),
      ).toBeLessThanOrEqual(520);
      expect(draw.y - descent).toBeGreaterThanOrEqual(80);
      expect(draw.y + ascent).toBeLessThanOrEqual(170);
    }
  });

  it("flattens a cleared multiline field without retaining its old value", async () => {
    const staleValue = "STALEMULTILINEVALUE";
    const response = await POST(
      await makeDownloadPreserveRequest(
        await createMultilineTextForm(staleValue),
        [multilineField("")],
        true,
      ),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const resultDoc = await PDFDocument.load(bytes);

    expect(response.status).toBe(200);
    expect(resultDoc.getForm().getFields()).toHaveLength(0);
    expect(markerOccurrences(await decodedPdfStreams(bytes), staleValue)).toBe(
      0,
    );
  });

  it("clips unavoidable 4pt-floor overflow to the multiline widget", async () => {
    const overflowValue = "ONE\nTWO\nTHREE\nFOUR";
    const response = await POST(
      await makeDownloadPreserveRequest(
        await createMultilineTextForm(overflowValue, {
          x: 40,
          y: 80,
          width: 30,
          height: 8,
        }),
        [multilineField(overflowValue)],
        true,
      ),
    );
    const decoded = await decodedPdfStreams(
      new Uint8Array(await response.arrayBuffer()),
    );

    expect(response.status).toBe(200);
    expect(decoded).toMatch(
      /q\s+39\.5 79\.5 m\s+70\.5 79\.5 l\s+70\.5 88\.5 l\s+39\.5 88\.5 l\s+h\s+W\*\s+n/i,
    );
    for (const line of overflowValue.split("\n")) {
      expect(markerOccurrences(decoded, line)).toBeGreaterThan(0);
    }
  });

  it("keeps unset and non-v1 output byte-identical to the flag-off path", async () => {
    const sourceBytes = await createMultilineTextForm(multilineValue);
    delete process.env[FORM_FIDELITY_FLAG];
    const unsetResponse = await POST(
      await makeDownloadPreserveRequest(
        sourceBytes,
        [multilineField(multilineValue)],
        true,
      ),
    );
    const unsetBytes = Buffer.from(await unsetResponse.arrayBuffer());

    process.env[FORM_FIDELITY_FLAG] = "true";
    const nonV1Response = await POST(
      await makeDownloadPreserveRequest(
        sourceBytes,
        [multilineField(multilineValue)],
        true,
      ),
    );
    const nonV1Bytes = Buffer.from(await nonV1Response.arrayBuffer());

    expect(unsetResponse.status).toBe(200);
    expect(nonV1Response.status).toBe(200);
    expect(nonV1Bytes.equals(unsetBytes)).toBe(true);
  });

  it("applies comb offsetY only for the exact form-fidelity flag", async () => {
    const sourceBytes = await createSourcePdf();
    const combField = (offsetY: number) => ({
      id: "comb-offset-y",
      type: "comb",
      x: 20,
      y: 40,
      width: 100,
      height: 20,
      page: 0,
      value: "Q",
      charCount: 2,
      offsetY,
    });
    const zeroResponse = await POST(
      await makeDownloadPreserveRequest(
        sourceBytes,
        [combField(0)],
        false,
      ),
    );
    const zeroBytes = new Uint8Array(await zeroResponse.arrayBuffer());
    const shiftedResponse = await POST(
      await makeDownloadPreserveRequest(
        sourceBytes,
        [combField(7)],
        false,
      ),
    );
    const shiftedBytes = new Uint8Array(
      await shiftedResponse.arrayBuffer(),
    );
    const zeroDraw = textDrawForMarker(
      await decodedPdfStreams(zeroBytes),
      "Q",
    );
    const shiftedDraw = textDrawForMarker(
      await decodedPdfStreams(shiftedBytes),
      "Q",
    );

    expect(zeroResponse.status).toBe(200);
    expect(shiftedResponse.status).toBe(200);
    expect(shiftedDraw.y - zeroDraw.y).toBeCloseTo(7, 8);

    delete process.env[FORM_FIDELITY_FLAG];
    const disabledZeroResponse = await POST(
      await makeDownloadPreserveRequest(
        sourceBytes,
        [combField(0)],
        false,
      ),
    );
    const disabledShiftedResponse = await POST(
      await makeDownloadPreserveRequest(
        sourceBytes,
        [combField(7)],
        false,
      ),
    );
    const disabledZeroBytes = Buffer.from(
      await disabledZeroResponse.arrayBuffer(),
    );
    const disabledShiftedBytes = Buffer.from(
      await disabledShiftedResponse.arrayBuffer(),
    );

    expect(disabledShiftedBytes.equals(disabledZeroBytes)).toBe(true);
  });
});

describe("fill-pdf field-fit overlay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUICKFILL_QA_TOKEN = "test-token";
    process.env[DOWNLOAD_PRESERVE_FLAG] = "v1";
    process.env[MOBILE_POLISH_FLAG] = "v1";
  });

  afterEach(() => {
    delete process.env.QUICKFILL_QA_TOKEN;
    if (originalFieldFitFlag === undefined) {
      delete process.env[FIELD_FIT_FLAG];
    } else {
      process.env[FIELD_FIT_FLAG] = originalFieldFitFlag;
    }
    if (originalDownloadPreserveFlag === undefined) {
      delete process.env[DOWNLOAD_PRESERVE_FLAG];
    } else {
      process.env[DOWNLOAD_PRESERVE_FLAG] =
        originalDownloadPreserveFlag;
    }
    if (originalMobilePolishFlag === undefined) {
      delete process.env[MOBILE_POLISH_FLAG];
    } else {
      process.env[MOBILE_POLISH_FLAG] = originalMobilePolishFlag;
    }
  });

  it("draws a short-field value at the shared fitted size and baseline", async () => {
    process.env[FIELD_FIT_FLAG] = "v1";
    const response = await POST(await makeFieldFitRequest());
    const bytes = new Uint8Array(await response.arrayBuffer());
    const decoded = await decodedPdfStreams(bytes);
    const draw = textDrawForMarker(decoded, "FIELDFITMARKER");
    const metricsDoc = await PDFDocument.create();
    const font = await metricsDoc.embedFont(StandardFonts.Helvetica);
    const padding = fitOverlayTextPadding(8, 8, 4);
    const fittedSize = fitOverlayFontSize(
      8,
      14,
      (fontSize) => font.heightAtSize(fontSize),
      padding,
    );
    const expectedBaseline = overlayTextBaseline(152, 8, fittedSize, font);

    expect(response.status).toBe(200);
    expect(markerOccurrences(decoded, "FIELDFITMARKER")).toBeGreaterThan(0);
    expect(draw.fontSize).toBeCloseTo(fittedSize, 8);
    expect(draw.x).toBeCloseTo(20 + padding, 8);
    expect(Math.abs(draw.y - expectedBaseline)).toBeLessThanOrEqual(0.5);
  });

  it("keeps unset and non-v1 output byte-identical", async () => {
    const sourceBytes = await createSourcePdf();
    delete process.env[FIELD_FIT_FLAG];
    const unsetResponse = await POST(await makeFieldFitRequest(sourceBytes));
    const unsetBytes = Buffer.from(await unsetResponse.arrayBuffer());

    process.env[FIELD_FIT_FLAG] = "true";
    const nonV1Response = await POST(await makeFieldFitRequest(sourceBytes));
    const nonV1Bytes = Buffer.from(await nonV1Response.arrayBuffer());
    const draw = textDrawForMarker(
      await decodedPdfStreams(nonV1Bytes),
      "FIELDFITMARKER",
    );

    expect(unsetResponse.status).toBe(200);
    expect(nonV1Response.status).toBe(200);
    expect(nonV1Bytes.equals(unsetBytes)).toBe(true);
    expect(draw.fontSize).toBe(14);
  });
});

describe("overlayTextBaseline", () => {
  it.each([10, 12, 14, 18, 24])(
    "matches Konva middle alignment within 0.5pt at %ipt",
    async (fontSize) => {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fieldBottom = 100;
      const fieldHeight = 36;
      const ascent = font.heightAtSize(fontSize, { descender: false });
      const fullHeight = font.heightAtSize(fontSize);
      const descent = fullHeight - ascent;
      const konvaBaselineFromTop =
        fieldHeight / 2 + (ascent - descent) / 2;
      const konvaBaselineFromBottom =
        fieldBottom + fieldHeight - konvaBaselineFromTop;

      expect(
        Math.abs(
          overlayTextBaseline(fieldBottom, fieldHeight, fontSize, font) -
            konvaBaselineFromBottom,
        ),
      ).toBeLessThanOrEqual(0.5);
    },
  );
});
