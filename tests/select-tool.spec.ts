import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function prepareEditor(page: Page) {
  await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/editor\?advanced=1$/);
  await expect(page.getByText("Upload a PDF, JPG, or PNG. Up to 15MB.")).toBeVisible();
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("qf_welcome_dismissed", "1");
    localStorage.setItem("quickfill_welcomed", "1");
    localStorage.setItem("quickfill_tour_done", "1");
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("quickfill_db");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
}

async function createPdfFixture() {
  const pdfDocument = await PDFDocument.create();
  const pdfPage = pdfDocument.addPage([612, 792]);
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
  pdfPage.drawText("QuickFill select tool regression", {
    x: 48,
    y: 730,
    size: 18,
    font,
    color: rgb(0.05, 0.08, 0.15),
  });
  return Buffer.from(await pdfDocument.save());
}

async function uploadPdf(page: Page) {
  const input = page.getByTestId("document-upload-input");
  await expect(input).toBeAttached();
  await input.setInputFiles({
    name: "select-tool.pdf",
    mimeType: "application/pdf",
    buffer: await createPdfFixture(),
  });
}

test.describe("editor select tool", () => {
  test("defaults to Select and keeps selection behavior intact", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await prepareEditor(page);
    await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
    await uploadPdf(page);

    const pdfPage = page.getByTestId("pdf-page");
    await expect(pdfPage).toBeVisible({ timeout: 15_000 });

    const selectTool = page.locator('button[title="Select fields"]').first();
    const textTool = page.locator('button[title="Text field: tap or drag to place"]').first();

    await expect(page.getByText("Select Tool")).toBeVisible();
    await expect(selectTool).toHaveClass(/bg-accent/);

    await textTool.click();
    await expect(textTool).toHaveClass(/bg-accent/);
    await expect(page.getByText("Text Field active")).toBeVisible();

    await selectTool.click();
    await expect(selectTool).toHaveClass(/bg-accent/);
    await expect(page.getByText("Select Tool")).toBeVisible();

    await pdfPage.click({ position: { x: 110, y: 120 } });
    await expect(page.getByTestId("pdf-field-editor")).toHaveCount(0);
    await expect(page.getByText("1 field placed")).toHaveCount(0);

    await textTool.click();
    await pdfPage.click({ position: { x: 120, y: 150 } });
    await expect(page.getByTestId("pdf-field-editor")).toBeVisible();
    await page.getByTestId("pdf-field-editor").fill("Alex");

    await page.keyboard.press("Escape");
    await expect(selectTool).toHaveClass(/bg-accent/);
    await expect(page.getByTestId("pdf-field-editor")).toHaveCount(0);
    await expect(page.getByText("Text Field selected").last()).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const fields = JSON.parse(localStorage.getItem("quickfill_fields") ?? "[]") as Array<{ value?: string }>;
      return fields[0]?.value ?? null;
    })).toBe("Alex");

    await page.keyboard.press("Escape");
    await expect(page.getByText("Select Tool")).toBeVisible();
    await expect(selectTool).toHaveClass(/bg-accent/);

    await pdfPage.click({ position: { x: 125, y: 155 } });
    await expect(page.getByText("Text Field selected").last()).toBeVisible();
    await expect(page.getByTestId("pdf-field-editor")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pdf-field-editor")).toHaveCount(0);
    await expect(page.getByText("Text Field selected").last()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("Select Tool")).toBeVisible();
    await expect(selectTool).toHaveClass(/bg-accent/);
    await expect(page.getByTestId("pdf-field-editor")).toHaveCount(0);
  });
});
