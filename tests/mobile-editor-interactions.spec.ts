import { devices, expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const localBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const runsAgainstLocalApp = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(localBaseUrl);
const mobileSimpleDefaultEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_MOBILE_SIMPLE_DEFAULT === "v1";
const combMobileEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_COMB_MOBILE === "v1";
const twoTapDrawToolsEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_TWO_TAP_TOOLS === "v1";

type StoredEditorField = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  snapped?: boolean;
  snapBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

test.beforeEach(async ({ page }) => {
  await page.route(
    "http://localhost:3000/_vercel/insights/script.js",
    (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
});

async function createMobileEditorPdf(includeAcroFormField = false) {
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

  if (includeAcroFormField) {
    const fullName = pdfDoc.getForm().createTextField("fullName");
    fullName.addToPage(page, { x: 48, y: 650, width: 240, height: 28 });
  }

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

function monitorPageIntegrity(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];
  const localOrigin = new URL(localBaseUrl).origin;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin !== localOrigin
    ) {
      externalRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  return async () => {
    await page.waitForTimeout(100);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  };
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

async function readCombField(page: Page) {
  return page.evaluate(() => {
    const rawFields = localStorage.getItem("quickfill_fields");
    if (!rawFields) return null;
    const fields = JSON.parse(rawFields) as Array<Record<string, unknown>>;
    const field = fields.find((candidate) => candidate.type === "comb");
    if (!field) return null;
    return {
      x: Number(field.x),
      y: Number(field.y),
      width: Number(field.width),
      height: Number(field.height),
      value: String(field.value ?? ""),
      charCount: Number(field.charCount),
      cursorIndex:
        typeof field.cursorIndex === "number" ? field.cursorIndex : null,
    };
  });
}

async function readEditorFields(page: Page): Promise<StoredEditorField[]> {
  return page.evaluate(() => {
    const rawFields = localStorage.getItem("quickfill_fields");
    if (!rawFields) return [];
    return JSON.parse(rawFields) as StoredEditorField[];
  });
}

async function waitForEditorFields(
  page: Page,
  count: number,
): Promise<StoredEditorField[]> {
  await expect.poll(() => readEditorFields(page)).toHaveLength(count);
  return readEditorFields(page);
}

async function openTwoTapMobileEditor(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedRestoredEditorPdf(page, name);
  await page.goto("/editor?advanced=1");
  await expect(page.getByTestId("pdf-page")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Rendering PDF...")).toBeHidden({
    timeout: 15_000,
  });
  await page.waitForFunction(() => document.querySelectorAll("canvas").length >= 2);
  await page.waitForLoadState("networkidle");
}

async function pdfPageScale(page: Page) {
  const pageBox = await page.getByTestId("pdf-page").boundingBox();
  expect(pageBox).not.toBeNull();
  return {
    scale: pageBox!.width / 612,
    box: pageBox!,
  };
}

async function tapPdfCoordinate(page: Page, x: number, y: number) {
  const { scale, box } = await pdfPageScale(page);
  await page.touchscreen.tap(box.x + x * scale, box.y + y * scale);
}

function expectNear(actual: number, expected: number, tolerance = 3) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

test.describe("mobile simple default routing", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");
  test.use({
    userAgent: devices["iPhone 13"].userAgent,
    viewport: devices["iPhone 13"].viewport,
    deviceScaleFactor: devices["iPhone 13"].deviceScaleFactor,
    isMobile: devices["iPhone 13"].isMobile,
    hasTouch: devices["iPhone 13"].hasTouch,
  });

  test("honors the flag and keeps both view escapes working", async ({ page }) => {
    await prepareEmptyMobileEditor(page);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });

    if (!mobileSimpleDefaultEnabled) {
      await expect(page).toHaveURL(/\/editor\?advanced=1$/);
      await expect(page.getByText("Tap to browse your file")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Finish paperwork fast" })).toBeHidden();
      return;
    }

    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByRole("heading", { name: "Finish paperwork fast" })).toBeVisible();
    await expect(page.getByText("Tap to browse your file")).toBeHidden();

    const mobilePickerInput = page.locator(
      "input[type='file']:not([capture]):not([data-testid='document-upload-input'])"
    );
    await mobilePickerInput.setInputFiles({
      name: "mobile-simple-escape.pdf",
      mimeType: "application/pdf",
      buffer: await createMobileEditorPdf(true),
    });

    await expect(page.getByText(/0 of 1 filled/i)).toBeVisible();
    const openFullEditor = page.getByRole("link", { name: "Open full editor" });
    await expect(openFullEditor).toBeVisible();
    await openFullEditor.click();

    await expect(page).toHaveURL(/\/editor\?advanced=1$/);
    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    const switchToSimple = page.getByRole("link", { name: "Switch to simple view" });
    await expect(switchToSimple).toBeVisible();
    await switchToSimple.click();

    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByText(/0 of 1 filled/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: "Open full editor" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("pdf-page")).toHaveCount(0);
  });
});

test.describe("mobile editor field interactions", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");

  test.describe("field placement", () => {
    test.use({ hasTouch: true });

    test.describe("two-tap draw placement", () => {
      test.skip(
        !twoTapDrawToolsEnabled,
        "Requires NEXT_PUBLIC_QUICKFILL_TWO_TAP_TOOLS=v1.",
      );

      test("places an unsnapped text field from two spread taps in empty page space", async ({ page }) => {
        await openTwoTapMobileEditor(page, "two-tap-text-empty.pdf");
        const expectCleanPage = monitorPageIntegrity(page);

        const textTool = page
          .locator('button[title="Text field: tap or drag to place"]')
          .last();
        await textTool.click();
        await tapPdfCoordinate(page, 330, 300);
        await expect(page.getByTestId("box-first-corner-marker")).toBeVisible();
        await expect(
          page.getByText("Tap the opposite corner to place the text field"),
        ).toBeVisible();

        await tapPdfCoordinate(page, 500, 370);
        const [field] = await waitForEditorFields(page, 1);
        expect(field).toMatchObject({ type: "text", snapped: false });
        expectNear(field.x, 330);
        expectNear(field.y, 300);
        expectNear(field.width, 170);
        expectNear(field.height, 70);
        await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
        await expectCleanPage();
      });

      test("falls back to a default-size text field at the first of two close taps", async ({ page }) => {
        await openTwoTapMobileEditor(page, "two-tap-text-close.pdf");
        const expectCleanPage = monitorPageIntegrity(page);

        await page
          .locator('button[title="Text field: tap or drag to place"]')
          .last()
          .click();
        await tapPdfCoordinate(page, 330, 430);
        await tapPdfCoordinate(page, 330, 430);

        const [field] = await waitForEditorFields(page, 1);
        expect(field).toMatchObject({
          type: "text",
          width: 200,
          height: 28,
          snapped: false,
        });
        expectNear(field.x, 330);
        expectNear(field.y, 430);
        await expectCleanPage();
      });

      test("snaps a spread text placement when the detected box intersects the tapped rectangle", async ({ page }) => {
        await openTwoTapMobileEditor(page, "two-tap-text-snap.pdf");
        const expectCleanPage = monitorPageIntegrity(page);

        await page.getByTitle("Snap is off").filter({ visible: true }).click();
        await page
          .locator('button[title="Text field: tap or drag to place"]')
          .last()
          .click();
        await tapPdfCoordinate(page, 40, 106);
        await tapPdfCoordinate(page, 300, 150);

        const [field] = await waitForEditorFields(page, 1);
        expect(field).toMatchObject({ type: "text", snapped: true });
        expectNear(field.x, 48, 6);
        expectNear(field.y, 114, 6);
        expectNear(field.width, 240, 8);
        expectNear(field.height, 28, 6);
        expect(field.snapBounds).toBeDefined();
        expectNear(field.snapBounds!.x, field.x);
        expectNear(field.snapBounds!.y, field.y);
        expectNear(field.snapBounds!.width, field.width);
        expectNear(field.snapBounds!.height, field.height);
        await expectCleanPage();
      });

      test("draws a whiteout rectangle and keeps the tool active for another placement", async ({ page }) => {
        await openTwoTapMobileEditor(page, "two-tap-whiteout.pdf");
        const expectCleanPage = monitorPageIntegrity(page);

        const whiteoutTool = page
          .locator('button[title="Whiteout: drag over text to cover it"]')
          .last();
        await whiteoutTool.click();
        await tapPdfCoordinate(page, 320, 210);
        await tapPdfCoordinate(page, 500, 280);

        const [field] = await waitForEditorFields(page, 1);
        expect(field).toMatchObject({ type: "whiteout", snapped: false });
        expectNear(field.x, 320);
        expectNear(field.y, 210);
        expectNear(field.width, 180);
        expectNear(field.height, 70);
        await expect(
          page.getByText("Tap the PDF to place whiteout"),
        ).toBeVisible();

        await tapPdfCoordinate(page, 340, 350);
        await expect(page.getByTestId("box-first-corner-marker")).toBeVisible();
        await expect(
          page.getByText("Tap the opposite corner to place the whiteout"),
        ).toBeVisible();
        expect(await readEditorFields(page)).toHaveLength(1);
        await expectCleanPage();
      });

      test("draws a signature field and opens the signature flow", async ({ page }) => {
        await openTwoTapMobileEditor(page, "two-tap-signature.pdf");
        const expectCleanPage = monitorPageIntegrity(page);

        await page
          .locator('button[title="Signature field: tap to place"]')
          .last()
          .click();
        await tapPdfCoordinate(page, 320, 300);
        await tapPdfCoordinate(page, 500, 390);

        const [field] = await waitForEditorFields(page, 1);
        expect(field).toMatchObject({ type: "signature", snapped: false });
        expectNear(field.x, 320);
        expectNear(field.y, 300);
        expectNear(field.width, 180);
        expectNear(field.height, 90);
        await expect(page.getByRole("heading", { name: "Sign here" })).toBeVisible();
        await expectCleanPage();
      });

      test("cancels a planted corner on Escape and on a tool switch", async ({ page }) => {
        await openTwoTapMobileEditor(page, "two-tap-cancel.pdf");
        const expectCleanPage = monitorPageIntegrity(page);

        const textTool = page
          .locator('button[title="Text field: tap or drag to place"]')
          .last();
        await textTool.click();
        await tapPdfCoordinate(page, 330, 300);
        await expect(page.getByTestId("box-first-corner-marker")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
        expect(await readEditorFields(page)).toEqual([]);

        await textTool.click();
        await tapPdfCoordinate(page, 360, 340);
        await expect(page.getByTestId("box-first-corner-marker")).toBeVisible();
        await page
          .locator('button[title="Date: tap to stamp today\'s date"]')
          .last()
          .click();
        await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
        expect(await readEditorFields(page)).toEqual([]);
        await expectCleanPage();
      });
    });

    test("flag off keeps single-tap default-size text placement", async ({ page }) => {
      test.skip(
        twoTapDrawToolsEnabled,
        "Requires NEXT_PUBLIC_QUICKFILL_TWO_TAP_TOOLS to be off.",
      );
      await openTwoTapMobileEditor(page, "single-tap-text-flag-off.pdf");
      const expectCleanPage = monitorPageIntegrity(page);

      await page
        .locator('button[title="Text field: tap or drag to place"]')
        .last()
        .click();
      await tapPdfCoordinate(page, 330, 430);

      const [field] = await waitForEditorFields(page, 1);
      expect(field).toMatchObject({
        type: "text",
        width: 200,
        height: 28,
        snapped: false,
      });
      expectNear(field.x, 330);
      expectNear(field.y, 430);
      await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
      await expectCleanPage();
    });

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

    test("box slots and Edit focus the hidden mobile input", async ({ page }) => {
      test.skip(
        !combMobileEnabled,
        "Requires NEXT_PUBLIC_QUICKFILL_COMB_MOBILE=v1.",
      );

      await page.setViewportSize({ width: 900, height: 900 });
      await seedRestoredEditorPdf(page, "comb-mobile-input.pdf");
      await page.goto("/editor?advanced=1");
      await expect(page.getByTestId("pdf-page")).toBeVisible({
        timeout: 15_000,
      });
      await page.waitForFunction(
        () => document.querySelectorAll("canvas").length >= 2,
      );

      const boxTool = page
        .locator('button[title="Box field: drag across character boxes"]')
        .last();
      await boxTool.click();
      const interactionCanvas = page
        .getByTestId("pdf-page")
        .locator(".konvajs-content canvas")
        .first();
      await interactionCanvas.click({ position: { x: 180, y: 240 } });

      await expect.poll(() => readCombField(page)).not.toBeNull();
      const hiddenInput = page.getByTestId("comb-hidden-input");
      await expect(hiddenInput).toBeAttached();
      await expect(hiddenInput).not.toBeFocused();

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId("mobile-field-sheet")).toBeVisible();
      await tapElement(page, page.getByTestId("mobile-field-edit"));
      await expect(hiddenInput).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(hiddenInput).not.toBeFocused();

      const combField = await readCombField(page);
      expect(combField).not.toBeNull();
      const canvasBox = await interactionCanvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      const pdfScale = canvasBox!.width / 612;
      const slotWidth = combField!.width / combField!.charCount;
      const tappedSlotIndex = Math.min(2, combField!.charCount - 1);

      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const externalRequests: string[] = [];
      const localOrigin = new URL(localBaseUrl).origin;
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== localOrigin) {
          externalRequests.push(`${request.method()} ${request.url()}`);
        }
      });

      await page.touchscreen.tap(
        canvasBox!.x +
          (combField!.x + (tappedSlotIndex + 0.5) * slotWidth) *
            pdfScale,
        canvasBox!.y +
          (combField!.y + combField!.height / 2) * pdfScale,
      );
      await expect.poll(async () => (await readCombField(page))?.cursorIndex).toBe(
        tappedSlotIndex,
      );
      await expect(hiddenInput).toBeFocused();

      await page.keyboard.type("AB");
      const valueAfterTyping =
        " ".repeat(tappedSlotIndex) +
        "AB" +
        " ".repeat(combField!.charCount - tappedSlotIndex - 2);
      await expect.poll(() => readCombField(page)).toMatchObject({
        value: valueAfterTyping,
        cursorIndex: tappedSlotIndex + 2,
      });

      await page.keyboard.press("Backspace");
      const valueAfterBackspace =
        " ".repeat(tappedSlotIndex) +
        "A" +
        " ".repeat(combField!.charCount - tappedSlotIndex - 1);
      await expect.poll(() => readCombField(page)).toMatchObject({
        value: valueAfterBackspace,
        cursorIndex: tappedSlotIndex + 1,
      });

      await page.keyboard.press("Enter");
      await expect(hiddenInput).not.toBeFocused();

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(externalRequests).toEqual([]);
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
