import { test, expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { PDF_UPLOAD_MAX_LABEL } from "../src/lib/upload-limits";

type TestPdf = {
  name: string;
  bytes: Buffer;
};

type PdfVisualMetrics = {
  width: number;
  height: number;
  changedRatio: number;
  meanDelta: number;
  sourceNonWhiteRatio: number;
  outputNonWhiteRatio: number;
  sourcePng: string;
  outputPng: string;
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
const enforcedBaseUrl = "http://localhost:3000";
const enforcedRedisUrl = "http://127.0.0.1:38079";

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

async function installQaHeaders(page: Page) {
  if (!qaToken) return;
  await page.setExtraHTTPHeaders({ "x-quickfill-qa-token": qaToken });
}

async function installPdfVisualRenderer(page: Page) {
  const pdfjsBrowserPath = join(process.cwd(), "node_modules", "pdfjs-dist", "build", "pdf.mjs");
  await page.route("**/__quickfill-qa/pdf.mjs", (route) => {
    route.fulfill({ path: pdfjsBrowserPath, contentType: "text/javascript" });
  });
  await page.goto("/");
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

          async function renderToCanvas(canvasId, base64) {
            const doc = await pdfjsLib.getDocument({ data: base64ToBytes(base64) }).promise;
            const page = await doc.getPage(1);
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

          window.comparePdfVisuals = async (sourceBase64, outputBase64) => {
            const source = await renderToCanvas("source", sourceBase64);
            const output = await renderToCanvas("output", outputBase64);
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
              changedRatio: changed / samples,
              meanDelta: deltaSum / samples,
              sourceNonWhiteRatio: sourceNonWhite / samples,
              outputNonWhiteRatio: outputNonWhite / samples,
              sourcePng: source.canvas.toDataURL("image/png"),
              outputPng: output.canvas.toDataURL("image/png"),
            };
          };
        </script>
      </body>
    </html>
  `);
  await page.waitForFunction(() => typeof (window as any).comparePdfVisuals === "function");
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

async function comparePdfVisuals(page: Page, sourceBytes: Buffer, outputBytes: Buffer): Promise<PdfVisualMetrics> {
  return page.evaluate(
    ({ sourceBase64, outputBase64 }) => {
      return (window as unknown as {
        comparePdfVisuals: (sourceBase64: string, outputBase64: string) => Promise<PdfVisualMetrics>;
      }).comparePdfVisuals(sourceBase64, outputBase64);
    },
    { sourceBase64: sourceBytes.toString("base64"), outputBase64: outputBytes.toString("base64") }
  );
}

test.describe("PDF accuracy pack", () => {
  let redisStub: Server | undefined;

  test.beforeAll(async () => {
    if (enforceQaToken) redisStub = await startEnforcedRedisStub();
  });

  test.afterAll(async () => {
    await stopEnforcedRedisStub(redisStub);
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
