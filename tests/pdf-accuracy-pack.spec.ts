import { test, expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import {
  decodePDFRawStream,
  degrees,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { finalizePdfForDownload } from "../src/lib/pdf-finalize";
import { PDF_UPLOAD_MAX_LABEL } from "../src/lib/upload-limits";
import { WATERMARK_URL } from "../src/lib/watermark";

type TestPdf = {
  name: string;
  bytes: Buffer;
};

type PdfVisualMetrics = {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  changedRatio: number;
  meanDelta: number;
  sourceNonWhiteRatio: number;
  outputNonWhiteRatio: number;
  sourcePng: string;
  outputPng: string;
};

type PdfColorBounds = {
  canvasWidth: number;
  canvasHeight: number;
  matchedPixels: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const visualThresholds = {
  minWidth: 300,
  minHeight: 500,
  minNonWhiteRatio: 0.01,
  maxMeanDelta: 12,
  maxChangedRatio: 0.08,
};

const qaToken = process.env.QUICKFILL_QA_TOKEN;
const enforceQaToken = process.env.QUICKFILL_PDF_QA_ENFORCE === "1";
const rotationSafeDownloadEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_ROTATION_SAFE_DOWNLOAD === "local-v1";
const enforcedBaseUrl = "http://localhost:3000";
const enforcedRedisUrl = "http://127.0.0.1:38079";
const expectedEnforcedPdfTestCount = 26;
const fieldPositionLandmark = {
  x: 73,
  y: 91,
  width: 84,
  height: 46,
  fillColor: "#ff00ff",
  rgb: [255, 0, 255] as const,
};
const configuredPdfQaOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? enforcedBaseUrl,
).origin;

if (enforceQaToken && !qaToken) {
  throw new Error(
    "QUICKFILL_QA_TOKEN is required when QUICKFILL_PDF_QA_ENFORCE=1.",
  );
}

if (enforceQaToken && process.env.PLAYWRIGHT_BASE_URL !== enforcedBaseUrl) {
  throw new Error(
    `PLAYWRIGHT_BASE_URL must be ${enforcedBaseUrl} when QUICKFILL_PDF_QA_ENFORCE=1.`,
  );
}

if (enforceQaToken && process.env.UPSTASH_REDIS_REST_URL !== enforcedRedisUrl) {
  throw new Error(
    `UPSTASH_REDIS_REST_URL must be ${enforcedRedisUrl} when QUICKFILL_PDF_QA_ENFORCE=1.`,
  );
}

if (enforceQaToken && process.env.UPSTASH_REDIS_REST_TOKEN !== qaToken) {
  throw new Error(
    "UPSTASH_REDIS_REST_TOKEN must reuse QUICKFILL_QA_TOKEN in PDF enforcement mode.",
  );
}

const templateDir = join(process.cwd(), "public", "templates");
const realTemplateFiles = [
  "ato-tfn-declaration.pdf",
  "ato-super-choice.pdf",
  "ato-withholding-declaration.pdf",
  "centrelink-su415.pdf",
  "employment-separation.pdf",
  "medicare-enrolment.pdf",
  "ndis-service-agreement.pdf",
  "rental-application.pdf",
  "tenancy-application-nsw.pdf",
  "tenancy-application-vic.pdf",
  "statutory-declaration.pdf",
  "australian-invoice.pdf",
];

const visualTemplateFiles = [
  "ato-tfn-declaration.pdf",
  "ato-super-choice.pdf",
  "employment-separation.pdf",
  "medicare-enrolment.pdf",
];

function sendJson(response: import("node:http").ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    connection: "close",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Local Redis request is too large.");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function redisCommandsFromBody(body: unknown) {
  if (!Array.isArray(body)) throw new Error("Expected a Redis command array.");
  if (body.every(Array.isArray)) return body as unknown[][];
  return [body];
}

async function startEnforcedRedisStub() {
  const expectedAuthorization = `Bearer ${qaToken}`;
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || !new Set(["/", "/pipeline"]).has(request.url ?? "")) {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      if (request.headers.authorization !== expectedAuthorization) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      const body = await readJsonBody(request);
      const results = redisCommandsFromBody(body).map((redisCommand) => {
        const command = String(redisCommand[0] ?? "").toLowerCase();
        const key = String(redisCommand[1] ?? "");
        if (!new Set(["lpush", "ltrim"]).has(command) || key !== "admin:download_logs") {
          throw new Error("Unsupported local Redis command.");
        }
        return { result: command === "ltrim" ? "OK" : 1 };
      });

      if (request.url === "/pipeline") {
        sendJson(response, 200, results);
      } else {
        sendJson(response, 200, results[0]);
      }
    } catch {
      sendJson(response, 400, { error: "Invalid local Redis request" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => reject(error);
    server.once("error", handleError);
    server.listen(38079, "127.0.0.1", () => {
      server.off("error", handleError);
      resolve();
    });
  });

  return server;
}

async function stopEnforcedRedisStub(server: Server | undefined) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function loadTemplatePdf(name: string): Promise<TestPdf> {
  return {
    name,
    bytes: await readFile(join(templateDir, name)),
  };
}

async function createAcroFormPdf(): Promise<TestPdf> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const form = pdfDoc.getForm();

  page.drawText("QuickFill PDF accuracy pack", {
    x: 48,
    y: 730,
    size: 18,
    font,
    color: rgb(0.05, 0.08, 0.15),
  });
  page.drawText("Name", { x: 48, y: 680, size: 10, font });
  page.drawText("Date of birth", { x: 48, y: 620, size: 10, font });
  page.drawText("Tax file number", { x: 48, y: 560, size: 10, font });
  page.drawText("Confirm details are correct", { x: 78, y: 505, size: 10, font });

  const fullName = form.createTextField("fullName");
  fullName.addToPage(page, { x: 48, y: 650, width: 330, height: 28 });

  const dateOfBirth = form.createTextField("dateOfBirth");
  dateOfBirth.addToPage(page, { x: 48, y: 590, width: 150, height: 28 });

  const taxFileNumber = form.createTextField("taxFileNumber");
  taxFileNumber.addToPage(page, { x: 48, y: 530, width: 210, height: 28 });

  const confirmed = form.createCheckBox("confirmed");
  confirmed.addToPage(page, { x: 48, y: 500, width: 20, height: 20 });

  const bytes = await pdfDoc.save();
  return { name: "quickfill-qa-acroform.pdf", bytes: Buffer.from(bytes) };
}

async function createFlatPdf(): Promise<TestPdf> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText("QuickFill flat PDF fallback check", {
    x: 48,
    y: 730,
    size: 18,
    font,
    color: rgb(0.05, 0.08, 0.15),
  });
  page.drawText("This PDF has no AcroForm fields.", { x: 48, y: 685, size: 12, font });
  page.drawRectangle({
    x: 48,
    y: 640,
    width: 260,
    height: 28,
    borderWidth: 1,
    borderColor: rgb(0.1, 0.1, 0.1),
  });

  const bytes = await pdfDoc.save();
  return { name: "quickfill-qa-flat.pdf", bytes: Buffer.from(bytes) };
}

type RotationPageSpec = {
  rotation: 0 | 90 | 180 | 270;
  width: number;
  height: number;
};

async function createRotationLandmarkPdf(
  name: string,
  pageSpecs: RotationPageSpec[],
): Promise<TestPdf> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const [index, spec] of pageSpecs.entries()) {
    const page = pdfDoc.addPage([spec.width, spec.height]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: spec.width,
      height: spec.height,
      color: rgb(0.95, 0.93, 0.82),
    });
    page.drawRectangle({
      x: 17,
      y: 23,
      width: spec.width * 0.43,
      height: spec.height * 0.31,
      color: rgb(0.86, 0.12, 0.16),
    });
    page.drawRectangle({
      x: spec.width * 0.63,
      y: spec.height * 0.61,
      width: spec.width * 0.29,
      height: spec.height * 0.27,
      color: rgb(0.08, 0.28, 0.83),
    });
    page.drawRectangle({
      x: spec.width * 0.48,
      y: spec.height * 0.12,
      width: spec.width * 0.13,
      height: spec.height * 0.73,
      color: rgb(0.09, 0.58, 0.31),
    });
    page.drawText(`PAGE ${index + 1} ROTATION ${spec.rotation}`, {
      x: 28,
      y: spec.height - 42,
      size: 18,
      font,
      color: rgb(0.03, 0.04, 0.06),
    });
    page.setRotation(degrees(spec.rotation));
  }

  return {
    name,
    bytes: Buffer.from(await pdfDoc.save()),
  };
}

async function createFilledRotatedPdf(
  rotation: 90 | 180,
): Promise<TestPdf> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([620, 420]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 620,
    height: 420,
    color: rgb(0.9, 0.92, 0.95),
  });
  page.setRotation(degrees(rotation));

  return {
    name: `quickfill-qa-field-position-${rotation}.pdf`,
    bytes: Buffer.from(await pdfDoc.save()),
  };
}

async function decodedPdfStreams(bytes: Uint8Array): Promise<string> {
  const pdfDoc = await PDFDocument.load(bytes);
  let decoded = "";
  for (const [, object] of pdfDoc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    try {
      decoded += Buffer.from(decodePDFRawStream(object).decode()).toString("latin1");
    } catch {
      decoded += Buffer.from(object.getContents()).toString("latin1");
    }
  }
  return decoded;
}

async function requestRotatedPositionExport(
  request: APIRequestContext,
  rotation: 90 | 180,
): Promise<Buffer> {
  test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run rotated position checks.");
  const source = await createFilledRotatedPdf(rotation);
  const displayWidth = rotation === 90 ? 420 : 620;
  const displayHeight = rotation === 90 ? 620 : 420;
  const response = await request.post("/api/fill-pdf", {
    headers: qaToken ? { "x-quickfill-qa-token": qaToken } : undefined,
    multipart: {
      pdf: {
        name: source.name,
        mimeType: "application/pdf",
        buffer: source.bytes,
      },
      fields: JSON.stringify([
        {
          id: `position-landmark-${rotation}`,
          type: "whiteout",
          x: fieldPositionLandmark.x,
          y: fieldPositionLandmark.y,
          width: fieldPositionLandmark.width,
          height: fieldPositionLandmark.height,
          page: 0,
          fillColor: fieldPositionLandmark.fillColor,
        },
      ]),
      pageScales: JSON.stringify([[0, 1]]),
      viewportDims: JSON.stringify([
        [0, { width: displayWidth, height: displayHeight }],
      ]),
      hasAcroForm: "false",
    },
  });

  expect(response.status()).toBe(200);
  return Buffer.from(await response.body());
}

async function requestRotatedFieldExport(
  request: APIRequestContext,
): Promise<{ output: Buffer; source: TestPdf }> {
  test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run rotated field checks.");
  const source = await createRotationLandmarkPdf(
    "quickfill-qa-rotated-fields.pdf",
    [{ rotation: 90, width: 620, height: 420 }],
  );
  const fields = [
    {
      id: "rotation-text",
      type: "text",
      x: 28,
      y: 40,
      width: 180,
      height: 32,
      page: 0,
      value: "ROTATEDFIELDMARKER",
      fontSize: 14,
      eraseMasks: [{ x: 112, y: 40, width: 32, height: 32 }],
    },
    {
      id: "rotation-checkbox",
      type: "checkbox",
      x: 28,
      y: 100,
      width: 28,
      height: 28,
      page: 0,
      checked: true,
    },
    {
      id: "rotation-signature",
      type: "signature",
      x: 28,
      y: 160,
      width: 140,
      height: 42,
      page: 0,
      value: "Rotated signature",
      fontSize: 16,
      signatureDataUrl: FLATTENED_WHITE_PNG,
    },
    {
      id: "rotation-whiteout",
      type: "whiteout",
      x: 28,
      y: 230,
      width: 150,
      height: 38,
      page: 0,
      fillColor: "#ffffff",
    },
  ];

  const response = await request.post("/api/fill-pdf", {
    headers: qaToken ? { "x-quickfill-qa-token": qaToken } : undefined,
    multipart: {
      pdf: {
        name: source.name,
        mimeType: "application/pdf",
        buffer: source.bytes,
      },
      fields: JSON.stringify(fields),
      pageScales: JSON.stringify([[0, 1]]),
      viewportDims: JSON.stringify([[0, { width: 420, height: 620 }]]),
      hasAcroForm: "false",
    },
  });

  expect(response.status()).toBe(200);
  return {
    output: Buffer.from(await response.body()),
    source,
  };
}

function annotationRect(pdfDoc: PDFDocument, annotation: PDFDict) {
  const rect = pdfDoc.context.lookup(
    annotation.get(PDFName.of("Rect"))!,
    PDFArray,
  );
  return rect.asArray().map((value) => (value as PDFNumber).asNumber()) as [
    number,
    number,
    number,
    number,
  ];
}

function annotationUri(pdfDoc: PDFDocument, annotation: PDFDict) {
  const action = pdfDoc.context.lookup(
    annotation.get(PDFName.of("A"))!,
    PDFDict,
  );
  const uri = action.get(PDFName.of("URI"));
  expect(uri).toBeInstanceOf(PDFString);
  return (uri as PDFString).decodeText();
}

function pageRectToDisplayRect(
  rect: [number, number, number, number],
  rotation: number,
  rawWidth: number,
  rawHeight: number,
) {
  const [left, bottom, right, top] = rect;
  const transformPoint = (x: number, y: number): [number, number] => {
    if (rotation === 90) return [y, rawWidth - x];
    if (rotation === 180) return [rawWidth - x, rawHeight - y];
    if (rotation === 270) return [rawHeight - y, x];
    return [x, y];
  };
  const points = [
    transformPoint(left, bottom),
    transformPoint(left, top),
    transformPoint(right, bottom),
    transformPoint(right, top),
  ];

  return [
    Math.min(...points.map(([x]) => x)),
    Math.min(...points.map(([, y]) => y)),
    Math.max(...points.map(([x]) => x)),
    Math.max(...points.map(([, y]) => y)),
  ] as [number, number, number, number];
}

async function installQaHeaders(page: Page) {
  if (!qaToken) return;
  await page.setExtraHTTPHeaders({ "x-quickfill-qa-token": qaToken });
}

async function installPdfVisualRenderer(page: Page) {
  const pdfjsBrowserPath = join(process.cwd(), "node_modules", "pdfjs-dist", "build", "pdf.mjs");
  await page.route("**/__quickfill-qa/pdf.mjs", (route) => {
    route.fulfill({ path: pdfjsBrowserPath, contentType: "text/javascript" });
  });
  await page.route("**/__quickfill-qa/blank", (route) => {
    route.fulfill({
      body: "<!doctype html><html><body></body></html>",
      contentType: "text/html",
    });
  });
  await page.goto("/__quickfill-qa/blank");
  await page.setContent(`
    <html>
      <body style="margin:0;background:#fff">
        <canvas id="source"></canvas>
        <canvas id="output"></canvas>
        <script type="module">
          import * as pdfjsLib from "/__quickfill-qa/pdf.mjs";
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

          function base64ToBytes(base64) {
            return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
          }

          async function renderToCanvas(canvasId, base64, pageNumber) {
            const doc = await pdfjsLib.getDocument({ data: base64ToBytes(base64) }).promise;
            const page = await doc.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            const canvas = document.getElementById(canvasId);
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context.fillStyle = "#fff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, viewport }).promise;
            return {
              canvas,
              context,
              imageData: context.getImageData(0, 0, canvas.width, canvas.height),
            };
          }

          function isNonWhite(data, index) {
            return data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245;
          }

          window.comparePdfVisuals = async (sourceBase64, outputBase64, pageNumber = 1) => {
            const source = await renderToCanvas("source", sourceBase64, pageNumber);
            const output = await renderToCanvas("output", outputBase64, pageNumber);
            const width = Math.min(source.canvas.width, output.canvas.width);
            const height = Math.min(source.canvas.height, output.canvas.height);
            const sourceData = source.imageData.data;
            const outputData = output.imageData.data;
            let changed = 0;
            let sourceNonWhite = 0;
            let outputNonWhite = 0;
            let deltaSum = 0;
            const sampleStep = 2;
            let samples = 0;

            for (let y = 0; y < height; y += sampleStep) {
              for (let x = 0; x < width; x += sampleStep) {
                const sourceIndex = (y * source.canvas.width + x) * 4;
                const outputIndex = (y * output.canvas.width + x) * 4;
                if (isNonWhite(sourceData, sourceIndex)) sourceNonWhite++;
                if (isNonWhite(outputData, outputIndex)) outputNonWhite++;

                const delta =
                  Math.abs(sourceData[sourceIndex] - outputData[outputIndex]) +
                  Math.abs(sourceData[sourceIndex + 1] - outputData[outputIndex + 1]) +
                  Math.abs(sourceData[sourceIndex + 2] - outputData[outputIndex + 2]);
                deltaSum += delta / 3;
                if (delta > 75) changed++;
                samples++;
              }
            }

            return {
              width,
              height,
              sourceWidth: source.canvas.width,
              sourceHeight: source.canvas.height,
              outputWidth: output.canvas.width,
              outputHeight: output.canvas.height,
              changedRatio: changed / samples,
              meanDelta: deltaSum / samples,
              sourceNonWhiteRatio: sourceNonWhite / samples,
              outputNonWhiteRatio: outputNonWhite / samples,
              sourcePng: source.canvas.toDataURL("image/png"),
              outputPng: output.canvas.toDataURL("image/png"),
            };
          };

          window.locatePdfColor = async (
            outputBase64,
            targetRgb,
            pageNumber = 1,
            tolerance = 6,
          ) => {
            const output = await renderToCanvas("output", outputBase64, pageNumber);
            const data = output.imageData.data;
            let matchedPixels = 0;
            let minX = output.canvas.width;
            let minY = output.canvas.height;
            let maxX = -1;
            let maxY = -1;

            for (let y = 0; y < output.canvas.height; y++) {
              for (let x = 0; x < output.canvas.width; x++) {
                const index = (y * output.canvas.width + x) * 4;
                const matches =
                  Math.abs(data[index] - targetRgb[0]) <= tolerance &&
                  Math.abs(data[index + 1] - targetRgb[1]) <= tolerance &&
                  Math.abs(data[index + 2] - targetRgb[2]) <= tolerance;
                if (!matches) continue;

                matchedPixels++;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              }
            }

            if (matchedPixels === 0) return null;
            return {
              canvasWidth: output.canvas.width,
              canvasHeight: output.canvas.height,
              matchedPixels,
              minX,
              minY,
              maxX,
              maxY,
            };
          };
        </script>
      </body>
    </html>
  `);
  await page.waitForFunction(() => {
    const renderer = window as unknown as {
      comparePdfVisuals?: unknown;
      locatePdfColor?: unknown;
    };
    return (
      typeof renderer.comparePdfVisuals === "function" &&
      typeof renderer.locatePdfColor === "function"
    );
  });
}

async function installPdfTextExtractor(page: Page) {
  const pdfjsBrowserPath = join(process.cwd(), "node_modules", "pdfjs-dist", "build", "pdf.mjs");
  await page.route("**/__quickfill-qa/pdf.mjs", (route) => {
    route.fulfill({ path: pdfjsBrowserPath, contentType: "text/javascript" });
  });
  await page.goto("/");
  await page.setContent(`
    <html>
      <body>
        <script type="module">
          import * as pdfjsLib from "/__quickfill-qa/pdf.mjs";
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

          function base64ToBytes(base64) {
            return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
          }

          window.extractPdfPageTexts = async (base64) => {
            const doc = await pdfjsLib.getDocument({ data: base64ToBytes(base64) }).promise;
            const texts = [];
            for (let i = 1; i <= doc.numPages; i++) {
              const page = await doc.getPage(i);
              const content = await page.getTextContent();
              texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
            }
            return texts;
          };
        </script>
      </body>
    </html>
  `);
  await page.waitForFunction(() => typeof (window as any).extractPdfPageTexts === "function");
}

// Two-page source PDF with known extractable text on both pages.
async function createWhiteoutSourcePdf(): Promise<TestPdf> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageOne = pdfDoc.addPage([612, 792]);
  pageOne.drawText("SECRETCOVEREDTEXT", { x: 48, y: 700, size: 14, font });
  pageOne.drawText("Visible page one context", { x: 48, y: 660, size: 12, font });

  const pageTwo = pdfDoc.addPage([612, 792]);
  pageTwo.drawText("KEEPPAGETWOTEXT", { x: 48, y: 700, size: 14, font });

  const bytes = await pdfDoc.save();
  return { name: "quickfill-qa-whiteout.pdf", bytes: Buffer.from(bytes) };
}

// 1x1 white PNG stand-in for a client-rendered flattened page image.
const FLATTENED_WHITE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function requestWhiteoutExport(
  request: APIRequestContext,
  pdf: TestPdf,
  options: { flattened: boolean },
) {
  const fields = [
    {
      id: "whiteout-1",
      type: "whiteout",
      x: 40,
      y: 80,
      width: 260,
      height: 30,
      page: 0,
      fillColor: "#ffffff",
    },
    {
      id: "overlay-1",
      type: "text",
      x: 48,
      y: 200,
      width: 260,
      height: 24,
      page: 0,
      value: "OVERLAYVISIBLETEXT",
      fontSize: 12,
    },
  ];

  const multipart: Record<string, unknown> = {
    pdf: {
      name: pdf.name,
      mimeType: "application/pdf",
      buffer: pdf.bytes,
    },
    fields: JSON.stringify(fields),
    pageScales: JSON.stringify([[0, 1], [1, 1]]),
    hasAcroForm: "false",
  };
  if (options.flattened) {
    multipart.flattenedPages = JSON.stringify([[0, FLATTENED_WHITE_PNG]]);
  }

  const response = await request.post("/api/fill-pdf", {
    headers: qaToken ? { "x-quickfill-qa-token": qaToken } : undefined,
    multipart: multipart as never,
  });
  expect(response.status()).toBe(200);
  return Buffer.from(await response.body());
}

async function hasCatalogAcroForm(bytes: Buffer) {
  const pdfDoc = await PDFDocument.load(bytes);
  return pdfDoc.catalog.get(PDFName.of("AcroForm")) !== undefined;
}

async function countWidgetAnnotations(bytes: Buffer) {
  const pdfDoc = await PDFDocument.load(bytes);
  let count = 0;
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      try {
        const annot = pdfDoc.context.lookup(annots.get(i), PDFDict);
        if (annot.get(PDFName.of("Subtype"))?.toString() === "/Widget") count++;
      } catch {
        // Ignore malformed non-widget annotations in source PDFs.
      }
    }
  }
  return count;
}

async function uploadPdf(page: Page, pdf: TestPdf, inputIndex: number) {
  await page.locator("input[type='file'][accept*='pdf']").nth(inputIndex).setInputFiles({
    name: pdf.name,
    mimeType: "application/pdf",
    buffer: pdf.bytes,
  });
}

async function uploadMobilePdf(page: Page, pdf: TestPdf) {
  await uploadPdf(page, pdf, 0);
}

async function verifyStaticPdf(bytes: Buffer) {
  const pdfDoc = await PDFDocument.load(bytes);
  const acroForm = pdfDoc.catalog.get(PDFName.of("AcroForm"));
  expect(acroForm).toBeUndefined();

  const annotationCounts = pdfDoc.getPages().map((page) => {
    const annots = page.node.Annots();
    return annots?.size() ?? 0;
  });
  expect(annotationCounts.reduce((sum, count) => sum + count, 0)).toBe(0);
}

async function requestFilledPdf(request: APIRequestContext, pdf: TestPdf) {
  test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run download accuracy checks.");

  const response = await request.post("/api/fill-pdf", {
    headers: qaToken ? { "x-quickfill-qa-token": qaToken } : undefined,
    multipart: {
      pdf: {
        name: pdf.name,
        mimeType: "application/pdf",
        buffer: pdf.bytes,
      },
      fields: JSON.stringify([
        {
          id: "fullName",
          type: "text",
          x: 48,
          y: 650,
          width: 330,
          height: 28,
          page: 0,
          value: "Kyle Stanley",
          fontSize: 12,
        },
        {
          id: "dateOfBirth",
          type: "text",
          x: 48,
          y: 590,
          width: 150,
          height: 28,
          page: 0,
          value: "01/02/1989",
          fontSize: 12,
        },
        {
          id: "taxFileNumber",
          type: "text",
          x: 48,
          y: 530,
          width: 210,
          height: 28,
          page: 0,
          value: "123456789",
          fontSize: 12,
        },
        {
          id: "confirmed",
          type: "checkbox",
          x: 48,
          y: 500,
          width: 20,
          height: 20,
          page: 0,
          checked: true,
        },
      ]),
      pageScales: JSON.stringify([]),
      viewportDims: JSON.stringify([[0, { width: 612, height: 792 }]]),
      hasAcroForm: "true",
    },
  });

  expect(response.status()).toBe(200);
  const body = await response.body();
  expect(body.length).toBeGreaterThan(1000);
  return body;
}

async function exportTemplatePdf(request: APIRequestContext, pdf: TestPdf) {
  test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run real template export checks.");
  const hasAcroForm = await hasCatalogAcroForm(pdf.bytes);

  const response = await request.post("/api/fill-pdf", {
    headers: qaToken ? { "x-quickfill-qa-token": qaToken } : undefined,
    multipart: {
      pdf: {
        name: pdf.name,
        mimeType: "application/pdf",
        buffer: pdf.bytes,
      },
      fields: JSON.stringify([]),
      pageScales: JSON.stringify([]),
      viewportDims: JSON.stringify([]),
      hasAcroForm: String(hasAcroForm),
    },
  });

  expect(response.status(), `${pdf.name} should export successfully`).toBe(200);
  const body = await response.body();
  expect(body.length, `${pdf.name} should not return an empty PDF`).toBeGreaterThan(1000);

  const resultDoc = await PDFDocument.load(body);
  expect(resultDoc.getPageCount(), `${pdf.name} should keep its pages`).toBeGreaterThan(0);
  expect(resultDoc.catalog.get(PDFName.of("AcroForm")), `${pdf.name} should export as a static PDF`).toBeUndefined();
  if (hasAcroForm) {
    expect(await countWidgetAnnotations(body), `${pdf.name} should not keep widget annotations`).toBe(0);
  }

  return body;
}

function pngBufferFromDataUrl(dataUrl: string) {
  const prefix = "data:image/png;base64,";
  expect(dataUrl.startsWith(prefix)).toBe(true);
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

function pdfVisualMetricsReport(metrics: PdfVisualMetrics) {
  return {
    width: metrics.width,
    height: metrics.height,
    sourceWidth: metrics.sourceWidth,
    sourceHeight: metrics.sourceHeight,
    outputWidth: metrics.outputWidth,
    outputHeight: metrics.outputHeight,
    changedRatio: metrics.changedRatio,
    meanDelta: metrics.meanDelta,
    sourceNonWhiteRatio: metrics.sourceNonWhiteRatio,
    outputNonWhiteRatio: metrics.outputNonWhiteRatio,
    thresholds: visualThresholds,
  };
}

function pdfVisualMetricsFailed(metrics: PdfVisualMetrics) {
  return (
    metrics.width <= visualThresholds.minWidth ||
    metrics.height <= visualThresholds.minHeight ||
    metrics.sourceNonWhiteRatio <= visualThresholds.minNonWhiteRatio ||
    metrics.outputNonWhiteRatio <= visualThresholds.minNonWhiteRatio ||
    metrics.meanDelta >= visualThresholds.maxMeanDelta ||
    metrics.changedRatio >= visualThresholds.maxChangedRatio
  );
}

async function attachPdfVisualDebug(testInfo: TestInfo, templateFile: string, metrics: PdfVisualMetrics) {
  const artifactName = templateFile.replace(/\.pdf$/i, "");
  await testInfo.attach(`${artifactName}-visual-metrics.json`, {
    body: Buffer.from(JSON.stringify(pdfVisualMetricsReport(metrics), null, 2)),
    contentType: "application/json",
  });
  await testInfo.attach(`${artifactName}-source-page-1.png`, {
    body: pngBufferFromDataUrl(metrics.sourcePng),
    contentType: "image/png",
  });
  await testInfo.attach(`${artifactName}-output-page-1.png`, {
    body: pngBufferFromDataUrl(metrics.outputPng),
    contentType: "image/png",
  });
}

async function comparePdfVisuals(
  page: Page,
  sourceBytes: Buffer,
  outputBytes: Buffer,
  pageNumber = 1,
): Promise<PdfVisualMetrics> {
  return page.evaluate(
    ({ sourceBase64, outputBase64, targetPageNumber }) => {
      return (window as unknown as {
        comparePdfVisuals: (
          sourceBase64: string,
          outputBase64: string,
          pageNumber: number,
        ) => Promise<PdfVisualMetrics>;
      }).comparePdfVisuals(sourceBase64, outputBase64, targetPageNumber);
    },
    {
      sourceBase64: sourceBytes.toString("base64"),
      outputBase64: outputBytes.toString("base64"),
      targetPageNumber: pageNumber,
    }
  );
}

async function locatePdfColor(
  page: Page,
  outputBytes: Buffer,
  targetRgb: readonly [number, number, number],
): Promise<PdfColorBounds | null> {
  return page.evaluate(
    ({ outputBase64, rgbTarget }) => {
      return (window as unknown as {
        locatePdfColor: (
          outputBase64: string,
          targetRgb: readonly [number, number, number],
        ) => Promise<PdfColorBounds | null>;
      }).locatePdfColor(outputBase64, rgbTarget);
    },
    {
      outputBase64: outputBytes.toString("base64"),
      rgbTarget: targetRgb,
    },
  );
}

test.describe("PDF accuracy pack", () => {
  let redisStub: Server | undefined;
  let executedPdfTests = 0;
  let skippedPdfTests = 0;

  test.beforeAll(async () => {
    executedPdfTests = 0;
    skippedPdfTests = 0;
    if (enforceQaToken) redisStub = await startEnforcedRedisStub();
  });

  test.afterEach(({}, testInfo) => {
    executedPdfTests++;
    if (testInfo.status === "skipped") skippedPdfTests++;
  });

  test.afterAll(async () => {
    await stopEnforcedRedisStub(redisStub);
    if (enforceQaToken) {
      console.log(
        `PDF accuracy enforcement: executed=${executedPdfTests}, skipped=${skippedPdfTests}`,
      );
      expect(
        executedPdfTests,
        "Enforced PDF QA must execute the deliberate 26-test pack",
      ).toBe(expectedEnforcedPdfTestCount);
      expect(
        skippedPdfTests,
        "Enforced PDF QA must not skip any PDF accuracy test",
      ).toBe(0);
    }
  });

  test("rotation landmark corpus preserves rendered parity at 0, 90, 180, and 270 degrees", async ({
    page,
    request,
  }) => {
    test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run rotation landmark checks.");
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const externalRequests: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.origin !== configuredPdfQaOrigin
      ) {
        externalRequests.push(`${request.method()} ${request.url()}`);
      }
    });
    await installPdfVisualRenderer(page);

    for (const rotation of [0, 90, 180, 270] as const) {
      const pdf = await createRotationLandmarkPdf(
        `quickfill-qa-rotation-${rotation}.pdf`,
        [{ rotation, width: rotation % 180 === 0 ? 420 : 620, height: rotation % 180 === 0 ? 620 : 420 }],
      );
      const exported = await exportTemplatePdf(request, pdf);
      const resultDoc = await PDFDocument.load(exported);
      const expectedRotation = rotationSafeDownloadEnabled ? rotation : 0;

      expect(
        resultDoc.getPages()[0].getRotation().angle,
        `${rotation}° fixture should follow the exact-value rollout mode`,
      ).toBe(expectedRotation);

      if (rotationSafeDownloadEnabled || rotation === 0) {
        const metrics = await comparePdfVisuals(page, pdf.bytes, exported);
        expect(metrics.outputWidth, `${rotation}° output viewport width`).toBe(metrics.sourceWidth);
        expect(metrics.outputHeight, `${rotation}° output viewport height`).toBe(metrics.sourceHeight);
        expect(metrics.meanDelta, `${rotation}° landmark mean delta`).toBeLessThan(
          visualThresholds.maxMeanDelta,
        );
        expect(metrics.changedRatio, `${rotation}° landmark changed area`).toBeLessThan(
          visualThresholds.maxChangedRatio,
        );
      }
    }

    expect(externalRequests, "Rotation rendering must stay on the QA origin").toEqual([]);
    expect(pageErrors, "Unexpected rotation-rendering page errors").toEqual([]);
    expect(consoleErrors, "Unexpected rotation-rendering console errors").toEqual([]);
  });

  test("mixed 0 and 90 degree pages preserve rotation with different raw page sizes", async ({
    page,
    request,
  }) => {
    test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run mixed rotation checks.");
    await installPdfVisualRenderer(page);
    const pdf = await createRotationLandmarkPdf(
      "quickfill-qa-mixed-rotation-sizes.pdf",
      [
        { rotation: 0, width: 460, height: 680 },
        { rotation: 90, width: 720, height: 390 },
      ],
    );
    const exported = await exportTemplatePdf(request, pdf);
    const resultDoc = await PDFDocument.load(exported);
    const resultPages = resultDoc.getPages();

    expect(resultPages).toHaveLength(2);
    expect(resultPages[0].getWidth()).toBe(460);
    expect(resultPages[0].getHeight()).toBe(680);
    expect(resultPages[1].getWidth()).toBe(720);
    expect(resultPages[1].getHeight()).toBe(390);
    expect(resultPages.map((resultPage) => resultPage.getRotation().angle)).toEqual(
      rotationSafeDownloadEnabled ? [0, 90] : [0, 0],
    );

    if (rotationSafeDownloadEnabled) {
      for (const pageNumber of [1, 2]) {
        const metrics = await comparePdfVisuals(page, pdf.bytes, exported, pageNumber);
        expect(metrics.outputWidth).toBe(metrics.sourceWidth);
        expect(metrics.outputHeight).toBe(metrics.sourceHeight);
        expect(metrics.meanDelta).toBeLessThan(visualThresholds.maxMeanDelta);
        expect(metrics.changedRatio).toBeLessThan(visualThresholds.maxChangedRatio);
      }
    }
  });

  test("rotated API placement covers field types and rendered 90/180 positions", async ({
    page,
    request,
  }) => {
    const { output } = await requestRotatedFieldExport(request);
    const outputDoc = await PDFDocument.load(output);
    const outputPage = outputDoc.getPages()[0];
    const decodedStreams = await decodedPdfStreams(output);
    const markerHex = Buffer.from("ROTATEDFIELDMARKER", "latin1")
      .toString("hex")
      .toLowerCase();

    expect(outputPage.getRotation().angle).toBe(
      rotationSafeDownloadEnabled ? 90 : 0,
    );
    expect(decodedStreams.toLowerCase()).toContain(markerHex);
    expect(output.toString("latin1")).toContain("/Subtype /Image");
    expect(decodedStreams).toContain("W*");
    expect(decodedStreams).toMatch(/\nf\n/);
    if (rotationSafeDownloadEnabled) {
      expect(decodedStreams).toContain("0 1 -1 0 620 0 cm");
    } else {
      expect(decodedStreams).not.toContain("0 1 -1 0 620 0 cm");
    }

    if (rotationSafeDownloadEnabled) {
      await installPdfVisualRenderer(page);
      for (const rotation of [90, 180] as const) {
        const positionedOutput = await requestRotatedPositionExport(
          request,
          rotation,
        );
        const positionedDoc = await PDFDocument.load(positionedOutput);
        expect(positionedDoc.getPages()[0].getRotation().angle).toBe(rotation);

        const bounds = await locatePdfColor(
          page,
          positionedOutput,
          fieldPositionLandmark.rgb,
        );
        expect(bounds, `${rotation}° field color should render`).not.toBeNull();
        const located = bounds!;
        const expectedCanvas =
          rotation === 90
            ? { width: 420, height: 620 }
            : { width: 620, height: 420 };
        expect(located.canvasWidth).toBe(expectedCanvas.width);
        expect(located.canvasHeight).toBe(expectedCanvas.height);
        expect(
          Math.abs(located.minX - fieldPositionLandmark.x),
          `${rotation}° field left edge`,
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(located.minY - fieldPositionLandmark.y),
          `${rotation}° field top edge`,
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(
            located.maxX -
              (fieldPositionLandmark.x + fieldPositionLandmark.width - 1),
          ),
          `${rotation}° field right edge`,
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(
            located.maxY -
              (fieldPositionLandmark.y + fieldPositionLandmark.height - 1),
          ),
          `${rotation}° field bottom edge`,
        ).toBeLessThanOrEqual(2);
        expect(located.matchedPixels).toBeGreaterThan(
          (fieldPositionLandmark.width - 4) *
            (fieldPositionLandmark.height - 4),
        );
      }
    }
  });

  test("free rotated output keeps watermarks on displayed edges with clickable links", async () => {
    const pdf = await createRotationLandmarkPdf(
      "quickfill-qa-rotated-free-watermark.pdf",
      [{ rotation: 90, width: 620, height: 420 }],
    );
    const sourceDoc = await PDFDocument.load(pdf.bytes);
    const resultBytes = await finalizePdfForDownload(sourceDoc, false);
    const resultDoc = await PDFDocument.load(resultBytes);
    const resultPage = resultDoc.getPages()[0];
    const annotations = resultPage.node.Annots();

    expect(resultPage.getRotation().angle).toBe(
      rotationSafeDownloadEnabled ? 90 : 0,
    );
    expect(annotations).toBeDefined();
    expect(annotations!.size()).toBe(2);

    const displayRects: [number, number, number, number][] = [];
    for (const annotationRef of annotations!.asArray()) {
      const annotation = resultDoc.context.lookup(annotationRef, PDFDict);
      expect(annotationUri(resultDoc, annotation)).toBe(WATERMARK_URL);
      if (rotationSafeDownloadEnabled) {
        displayRects.push(
          pageRectToDisplayRect(
            annotationRect(resultDoc, annotation),
            90,
            620,
            420,
          ),
        );
      }
    }

    if (rotationSafeDownloadEnabled) {
      displayRects.sort((left, right) => left[1] - right[1]);
      expect(displayRects[0][1]).toBeLessThan(12);
      expect(displayRects[0][3]).toBeLessThan(24);
      expect(displayRects[1][1]).toBeGreaterThan(600);
      expect(displayRects[1][3]).toBeLessThanOrEqual(620);
    }
  });

  test("Pro rotated output remains clean", async () => {
    const pdf = await createRotationLandmarkPdf(
      "quickfill-qa-rotated-pro.pdf",
      [{ rotation: 270, width: 620, height: 420 }],
    );
    const sourceDoc = await PDFDocument.load(pdf.bytes);
    const resultBytes = await finalizePdfForDownload(sourceDoc, true);
    const resultDoc = await PDFDocument.load(resultBytes);
    const resultPage = resultDoc.getPages()[0];

    expect(resultPage.getRotation().angle).toBe(
      rotationSafeDownloadEnabled ? 270 : 0,
    );
    expect(resultPage.node.Annots()).toBeUndefined();
  });

  test("mixed-rotation upload stays overflow-free on desktop and mobile", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await installQaHeaders(page);
    const pdf = await createRotationLandmarkPdf(
      "quickfill-qa-responsive-rotations.pdf",
      [
        { rotation: 0, width: 460, height: 680 },
        { rotation: 90, width: 720, height: 390 },
      ],
    );

    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto("/editor?advanced=1");
    await page.evaluate(() => localStorage.clear());
    await uploadPdf(page, pdf, 1);
    await expect(page.getByText(pdf.name)).toBeVisible({ timeout: 15000 });
    await expect(page.locator("canvas").first()).toBeVisible();
    let overflow = await page
      .locator("body")
      .evaluate((body) => body.scrollWidth - body.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/editor");
    await page.evaluate(() => localStorage.clear());
    await uploadMobilePdf(page, pdf);
    await expect(page.getByText(pdf.name)).toBeVisible({ timeout: 15000 });
    overflow = await page
      .locator("body")
      .evaluate((body) => body.scrollWidth - body.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    expect(pageErrors, "Unexpected responsive-flow page errors").toEqual([]);
  });

  test("server output is static and removes widget noise for an AcroForm", async ({ request }) => {
    const pdf = await createAcroFormPdf();
    const body = await requestFilledPdf(request, pdf);
    await verifyStaticPdf(body);
  });

  test("flattened whiteout removes covered text from pdf.js extraction", async ({ page, request }) => {
    test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run download accuracy checks.");

    const pdf = await createWhiteoutSourcePdf();

    // Control export (no flattened image): extractor must still see the text,
    // proving the extraction harness works and the vector fallback keeps it.
    const controlBytes = await requestWhiteoutExport(request, pdf, { flattened: false });
    // Flattened export: page one content is replaced with the burned-in image.
    const flattenedBytes = await requestWhiteoutExport(request, pdf, { flattened: true });

    await installPdfTextExtractor(page);

    const controlTexts = await page.evaluate(
      (base64) => (window as unknown as {
        extractPdfPageTexts: (b64: string) => Promise<string[]>;
      }).extractPdfPageTexts(base64),
      controlBytes.toString("base64"),
    );
    expect(controlTexts[0]).toContain("SECRETCOVEREDTEXT");

    const flattenedTexts = await page.evaluate(
      (base64) => (window as unknown as {
        extractPdfPageTexts: (b64: string) => Promise<string[]>;
      }).extractPdfPageTexts(base64),
      flattenedBytes.toString("base64"),
    );

    // Covered original text must no longer be extractable on the flattened page.
    expect(flattenedTexts[0]).not.toContain("SECRETCOVEREDTEXT");
    // User-added overlay text stays extractable because it is drawn as text.
    expect(flattenedTexts[0]).toContain("OVERLAYVISIBLETEXT");
    // Non-whiteout pages keep their original extractable text.
    expect(flattenedTexts[1]).toContain("KEEPPAGETWOTEXT");

    // Output must still be a valid, static PDF.
    await verifyStaticPdf(flattenedBytes);
  });

  test("mobile AcroForm flow can fill and download", async ({ page }) => {
    test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run mobile download checks.");

    await installQaHeaders(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/editor");
    await page.evaluate(() => localStorage.clear());

    const pdf = await createAcroFormPdf();
    await uploadMobilePdf(page, pdf);

    await expect(page.getByText(pdf.name)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/0 of 4 filled/i)).toBeVisible();

    const inputs = page.locator("input[type='text']:visible");
    await expect(inputs).toHaveCount(4);
    await inputs.nth(0).fill("Kyle Stanley");
    await inputs.nth(1).fill("01/02/1989");
    await inputs.nth(2).fill("123456789");
    await inputs.nth(3).fill("Yes");
    await expect(page.getByText(/4 of 4 filled/i)).toBeVisible();

    const overflow = await page.locator("body").evaluate((body) => body.scrollWidth - body.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download(?: filled)? pdf/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("quickfill-qa-acroform-filled.pdf");

    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test("mobile flat PDF flow points users to the full editor", async ({ page }) => {
    await installQaHeaders(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/editor");
    await page.evaluate(() => localStorage.clear());

    const pdf = await createFlatPdf();
    await uploadMobilePdf(page, pdf);

    await expect(page.getByText("Need to place fields manually?")).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: /open full editor/i }).click();
    await expect(page).toHaveURL(/advanced=1/);
    await expect(page.getByRole("button", { name: "Text" })).toBeVisible();
  });

  test("desktop upload prompt shows the PDF upload limit", async ({ page }) => {
    await installQaHeaders(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto("/editor?advanced=1");

    await expect(page.getByText(`Upload a PDF, JPG, or PNG. Up to ${PDF_UPLOAD_MAX_LABEL}.`).last()).toBeVisible();
  });

  test("desktop upload renders the full editor without page overflow", async ({ page }) => {
    await installQaHeaders(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto("/editor?advanced=1");
    await page.evaluate(() => localStorage.clear());

    const pdf = await createAcroFormPdf();
    await uploadPdf(page, pdf, 1);

    await expect(page.getByText(pdf.name)).toBeVisible({ timeout: 15000 });
    await expect(page.locator("canvas").first()).toBeVisible();
    const overflow = await page.locator("body").evaluate((body) => body.scrollWidth - body.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test.describe("real template exports", () => {
    for (const templateFile of realTemplateFiles) {
      test(`${templateFile} exports cleanly`, async ({ request }) => {
        const pdf = await loadTemplatePdf(templateFile);
        await exportTemplatePdf(request, pdf);
      });
    }
  });

  test("visual export smoke keeps key templates readable", async ({ page, request }, testInfo) => {
    test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run visual PDF checks.");
    await installPdfVisualRenderer(page);

    for (const templateFile of visualTemplateFiles) {
      const pdf = await loadTemplatePdf(templateFile);
      const exported = await exportTemplatePdf(request, pdf);
      const metrics = await comparePdfVisuals(page, pdf.bytes, exported);

      if (pdfVisualMetricsFailed(metrics)) {
        await attachPdfVisualDebug(testInfo, templateFile, metrics);
      }

      expect(metrics.width, `${templateFile} should render with page width`).toBeGreaterThan(visualThresholds.minWidth);
      expect(metrics.height, `${templateFile} should render with page height`).toBeGreaterThan(visualThresholds.minHeight);
      expect(metrics.sourceNonWhiteRatio, `${templateFile} source should not be blank`).toBeGreaterThan(visualThresholds.minNonWhiteRatio);
      expect(metrics.outputNonWhiteRatio, `${templateFile} output should not be blank`).toBeGreaterThan(visualThresholds.minNonWhiteRatio);
      expect(metrics.meanDelta, `${templateFile} visual output drift is too high`).toBeLessThan(visualThresholds.maxMeanDelta);
      expect(metrics.changedRatio, `${templateFile} visual changed area is too high`).toBeLessThan(visualThresholds.maxChangedRatio);
    }
  });

  test("homepage template links point to real PDFs", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.getByText("Superannuation Standard Choice")).toBeVisible();

    for (const templateFile of realTemplateFiles.slice(0, 6)) {
      const response = await page.request.get(`/templates/${templateFile}`);
      expect(response.status(), `${templateFile} should be downloadable`).toBe(200);
      expect(response.headers()["content-type"] ?? "").toContain("application/pdf");
      const body = await response.body();
      expect(body.length).toBeGreaterThan(1000);
    }
  });
});
