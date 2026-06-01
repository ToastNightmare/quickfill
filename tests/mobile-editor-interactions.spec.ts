import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const localBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const runsAgainstLocalApp = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(localBaseUrl);

async function createMobileEditorPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText("QuickFill mobile editor regression", {
    x: 48,
    y: 730,
    size: 18,
    font,
    color: rgb(0.05, 0.08, 0.15),
  });
  page.drawRectangle({
    x: 48,
    y: 650,
    width: 240,
    height: 28,
    borderWidth: 1,
    borderColor: rgb(0.1, 0.1, 0.1),
  });

  return Buffer.from(await pdfDoc.save());
}

async function tapPdfPoint(page: Page, xOffset: number, yOffset: number) {
  const pageBox = await page.getByTestId("pdf-page").boundingBox();
  expect(pageBox).not.toBeNull();
  await page.touchscreen.tap(pageBox!.x + xOffset, pageBox!.y + yOffset);
}

test.describe("mobile editor field interactions", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");

  test("text fields can be placed, reselected, edited, deleted, and placed again on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/editor?advanced=1");
    await page.evaluate(() => {
      localStorage.setItem("qf_welcome_dismissed", "1");
      localStorage.setItem("quickfill_welcomed", "1");
      localStorage.setItem("quickfill_tour_done", "1");
    });

    await page.locator("input[type='file']").setInputFiles({
      name: "mobile-editor-regression.pdf",
      mimeType: "application/pdf",
      buffer: await createMobileEditorPdf(),
    });

    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => document.querySelectorAll("canvas").length >= 2);

    const textTool = page.locator('button[title="Text field: tap or drag to place"]').last();
    await textTool.click();
    await tapPdfPoint(page, 80, 112);
    await expect(page.getByTestId("mobile-field-sheet")).toBeVisible();
    await expect(page.getByTestId("pdf-field-editor")).toHaveCount(0);

    await tapPdfPoint(page, 24, 24);
    await expect(page.getByTestId("mobile-field-sheet")).toBeHidden();

    await tapPdfPoint(page, 118, 124);
    await expect(page.getByTestId("mobile-field-sheet")).toBeVisible();

    await page.getByTestId("mobile-field-edit").click();
    await expect(page.getByTestId("pdf-field-editor")).toBeVisible();
    await page.getByTestId("pdf-field-editor").fill("Mobile test");
    await page.keyboard.press("Enter");

    await page.getByTestId("mobile-field-delete").click();
    await expect(page.getByTestId("mobile-field-sheet")).toBeHidden();

    await textTool.click();
    await tapPdfPoint(page, 96, 170);
    await expect(page.getByTestId("mobile-field-sheet")).toBeVisible();
    await tapPdfPoint(page, 24, 24);
    await expect(page.getByTestId("mobile-field-sheet")).toBeHidden();
    await tapPdfPoint(page, 134, 182);
    await expect(page.getByTestId("mobile-field-sheet")).toBeVisible();
  });
});
