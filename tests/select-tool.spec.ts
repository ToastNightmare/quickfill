import { expect, test, type Page } from "@playwright/test";

const hasExplicitBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL);

async function prepareEditor(page: Page) {
  await page.goto("/editor?advanced=1");
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
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

async function createCanvasPng(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 52, 180, 30);
    ctx.fillStyle = "#111827";
    ctx.font = "16px Arial";
    ctx.fillText("Name", 40, 42);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("PNG fixture generation failed"));
        }
      }, "image/png");
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function uploadPng(page: Page) {
  const input = page.locator("main input[type='file']").first();
  await expect(input).toBeAttached();
  await input.setInputFiles({
    name: "select-tool.png",
    mimeType: "image/png",
    buffer: await createCanvasPng(page),
  });
}

test.describe("editor select tool", () => {
  test.skip(!hasExplicitBaseUrl, "Requires PLAYWRIGHT_BASE_URL to be set. Set it to a local or remote app URL to run this test.");

  test("defaults to Select and keeps selection behavior intact", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await prepareEditor(page);
    await page.goto("/editor?advanced=1");
    await uploadPng(page);

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
    await expect(page.getByText("Select Tool")).toBeVisible();
    await expect(selectTool).toHaveClass(/bg-accent/);

    await pdfPage.click({ position: { x: 125, y: 155 } });
    await expect(page.getByText("Text Field selected")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("Select Tool")).toBeVisible();
    await expect(selectTool).toHaveClass(/bg-accent/);
    await expect(page.getByTestId("pdf-field-editor")).toHaveCount(0);
  });
});
