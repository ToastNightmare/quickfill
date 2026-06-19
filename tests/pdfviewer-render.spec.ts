import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const localBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const runsAgainstLocalApp = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(localBaseUrl);

async function createDummyPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText("QuickFill PDF viewer render test", {
    x: 72,
    y: 720,
    size: 18,
    font,
    color: rgb(0.05, 0.08, 0.15),
  });
  page.drawRectangle({
    x: 72,
    y: 650,
    width: 260,
    height: 32,
    borderWidth: 1,
    borderColor: rgb(0.1, 0.1, 0.1),
  });

  return Buffer.from(await pdfDoc.save());
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("qf_welcome_dismissed", "1");
    localStorage.setItem("quickfill_welcomed", "1");
    localStorage.setItem("quickfill_tour_done", "1");
  });
});

async function expectPdfRendered(page: Page) {
  await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Failed to render PDF")).toHaveCount(0);

  const pdfCanvas = page.getByTestId("pdf-page").locator("canvas").first();
  await expect(pdfCanvas).toBeVisible();

  await expect
    .poll(
      async () =>
        pdfCanvas.evaluate((canvas) => {
          const element = canvas as HTMLCanvasElement;
          if (element.width === 0 || element.height === 0) return 0;

          const context = element.getContext("2d");
          if (!context) return 0;

          const imageData = context.getImageData(0, 0, element.width, element.height).data;
          let paintedPixels = 0;

          for (let index = 0; index < imageData.length; index += 40) {
            const alpha = imageData[index + 3];
            const red = imageData[index];
            const green = imageData[index + 1];
            const blue = imageData[index + 2];

            if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
              paintedPixels += 1;
            }
          }

          return paintedPixels;
        }),
      { timeout: 15_000 }
    )
    .toBeGreaterThan(0);
}

test.describe("PdfViewer render path", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");

  test("advanced editor renders a starter template PDF", async ({ page }) => {
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto("/editor?advanced=1");

    await page.getByRole("button", { name: "Statutory Declaration" }).click();
    await expect(page.getByText("statutory-declaration.pdf")).toBeVisible({ timeout: 15_000 });
    await expectPdfRendered(page);
  });

  test("advanced editor uploads and renders a dummy PDF", async ({ page }) => {
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto("/editor?advanced=1");

    await page.locator("input[type='file'][accept='application/pdf,.pdf']").setInputFiles({
      name: "pdfviewer-dummy.pdf",
      mimeType: "application/pdf",
      buffer: await createDummyPdf(),
    });

    await expect(page.getByText("pdfviewer-dummy.pdf")).toBeVisible({ timeout: 15_000 });
    await expectPdfRendered(page);
  });
});
