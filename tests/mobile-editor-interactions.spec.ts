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

async function seedRestoredEditorPdf(page: Page, name: string) {
  const pdfBytes = Array.from(await createMobileEditorPdf());
  await page.goto("/");
  await page.evaluate(
    async ({ bytes, fileName }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("quickfill_db", 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("pdfs")) db.createObjectStore("pdfs");
          if (!db.objectStoreNames.contains("current_pdf_timestamp")) {
            db.createObjectStore("current_pdf_timestamp");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["pdfs", "current_pdf_timestamp"], "readwrite");
          tx.objectStore("pdfs").put(new Uint8Array(bytes).buffer, "current_pdf");
          tx.objectStore("current_pdf_timestamp").put(Date.now(), "current_pdf_timestamp");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });

      localStorage.setItem("quickfill_filename", fileName);
      localStorage.setItem("quickfill_page", "0");
      localStorage.setItem("quickfill_fields", "[]");
      localStorage.setItem("qf_welcome_dismissed", "1");
      localStorage.setItem("quickfill_welcomed", "1");
      localStorage.setItem("quickfill_tour_done", "1");
    },
    { bytes: pdfBytes, fileName: name }
  );
}

async function uploadEditorPdf(page: Page, name: string) {
  await page.locator("input[type='file'][accept='application/pdf,.pdf']").last().setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: await createMobileEditorPdf(),
  });
}

test.describe("mobile editor field interactions", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");

  test.describe("field placement", () => {
    test.use({ hasTouch: true });

    test("text fields can be placed, edited, deleted, and placed again on mobile", async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 900 });
      await seedRestoredEditorPdf(page, "mobile-editor-regression.pdf");
      await page.goto("/editor?advanced=1");

      await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId("pdf-page")).toBeVisible();
      await page.waitForFunction(() => document.querySelectorAll("canvas").length >= 2);

      const textTool = page.locator('button[title="Text field: tap or drag to place"]').last();
      await textTool.click();
      await tapPdfPoint(page, 80, 112);
      await expect(page.getByTestId("mobile-field-sheet")).toBeVisible();
      await expect(page.getByTestId("pdf-field-editor")).toHaveCount(0);

      await page.getByTestId("mobile-field-edit").click();
      await expect(page.getByTestId("pdf-field-editor")).toBeVisible();
      await page.getByTestId("pdf-field-editor").fill("Mobile test");
      await page.keyboard.press("Enter");

      await page.getByTestId("mobile-field-delete").click();
      await expect(page.getByTestId("mobile-field-sheet")).toBeHidden();

      await textTool.click();
      await tapPdfPoint(page, 96, 170);
      await expect(page.getByTestId("mobile-field-sheet")).toBeVisible();
    });
  });

  test("mobile upload copy avoids stale detection and form-specific wording", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/editor");

    await expect(page.getByRole("heading", { name: "Finish paperwork fast" })).toBeVisible();
    await expect(page.getByText("Upload a PDF, add text, ticks, signatures, and dates, then download your finished document.")).toBeVisible();
    await expect(page.getByText("Everyday paperwork")).toBeVisible();
    await expect(page.getByText("Applications")).toBeVisible();
    await expect(page.getByText("Agreements")).toBeVisible();
    await expect(page.getByText("Worksheets")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose PDF" })).toBeVisible();
    await expect(page.getByText("Drag & drop your PDF here")).toBeHidden();
    await expect(page.locator("input[type='file'][accept='application/pdf,.pdf']")).toBeHidden();
    await expect(page.getByText(/detected fields/i)).toHaveCount(0);
    await expect(page.getByText(/Tax and government forms/i)).toHaveCount(0);
  });

  test("loaded PDF stays visible when resizing from desktop to mobile", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/editor");
    await expect(page.getByText("Drag & drop your PDF here")).toBeVisible();

    await uploadEditorPdf(page, "mobile-editor-continuity.pdf");

    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("pdf-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose PDF" })).toHaveCount(0);
    await expect(page.getByText("Finish paperwork fast")).toHaveCount(0);
  });

  test("advanced mobile shows the full editor upload path", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/editor?advanced=1");

    await expect(page.getByText("Drag & drop your PDF here")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("input[type='file'][accept='application/pdf,.pdf']")).toHaveCount(1);
    await expect(page.getByText("Finish paperwork fast")).toBeHidden();
    await expect(page.getByRole("button", { name: "Choose PDF" })).toBeHidden();
  });

});
