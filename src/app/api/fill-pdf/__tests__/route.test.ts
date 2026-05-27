/**
 * @jest-environment node
 */

import { File } from "node:buffer";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

import { POST } from "../route";
import { recordDownloadLog } from "@/lib/admin-logs";

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

  formData.set("pdf", new File([sourceBytes], "edge sample.pdf", { type: "application/pdf" }));
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
});
