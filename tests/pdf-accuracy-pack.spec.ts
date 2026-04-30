import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";

type TestPdf = {
  name: string;
  bytes: Buffer;
};

const qaToken = process.env.QUICKFILL_QA_TOKEN;

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
});
