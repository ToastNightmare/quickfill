import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
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

async function tapElement(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function createMobilePhotoFixture(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#1a6fb3";
    context.fillRect(4, 4, 40, 24);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Image fixture generation failed"));
      }, "image/png");
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function prepareEmptyMobileEditor(page: Page) {
  await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
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
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
    await expect(page.getByText("Upload a PDF, JPG, or PNG. Add text, ticks, signatures, and dates, then download your finished document.")).toBeVisible();
    await expect(page.getByText("Everyday paperwork")).toBeVisible();
    await expect(page.getByText("Applications")).toBeVisible();
    await expect(page.getByText("Agreements")).toBeVisible();
    await expect(page.getByText("Worksheets")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose file" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();
    await expect(page.getByText("Drag & drop your PDF here")).toBeHidden();

    const mobilePickerInput = page.locator(
      "input[type='file']:not([capture]):not([data-testid='document-upload-input'])"
    );
    await expect(mobilePickerInput).toHaveCount(1);
    await expect(mobilePickerInput).toBeHidden();
    await expect(mobilePickerInput).toHaveAttribute("accept", /application\/pdf/);
    await expect(mobilePickerInput).toHaveAttribute("accept", /image\/jpeg/);
    await expect(mobilePickerInput).toHaveAttribute("accept", /image\/png/);

    const photoCaptureInput = page.locator('input[type="file"][aria-label="Take photo"]');
    await expect(photoCaptureInput).toHaveCount(1);
    await expect(photoCaptureInput).toBeHidden();
    await expect(photoCaptureInput).toHaveAttribute("accept", /image\/jpeg/);
    await expect(photoCaptureInput).toHaveAttribute("accept", /image\/png/);
    await expect(photoCaptureInput).toHaveAttribute("capture", "environment");

    const fullEditorUploadInput = page.getByTestId("document-upload-input");
    await expect(fullEditorUploadInput).toBeHidden();
    await expect(fullEditorUploadInput).toHaveAttribute("accept", /application\/pdf/);
    await expect(fullEditorUploadInput).toHaveAttribute("accept", /image\/jpeg/);
    await expect(fullEditorUploadInput).toHaveAttribute("accept", /image\/png/);
    await expect(page.getByText(/detected fields/i)).toHaveCount(0);
    await expect(page.getByText(/Tax and government forms/i)).toHaveCount(0);
  });

  test("restored PDF stays visible when resizing from desktop to mobile", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await seedRestoredEditorPdf(page, "mobile-editor-continuity.pdf");
    await page.goto("/editor");

    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("local-save-status")).toHaveText(/Saved locally|Restored locally/);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("pdf-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose file" })).toHaveCount(0);
    await expect(page.getByText("Finish paperwork fast")).toHaveCount(0);
  });

  test("advanced mobile shows the full editor upload path", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/editor?advanced=1");

    await expect(page.getByText("Drag & drop your file here")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Tap to browse your file")).toBeVisible();
    await expect(page.getByText("Finish paperwork fast")).toBeHidden();
    await expect(page.getByText("PDF, JPG, or PNG, up to 15MB")).toBeHidden();
  });

});

test.describe("mobile editor actions", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");
  test.use({ hasTouch: true });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 700 },
  ]) {
    test(`keeps Help and Start Over reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const unexpectedApiCalls: string[] = [];
      const localOrigin = new URL(localBaseUrl).origin;
      const expectedApiPaths = new Set(["/api/analytics", "/api/usage"]);

      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          url.origin === localOrigin &&
          url.pathname.startsWith("/api/") &&
          !expectedApiPaths.has(url.pathname)
        ) {
          unexpectedApiCalls.push(`${request.method()} ${url.pathname}`);
        }
      });

      await prepareEmptyMobileEditor(page);
      await expect(page.getByText("Tap to browse your file")).toBeVisible();
      await page.getByTestId("document-upload-input").setInputFiles({
        name: `mobile-actions-${viewport.width}.png`,
        mimeType: "image/png",
        buffer: await createMobilePhotoFixture(page),
      });

      await expect(page.getByRole("heading", { name: "Clean up photo" })).toBeVisible();
      await page.getByRole("button", { name: "Use photo" }).click();
      await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
      await expectNoHorizontalOverflow(page);

      const actions = page.getByRole("button", { name: "More actions" });
      await expect(actions).toHaveAttribute("aria-expanded", "false");
      await tapElement(page, actions);
      await expect(actions).toHaveAttribute("aria-expanded", "true");
      await tapElement(page, page.getByRole("button", { name: "Help" }));
      await expect(page.getByRole("heading", { name: "Upload or pick a template" })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.getByRole("heading", { name: "Upload or pick a template" })).toHaveCount(0);

      await actions.focus();
      await page.keyboard.press("Enter");
      const startOver = page.getByRole("button", { name: "Start Over" });
      await expect(startOver).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(startOver).toBeFocused();
      await page.keyboard.press("Enter");

      await expect(page.getByTestId("pdf-page")).toHaveCount(0);
      await expect(page.getByText("Tap to browse your file")).toBeVisible();
      await expect(page.getByTestId("document-upload-input")).toBeAttached();
      await expectNoHorizontalOverflow(page);
      expect(unexpectedApiCalls).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }
});
