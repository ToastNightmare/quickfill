import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type TestPdf = {
  name: string;
  bytes: Buffer;
};

const qaToken = process.env.QUICKFILL_QA_TOKEN;
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
            };
          };
        </script>
      </body>
    </html>
  `);
  await page.waitForFunction(() => typeof (window as any).comparePdfVisuals === "function");
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
  await page.locator("input[type='file']").nth(inputIndex).setInputFiles({
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

async function comparePdfVisuals(page: Page, sourceBytes: Buffer, outputBytes: Buffer) {
  return page.evaluate(
    ({ sourceBase64, outputBase64 }) => {
      return (window as unknown as {
        comparePdfVisuals: (sourceBase64: string, outputBase64: string) => Promise<Record<string, number>>;
      }).comparePdfVisuals(sourceBase64, outputBase64);
    },
    { sourceBase64: sourceBytes.toString("base64"), outputBase64: outputBytes.toString("base64") }
  );
}

test.describe("PDF accuracy pack", () => {
  test("server output is static and removes widget noise for an AcroForm", async ({ request }) => {
    const pdf = await createAcroFormPdf();
    const body = await requestFilledPdf(request, pdf);
    await verifyStaticPdf(body);
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
    await page.getByRole("button", { name: /download filled pdf/i }).click();
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

    await expect(page.getByText("Flat PDF detected")).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: /open full editor/i }).click();
    await expect(page).toHaveURL(/advanced=1/);
    await expect(page.getByText("PDF files only, up to 50MB").last()).toBeVisible();
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

  test("visual export smoke keeps key templates readable", async ({ page, request }) => {
    test.skip(!qaToken, "Set QUICKFILL_QA_TOKEN to run visual PDF checks.");
    await installPdfVisualRenderer(page);

    for (const templateFile of visualTemplateFiles) {
      const pdf = await loadTemplatePdf(templateFile);
      const exported = await exportTemplatePdf(request, pdf);
      const metrics = await comparePdfVisuals(page, pdf.bytes, exported);

      expect(metrics.width, `${templateFile} should render with page width`).toBeGreaterThan(300);
      expect(metrics.height, `${templateFile} should render with page height`).toBeGreaterThan(500);
      expect(metrics.sourceNonWhiteRatio, `${templateFile} source should not be blank`).toBeGreaterThan(0.01);
      expect(metrics.outputNonWhiteRatio, `${templateFile} output should not be blank`).toBeGreaterThan(0.01);
      expect(metrics.meanDelta, `${templateFile} visual output drift is too high`).toBeLessThan(12);
      expect(metrics.changedRatio, `${templateFile} visual changed area is too high`).toBeLessThan(0.08);
    }
  });

  test("homepage template links point to real PDFs", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.getByText("Tax File Number Declaration")).toBeVisible();

    for (const templateFile of realTemplateFiles.slice(0, 6)) {
      const response = await page.request.get(`/templates/${templateFile}`);
      expect(response.status(), `${templateFile} should be downloadable`).toBe(200);
      expect(response.headers()["content-type"] ?? "").toContain("application/pdf");
      const body = await response.body();
      expect(body.length).toBeGreaterThan(1000);
    }
  });
});
