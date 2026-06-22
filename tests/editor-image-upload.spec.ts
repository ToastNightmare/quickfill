import { expect, test } from "@playwright/test";

const localBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const runsAgainstLocalApp = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(localBaseUrl);

async function prepareEditor(page: import("@playwright/test").Page) {
  // Pre-warm the editor route so Clerk's dev-mode keyless-sync POST-303 redirect
  // fires and settles here, not during the actual upload step.
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

async function uploadImage(page: import("@playwright/test").Page, name: string, mimeType: string, buffer: Buffer) {
  const chooseFileButton = page.getByRole("button", { name: "Choose file" });
  if (await chooseFileButton.isVisible().catch(() => false)) {
    await page.locator("main input[type='file']").first().setInputFiles({ name, mimeType, buffer });
    return;
  }

  const uploadZoneInput = page.getByTestId("document-upload-input");
  await expect(uploadZoneInput).toBeAttached();
  await uploadZoneInput.setInputFiles({
    name,
    mimeType,
    buffer,
  });
}

async function createCanvasImageFixture(page: import("@playwright/test").Page, mimeType: "image/jpeg" | "image/png") {
  const bytes = await page.evaluate(async (fixtureMimeType) => {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1a6fb3";
    ctx.fillRect(4, 4, 40, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(12, 12, 24, 8);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Image fixture generation failed"));
        }
      }, fixtureMimeType, 0.92);
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, mimeType);
  return Buffer.from(bytes);
}

async function uploadPng(page: import("@playwright/test").Page, name = "smoke-image.png") {
  await uploadImage(page, name, "image/png", await createCanvasImageFixture(page, "image/png"));
}

async function uploadJpg(page: import("@playwright/test").Page, name = "smoke-image.jpg") {
  await uploadImage(page, name, "image/jpeg", await createCanvasImageFixture(page, "image/jpeg"));
}

test.describe("editor image upload intake", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");

  test("advanced mobile accepts PNG and renders the full editor", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareEditor(page);
    await page.goto("/editor?advanced=1");

    await expect(page.getByText("Upload a PDF, JPG, or PNG. Up to 15MB.")).toBeVisible();
    await uploadPng(page, "advanced-mobile-image.png");

    await expect(page.getByText("advanced-mobile-image.png")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("local-save-status")).toHaveText("Saved locally");
  });

  test("mobile default upload accepts PNG and keeps the full editor visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareEditor(page);
    await page.goto("/editor");

    await expect(page.getByRole("heading", { name: "Finish paperwork fast" })).toBeVisible();
    await expect(page.getByText("Upload a PDF, JPG, or PNG. Add text, ticks, signatures, and dates, then download your finished document.")).toBeVisible();
    await uploadPng(page, "mobile-image.png");

    await expect(page.getByText("mobile-image.png")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("local-save-status")).toHaveText("Saved locally");
    await expect(page.getByRole("heading", { name: "Finish paperwork fast" })).toHaveCount(0);
  });

  test("desktop accepts JPG, renders it as a PDF, and places text", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await prepareEditor(page);
    await page.goto("/editor?advanced=1");

    await expect(page.getByText("Upload a PDF, JPG, or PNG. Up to 15MB.")).toBeVisible();
    await uploadJpg(page, "desktop-image.jpg");

    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Failed to render PDF. The file may be corrupted.")).toHaveCount(0);
    await expect(page.getByTestId("local-save-status")).toHaveText("Saved locally");

    const textTool = page.locator('button[title="Text field: tap or drag to place"]').first();
    await textTool.click();
    await page.getByTestId("pdf-page").click({ position: { x: 80, y: 120 } });
    await expect(page.getByTestId("pdf-field-editor")).toBeVisible();
    await page.getByTestId("pdf-field-editor").fill("Image upload test");
  });

  test("desktop accepts PNG and renders it as a PDF", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await prepareEditor(page);
    await page.goto("/editor?advanced=1");

    await expect(page.getByText("Upload a PDF, JPG, or PNG. Up to 15MB.")).toBeVisible();
    await uploadPng(page, "desktop-image.png");

    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Failed to render PDF. The file may be corrupted.")).toHaveCount(0);
    await expect(page.getByTestId("local-save-status")).toHaveText("Saved locally");
  });

});
