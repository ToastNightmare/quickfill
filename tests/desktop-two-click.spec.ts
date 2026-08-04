import { devices, expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const localBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const runsAgainstLocalApp = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(
  localBaseUrl,
);
const twoClickDesktopEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_TWO_CLICK_DESKTOP === "v1";
const twoTapDrawToolsEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_TWO_TAP_TOOLS === "v1";

const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;
const SNAP_BOX = { x: 48, y: 650, width: 240, height: 28 };
const COMB_ROW = {
  x: 120,
  y: 470,
  cellWidth: 28,
  cellHeight: 30,
  cellCount: 8,
};

type StoredEditorField = {
  id: string;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  snapped?: boolean;
  charCount?: number;
};

test.beforeEach(async ({ page }) => {
  await page.route(
    "http://localhost:3000/_vercel/insights/script.js",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "",
      }),
  );
});

async function createEditorPdf({
  pageCount = 1,
  includeCombRow = false,
}: {
  pageCount?: number;
  includeCombRow?: boolean;
} = {}) {
  const pdfDocument = await PDFDocument.create();
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const pdfPage = pdfDocument.addPage([PDF_WIDTH, PDF_HEIGHT]);
    pdfPage.drawText(`QuickFill two-click regression page ${index + 1}`, {
      x: 48,
      y: 730,
      size: 18,
      font,
      color: rgb(0.05, 0.08, 0.15),
    });
    pdfPage.drawRectangle({
      ...SNAP_BOX,
      borderWidth: 1,
      borderColor: rgb(0.1, 0.1, 0.1),
    });

    if (includeCombRow && index === 0) {
      for (let cell = 0; cell < COMB_ROW.cellCount; cell += 1) {
        pdfPage.drawRectangle({
          x: COMB_ROW.x + cell * COMB_ROW.cellWidth,
          y: COMB_ROW.y,
          width: COMB_ROW.cellWidth,
          height: COMB_ROW.cellHeight,
          borderWidth: 1,
          borderColor: rgb(0.05, 0.05, 0.05),
        });
      }
    }
  }

  return Buffer.from(await pdfDocument.save());
}

async function seedRestoredEditorPdf(
  page: Page,
  fileName: string,
  options?: Parameters<typeof createEditorPdf>[0],
) {
  const pdfBytes = Array.from(await createEditorPdf(options));
  await page.goto("/");
  await page.evaluate(
    async ({ bytes, name }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("quickfill_db", 2);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("pdfs")) {
            database.createObjectStore("pdfs");
          }
          if (!database.objectStoreNames.contains("current_pdf_timestamp")) {
            database.createObjectStore("current_pdf_timestamp");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["pdfs", "current_pdf_timestamp"],
            "readwrite",
          );
          transaction
            .objectStore("pdfs")
            .put(new Uint8Array(bytes).buffer, "current_pdf");
          transaction
            .objectStore("current_pdf_timestamp")
            .put(Date.now(), "current_pdf_timestamp");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });

      localStorage.setItem("quickfill_filename", name);
      localStorage.setItem("quickfill_page", "0");
      localStorage.setItem("quickfill_fields", "[]");
      localStorage.setItem("qf_welcome_dismissed", "1");
      localStorage.setItem("quickfill_welcomed", "1");
      localStorage.setItem("quickfill_tour_done", "1");
    },
    { bytes: pdfBytes, name: fileName },
  );
}

async function waitForRenderedPage(page: Page) {
  await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Rendering PDF...", { exact: true })).toBeHidden({
    timeout: 15_000,
  });
  await page.waitForFunction(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="pdf-page"]');
    if (!root) return false;
    const canvases = Array.from(root.querySelectorAll("canvas"));
    return (
      canvases.length >= 2 &&
      canvases.every((canvas) => canvas.width > 0 && canvas.height > 0)
    );
  });
}

async function openEditor(
  page: Page,
  fileName: string,
  options?: Parameters<typeof createEditorPdf>[0],
) {
  await seedRestoredEditorPdf(page, fileName, options);
  await page.goto("/editor?advanced=1");
  await waitForRenderedPage(page);
  await page.waitForLoadState("networkidle");
}

async function pdfPageGeometry(page: Page) {
  const box = await page.getByTestId("pdf-page").boundingBox();
  expect(box).not.toBeNull();
  return { box: box!, scale: box!.width / PDF_WIDTH };
}

async function pdfClientPoint(page: Page, x: number, y: number) {
  const { box, scale } = await pdfPageGeometry(page);
  return { x: box.x + x * scale, y: box.y + y * scale };
}

async function clickPdfPoint(page: Page, x: number, y: number) {
  const point = await pdfClientPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
}

async function tapPdfPoint(page: Page, x: number, y: number) {
  const point = await pdfClientPoint(page, x, y);
  await page.touchscreen.tap(point.x, point.y);
}

async function dragPdfPoints(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const startPoint = await pdfClientPoint(page, start.x, start.y);
  const endPoint = await pdfClientPoint(page, end.x, end.y);
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, { steps: 3 });
  await page.mouse.up();
}

async function moveToPdfPoint(page: Page, x: number, y: number) {
  const point = await pdfClientPoint(page, x, y);
  await page.mouse.move(point.x, point.y);
}

async function readEditorFields(page: Page): Promise<StoredEditorField[]> {
  return page.evaluate(() => {
    const rawFields = localStorage.getItem("quickfill_fields");
    return rawFields ? (JSON.parse(rawFields) as StoredEditorField[]) : [];
  });
}

async function waitForEditorFields(page: Page, count: number) {
  await expect.poll(() => readEditorFields(page)).toHaveLength(count);
  return readEditorFields(page);
}

function visibleTool(page: Page, title: string) {
  return page.locator(`button[title="${title}"]`).filter({ visible: true }).first();
}

async function ensureSnapOn(page: Page) {
  const toggle = page
    .getByTitle("Toggle snap detection for structured forms")
    .filter({ visible: true });
  if ((await toggle.count()) > 0 && (await toggle.textContent())?.includes("Snap Off")) {
    await toggle.click();
  }
}

async function changePage(page: Page, from: number, to: number) {
  const status = page.getByText(`Page ${from} of 2`, { exact: true }).first();
  const buttons = status.locator("..").locator("button");
  await buttons.nth(to > from ? 1 : 0).click();
  await expect(page.getByText(`Page ${to} of 2`, { exact: true }).first()).toBeVisible();
  await waitForRenderedPage(page);
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
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  };
}

test.describe("desktop two-click placement", () => {
  test.skip(!runsAgainstLocalApp, "Requires a local QuickFill app.");
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false });

  test("places snapped text with a live ghost that survives mouseleave", async ({
    page,
  }) => {
    test.skip(
      !twoClickDesktopEnabled,
      "Requires NEXT_PUBLIC_QUICKFILL_TWO_CLICK_DESKTOP=v1.",
    );
    await openEditor(page, "desktop-two-click-text.pdf");
    const expectCleanPage = monitorPageIntegrity(page);
    await ensureSnapOn(page);
    await visibleTool(page, "Text field: tap or drag to place").click();

    await moveToPdfPoint(page, 170, 128);
    await expect(page.getByText("Snap here", { exact: true })).toHaveCount(0);

    await clickPdfPoint(page, 40, 104);
    await expect(page.getByTestId("box-first-corner-marker")).toBeVisible();
    await expect(
      page.getByText("Click the opposite corner to place the text field"),
    ).toBeVisible();

    await moveToPdfPoint(page, 300, 158);
    await expect(page.getByTestId("draw-placement-preview")).toBeVisible();
    const previewBox = await page
      .getByTestId("draw-placement-preview")
      .boundingBox();
    expect(previewBox).not.toBeNull();
    expect(previewBox!.width).toBeGreaterThan(100);
    expect(previewBox!.height).toBeGreaterThan(20);

    await page.mouse.move(4, 4);
    await expect(page.getByTestId("box-first-corner-marker")).toBeVisible();
    await expect(page.getByTestId("draw-placement-preview")).toHaveCount(0);
    await moveToPdfPoint(page, 300, 158);
    await expect(page.getByTestId("draw-placement-preview")).toBeVisible();
    await clickPdfPoint(page, 300, 158);

    const [field] = await waitForEditorFields(page, 1);
    expect(field).toMatchObject({ type: "text", snapped: true });
    expect(Math.abs(field.x - SNAP_BOX.x)).toBeLessThanOrEqual(6);
    expect(Math.abs(field.width - SNAP_BOX.width)).toBeLessThanOrEqual(6);
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
    await expect(page.getByTestId("draw-placement-preview")).toHaveCount(0);
    await expectCleanPage();
  });

  test("detects the full comb row between two box clicks", async ({ page }) => {
    test.skip(
      !twoClickDesktopEnabled,
      "Requires NEXT_PUBLIC_QUICKFILL_TWO_CLICK_DESKTOP=v1.",
    );
    await openEditor(page, "desktop-two-click-comb.pdf", {
      includeCombRow: true,
    });
    const expectCleanPage = monitorPageIntegrity(page);
    await visibleTool(page, "Box field: drag across character boxes").click();

    const combTop = PDF_HEIGHT - COMB_ROW.y - COMB_ROW.cellHeight;
    await clickPdfPoint(page, COMB_ROW.x - 2, combTop - 2);
    await clickPdfPoint(
      page,
      COMB_ROW.x + COMB_ROW.cellWidth * COMB_ROW.cellCount + 2,
      combTop + COMB_ROW.cellHeight + 2,
    );

    const [field] = await waitForEditorFields(page, 1);
    expect(field.type).toBe("comb");
    expect(field.charCount).toBeGreaterThanOrEqual(COMB_ROW.cellCount - 1);
    expect(field.width).toBeGreaterThan(
      COMB_ROW.cellWidth * (COMB_ROW.cellCount - 1),
    );
    await expectCleanPage();
  });

  test("places the default size at the first corner after a near second click", async ({
    page,
  }) => {
    test.skip(
      !twoClickDesktopEnabled,
      "Requires NEXT_PUBLIC_QUICKFILL_TWO_CLICK_DESKTOP=v1.",
    );
    await openEditor(page, "desktop-two-click-default.pdf");
    const expectCleanPage = monitorPageIntegrity(page);
    await visibleTool(page, "Text field: tap or drag to place").click();

    await clickPdfPoint(page, 330, 300);
    await clickPdfPoint(page, 335, 305);

    const [field] = await waitForEditorFields(page, 1);
    expect(field).toMatchObject({
      type: "text",
      width: 200,
      height: 28,
      snapped: false,
    });
    expect(Math.abs(field.x - 330)).toBeLessThanOrEqual(3);
    expect(Math.abs(field.y - 300)).toBeLessThanOrEqual(3);
    await expectCleanPage();
  });

  test("preserves one-gesture drag completion", async ({ page }) => {
    test.skip(
      !twoClickDesktopEnabled,
      "Requires NEXT_PUBLIC_QUICKFILL_TWO_CLICK_DESKTOP=v1.",
    );
    await openEditor(page, "desktop-two-click-drag.pdf");
    const expectCleanPage = monitorPageIntegrity(page);
    await visibleTool(page, "Text field: tap or drag to place").click();

    await dragPdfPoints(page, { x: 330, y: 220 }, { x: 480, y: 290 });

    const [field] = await waitForEditorFields(page, 1);
    expect(field).toMatchObject({ type: "text", snapped: false });
    expect(Math.abs(field.width - 150)).toBeLessThanOrEqual(4);
    expect(Math.abs(field.height - 70)).toBeLessThanOrEqual(4);
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
    await expectCleanPage();
  });

  test("cancels pending corners on Escape, tool switch, page change, and zoom", async ({
    page,
  }) => {
    test.skip(
      !twoClickDesktopEnabled,
      "Requires NEXT_PUBLIC_QUICKFILL_TWO_CLICK_DESKTOP=v1.",
    );
    await openEditor(page, "desktop-two-click-cancel.pdf", { pageCount: 2 });
    const expectCleanPage = monitorPageIntegrity(page);
    const textTool = visibleTool(page, "Text field: tap or drag to place");

    await textTool.click();
    await clickPdfPoint(page, 330, 240);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);

    await textTool.click();
    await clickPdfPoint(page, 340, 250);
    await visibleTool(page, "Date: tap to stamp today's date").click();
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);

    await textTool.click();
    await clickPdfPoint(page, 350, 260);
    await changePage(page, 1, 2);
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);

    await changePage(page, 2, 1);
    await textTool.click();
    await clickPdfPoint(page, 360, 270);
    await page.getByTitle("Zoom In").click();
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
    expect(await readEditorFields(page)).toEqual([]);
    await expectCleanPage();
  });

  test("opens the signature flow after the second click", async ({ page }) => {
    test.skip(
      !twoClickDesktopEnabled,
      "Requires NEXT_PUBLIC_QUICKFILL_TWO_CLICK_DESKTOP=v1.",
    );
    await openEditor(page, "desktop-two-click-signature.pdf");
    const expectCleanPage = monitorPageIntegrity(page);
    await visibleTool(page, "Signature field: tap to place").click();
    await clickPdfPoint(page, 320, 300);
    await clickPdfPoint(page, 500, 390);

    const [field] = await waitForEditorFields(page, 1);
    expect(field.type).toBe("signature");
    await expect(page.getByRole("heading", { name: "Sign here" })).toBeVisible();
    await expectCleanPage();
  });

  test("flag off keeps hover snap and single-click placement", async ({ page }) => {
    test.skip(
      twoClickDesktopEnabled,
      "Requires NEXT_PUBLIC_QUICKFILL_TWO_CLICK_DESKTOP to be off.",
    );
    await openEditor(page, "desktop-two-click-flag-off.pdf");
    const expectCleanPage = monitorPageIntegrity(page);
    await ensureSnapOn(page);
    await visibleTool(page, "Text field: tap or drag to place").click();

    await moveToPdfPoint(page, 170, 128);
    await expect(page.getByText("Snap here", { exact: true })).toBeVisible();
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);

    await clickPdfPoint(page, 360, 300);
    await waitForEditorFields(page, 1);
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
    await expectCleanPage();
  });
});

test.describe("mobile pending-corner viewport cancellation", () => {
  test.skip(!runsAgainstLocalApp, "Requires a local QuickFill app.");
  test.use({
    userAgent: devices["iPhone 13"].userAgent,
    viewport: devices["iPhone 13"].viewport,
    deviceScaleFactor: devices["iPhone 13"].deviceScaleFactor,
    isMobile: devices["iPhone 13"].isMobile,
    hasTouch: devices["iPhone 13"].hasTouch,
  });

  test("cancels mobile two-tap state on page and zoom changes", async ({ page }) => {
    test.skip(
      !twoTapDrawToolsEnabled,
      "Requires NEXT_PUBLIC_QUICKFILL_TWO_TAP_TOOLS=v1.",
    );
    await openEditor(page, "mobile-two-tap-viewport-cancel.pdf", {
      pageCount: 2,
    });
    const expectCleanPage = monitorPageIntegrity(page);
    const textTool = visibleTool(page, "Text field: tap or drag to place");

    await textTool.click();
    await tapPdfPoint(page, 330, 260);
    await expect(page.getByTestId("box-first-corner-marker")).toBeVisible();
    await expect(
      page.getByText("Tap the opposite corner to place the text field"),
    ).toBeVisible();
    await changePage(page, 1, 2);
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);

    await changePage(page, 2, 1);
    await textTool.click();
    await tapPdfPoint(page, 340, 280);
    await expect(page.getByTestId("box-first-corner-marker")).toBeVisible();
    await page.getByTitle("Zoom In").click();
    await expect(page.getByTestId("box-first-corner-marker")).toHaveCount(0);
    expect(await readEditorFields(page)).toEqual([]);
    await expectCleanPage();
  });
});
