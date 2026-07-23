import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import {
  extendedWebpFixture,
  pngFixture,
} from "../src/lib/__tests__/fixtures/media-raster-fixtures";

const addMediaEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA === "local-v1";

type BrowserProbe = {
  trackRequests: boolean;
  requests: string[];
  sourceArrayBufferCalls: number;
  createdMediaUrls: Array<{
    url: string;
    type: string;
    isFile: boolean;
  }>;
  activeMediaUrls: string[];
  revokedMediaUrls: string[];
  bitmapCalls: number;
  releaseFirstBitmap?: () => void;
};

async function installBrowserProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: BrowserProbe = {
      trackRequests: false,
      requests: [],
      sourceArrayBufferCalls: 0,
      createdMediaUrls: [],
      activeMediaUrls: [],
      revokedMediaUrls: [],
      bitmapCalls: 0,
    };
    Object.defineProperty(window, "__quickFillAddMediaProbe", {
      configurable: true,
      value: probe,
    });

    const originalArrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function arrayBuffer() {
      if (this instanceof File && this.type.startsWith("image/")) {
        probe.sourceArrayBufferCalls += 1;
      }
      return originalArrayBuffer.call(this);
    };

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = originalCreateObjectURL(blob);
      if (blob.type === "image/png" || blob.type === "image/jpeg") {
        probe.createdMediaUrls.push({
          url,
          type: blob.type,
          isFile: blob instanceof File,
        });
        probe.activeMediaUrls.push(url);
      }
      return url;
    };
    URL.revokeObjectURL = (url) => {
      probe.revokedMediaUrls.push(url);
      probe.activeMediaUrls = probe.activeMediaUrls.filter(
        (candidate) => candidate !== url,
      );
      originalRevokeObjectURL(url);
    };

    const recordRequest = (method: string, rawUrl: string) => {
      if (!probe.trackRequests) return;
      let url: URL;
      try {
        url = new URL(rawUrl, window.location.href);
      } catch {
        probe.requests.push(`${method} ${rawUrl}`);
        return;
      }
      const isExistingClerkRequest =
        url.hostname.endsWith(".clerk.accounts.dev") ||
        url.hostname.endsWith(".clerk.com");
      if (
        (url.origin !== window.location.origin && !isExistingClerkRequest) ||
        (url.pathname.startsWith("/api/") && url.pathname !== "/api/usage")
      ) {
        probe.requests.push(`${method} ${url.href}`);
      }
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const request = input instanceof Request ? input : null;
      recordRequest(
        init?.method ?? request?.method ?? "GET",
        request?.url ?? String(input),
      );
      return originalFetch(input, init);
    };

    const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
    if (originalSendBeacon) {
      navigator.sendBeacon = (url, data) => {
        recordRequest("BEACON", String(url));
        return originalSendBeacon(url, data);
      };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function open(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      recordRequest(method, String(url));
      return originalOpen.call(
        this,
        method,
        url,
        async ?? true,
        username ?? null,
        password ?? null,
      );
    };
  });
}

async function resetMediaProbe(page: Page) {
  await page.evaluate(() => {
    const probe = (
      window as Window & { __quickFillAddMediaProbe: BrowserProbe }
    ).__quickFillAddMediaProbe;
    probe.trackRequests = true;
    probe.requests = [];
    probe.sourceArrayBufferCalls = 0;
    probe.createdMediaUrls = [];
    probe.activeMediaUrls = [];
    probe.revokedMediaUrls = [];
    probe.bitmapCalls = 0;
  });
}

async function readMediaProbe(page: Page): Promise<BrowserProbe> {
  return page.evaluate(() => {
    const probe = (
      window as Window & { __quickFillAddMediaProbe: BrowserProbe }
    ).__quickFillAddMediaProbe;
    return {
      ...probe,
      releaseFirstBitmap: undefined,
    };
  });
}

async function installFirstBitmapDelay(page: Page) {
  await page.evaluate(() => {
    const probe = (
      window as Window & { __quickFillAddMediaProbe: BrowserProbe }
    ).__quickFillAddMediaProbe;
    const originalCreateImageBitmap = window.createImageBitmap.bind(window);
    let delayed = false;
    window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
      probe.bitmapCalls += 1;
      const bitmap = await originalCreateImageBitmap(...args);
      if (delayed) return bitmap;
      delayed = true;
      return await new Promise<ImageBitmap>((resolve) => {
        probe.releaseFirstBitmap = () => {
          probe.releaseFirstBitmap = undefined;
          resolve(bitmap);
        };
      });
    }) as typeof createImageBitmap;
  });
}

async function releaseFirstBitmap(page: Page) {
  await page.evaluate(() => {
    const probe = (
      window as Window & { __quickFillAddMediaProbe: BrowserProbe }
    ).__quickFillAddMediaProbe;
    probe.releaseFirstBitmap?.();
  });
}

async function createPdfFixture() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
    const pageSize: [number, number] =
      pageIndex === 0 ? [612, 792] : [360, 720];
    const pdfPage = document.addPage(pageSize);
    if (pageIndex === 1) pdfPage.setRotation(degrees(90));
    pdfPage.drawText(`QuickFill local media page ${pageIndex + 1}`, {
      x: 48,
      y: pageSize[1] - 62,
      size: 18,
      font,
      color: rgb(0.05, 0.08, 0.15),
    });
  }
  return Buffer.from(await document.save());
}

async function prepareEditor(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await installBrowserProbe(page);
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
  const input = page.getByTestId("document-upload-input");
  await expect(input).toBeAttached();
  await input.setInputFiles({
    name: "media-workflow.pdf",
    mimeType: "application/pdf",
    buffer: await createPdfFixture(),
  });
  await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("pdf-viewer")).toBeVisible();
}

async function createBrowserRaster(
  page: Page,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
) {
  const bytes = await page.evaluate(async (requestedMimeType) => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#2563eb";
    context.fillRect(8, 8, 80, 48);
    context.fillStyle = "#f8fafc";
    context.fillRect(28, 24, 40, 16);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("encode failed"))),
        requestedMimeType,
        0.9,
      );
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, mimeType);
  return Buffer.from(bytes);
}

async function addMedia(
  page: Page,
  name: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  buffer?: Buffer,
) {
  await page.getByTestId("add-media-input").setInputFiles({
    name,
    mimeType,
    buffer: buffer ?? (await createBrowserRaster(page, mimeType)),
  });
}

async function expectMediaOverlay(page: Page) {
  const overlay = page.getByTestId("media-overlay");
  const toast = page.getByTestId("editor-toast");
  await expect
    .poll(
      async () => (await overlay.count()) > 0 || (await toast.count()) > 0,
      { timeout: 15_000 },
    )
    .toBe(true);
  if ((await overlay.count()) === 0) {
    const message = await toast.textContent().catch(() => null);
    throw new Error(`Media overlay was not published. Editor message: ${message ?? "none"}`);
  }
  await expect(overlay).toBeVisible();
  return overlay;
}

function capturePageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function expectNoForbiddenRequestsOrErrors(
  page: Page,
  errors: string[],
) {
  const probe = await readMediaProbe(page);
  expect(probe.requests).toEqual([]);
  expect(errors).toEqual([]);
}

test.describe("Add Media editor rollout", () => {
  test("is inert and absent for every default-off build", async ({ page }) => {
    test.skip(addMediaEnabled, "Default-off assertion runs against the default build.");
    const errors = capturePageErrors(page);
    await prepareEditor(page, { width: 1280, height: 900 });
    await resetMediaProbe(page);

    await expect(page.getByTestId("add-media-input")).toHaveCount(0);
    await expect(page.getByTestId("add-media-action-desktop")).toHaveCount(0);
    await expect(page.getByTestId("add-media-action-mobile")).toHaveCount(0);
    const probe = await readMediaProbe(page);
    expect(probe.sourceArrayBufferCalls).toBe(0);
    expect(probe.createdMediaUrls).toEqual([]);
    await expectNoForbiddenRequestsOrErrors(page, errors);
  });

  test("desktop supports local intake, placement, transforms, history, navigation, and cleanup", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Feature workflow requires the local-v1 build.");
    const errors = capturePageErrors(page);
    await prepareEditor(page, { width: 1280, height: 900 });

    const action = page.getByTestId("add-media-action-desktop");
    await expect(action).toBeVisible();
    await expect(action).toHaveAccessibleName("Add Media");
    const input = page.getByTestId("add-media-input");
    await expect(input).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
    );

    await resetMediaProbe(page);
    await addMedia(page, "local-overlay.png", "image/png");
    let overlay = await expectMediaOverlay(page);
    await expect(page.getByTestId("sanitized-media-image")).toHaveAttribute(
      "src",
      /^blob:/,
    );

    const pdfPage = page.getByTestId("pdf-page");
    const pageBox = await pdfPage.boundingBox();
    const initialBox = await overlay.boundingBox();
    expect(pageBox).not.toBeNull();
    expect(initialBox).not.toBeNull();
    if (!pageBox || !initialBox) throw new Error("Media geometry is unavailable");
    expect(
      Math.abs(
        initialBox.x + initialBox.width / 2 -
          (pageBox.x + pageBox.width / 2),
      ),
    ).toBeLessThan(3);
    expect(
      Math.abs(
        initialBox.y + initialBox.height / 2 -
          (pageBox.y + pageBox.height / 2),
      ),
    ).toBeLessThan(3);
    expect(initialBox.x).toBeGreaterThanOrEqual(pageBox.x);
    expect(initialBox.y).toBeGreaterThanOrEqual(pageBox.y);
    expect(initialBox.x + initialBox.width).toBeLessThanOrEqual(
      pageBox.x + pageBox.width + 1,
    );
    expect(initialBox.y + initialBox.height).toBeLessThanOrEqual(
      pageBox.y + pageBox.height + 1,
    );

    await page.mouse.move(
      initialBox.x + initialBox.width / 2,
      initialBox.y + initialBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      initialBox.x + initialBox.width / 2 + 42,
      initialBox.y + initialBox.height / 2 + 26,
      { steps: 4 },
    );
    await page.mouse.up();
    overlay = page.getByTestId("media-overlay");
    const movedBox = await overlay.boundingBox();
    expect(movedBox?.x).toBeGreaterThan(initialBox.x + 20);

    const resizeHandle = page.getByTestId("media-resize-handle");
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) throw new Error("Resize handle is unavailable");
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 48,
      handleBox.y + handleBox.height / 2 + 32,
      { steps: 4 },
    );
    await page.mouse.up();
    const resizedBox = await page.getByTestId("media-overlay").boundingBox();
    expect(resizedBox).not.toBeNull();
    if (!resizedBox) throw new Error("Resized media is unavailable");
    expect(resizedBox.width).toBeGreaterThan(movedBox?.width ?? 0);
    expect(resizedBox.width / resizedBox.height).toBeCloseTo(1.5, 1);

    await page.getByRole("button", { name: "Rotate media right" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-rotation",
      "90",
    );
    await page.getByRole("button", { name: "Flip media horizontally" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-x",
      "true",
    );
    await page.getByRole("button", { name: "Undo media change" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-x",
      "false",
    );
    await page.getByRole("button", { name: "Redo media change" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-x",
      "true",
    );

    await page.getByRole("button", { name: "Fit document to screen width" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-rotation",
      "90",
    );
    const pageIndicator = page.getByText("Page 1 of 2");
    const topNavigation = pageIndicator.locator("..");
    await topNavigation.locator("button").last().click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    const secondNavigation = page.getByText("Page 2 of 2").locator("..");
    await secondNavigation.locator("button").first().click();
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-x",
      "true",
    );

    await page.getByRole("button", { name: "Delete media" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    const probe = await readMediaProbe(page);
    expect(probe.sourceArrayBufferCalls).toBe(1);
    expect(probe.createdMediaUrls).toHaveLength(1);
    expect(probe.createdMediaUrls[0]).toMatchObject({
      type: "image/png",
      isFile: false,
    });
    expect(probe.activeMediaUrls).toEqual([]);
    expect(probe.revokedMediaUrls).toContain(probe.createdMediaUrls[0].url);
    await expectNoForbiddenRequestsOrErrors(page, errors);
  });

  test("mobile accepts JPEG and static WebP with accessible controls and no overflow", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Feature workflow requires the local-v1 build.");
    const errors = capturePageErrors(page);
    await prepareEditor(page, { width: 390, height: 844 });
    await resetMediaProbe(page);

    await expect(page.getByTestId("add-media-action-mobile")).toBeVisible();
    await expect(page.getByTestId("add-media-action-mobile")).toHaveAccessibleName(
      "Add Media",
    );
    await expect(page.getByTestId("add-media-action-desktop")).not.toBeVisible();

    await addMedia(page, "photo.jpg", "image/jpeg");
    await expectMediaOverlay(page);
    await expect(
      page.getByRole("toolbar", { name: "Selected media controls" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resize media proportionally" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete media" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);

    await addMedia(page, "static.webp", "image/webp");
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-file-name",
      /static\.(png|jpg)/,
    );
    await page.getByRole("button", { name: "Rotate media left" }).click();
    await page.getByRole("button", { name: "Flip media vertically" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-y",
      "true",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);

    const probe = await readMediaProbe(page);
    expect(probe.sourceArrayBufferCalls).toBe(2);
    expect(probe.createdMediaUrls.every(({ isFile }) => !isFile)).toBe(true);
    await expectNoForbiddenRequestsOrErrors(page, errors);
  });

  test("unsupported, malformed, animated, oversized, and excessive-dimension files fail closed", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Feature workflow requires the local-v1 build.");
    const errors = capturePageErrors(page);
    await prepareEditor(page, { width: 1100, height: 850 });
    await resetMediaProbe(page);
    const input = page.getByTestId("add-media-input");

    await input.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.getByText("Choose a JPEG, PNG, or static WebP image.")).toBeVisible();

    await input.setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    await expect(
      page.getByText("This image is empty or malformed. Choose a different file."),
    ).toBeVisible();

    await input.setInputFiles({
      name: "animated.webp",
      mimeType: "image/webp",
      buffer: Buffer.from(extendedWebpFixture({ animated: true })),
    });
    await expect(page.getByText(/Animated WebP files aren’t supported/)).toBeVisible();

    await input.setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(12 * 1024 * 1024 + 1),
    });
    await expect(page.getByText(/under 12 MB/)).toBeVisible();

    await input.setInputFiles({
      name: "dimensions.png",
      mimeType: "image/png",
      buffer: Buffer.from(pngFixture({ width: 8_193, height: 1 })),
    });
    await expect(page.getByText(/too many pixels|too complex/)).toBeVisible();

    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    const probe = await readMediaProbe(page);
    expect(probe.createdMediaUrls).toEqual([]);
    expect(probe.activeMediaUrls).toEqual([]);
    await expectNoForbiddenRequestsOrErrors(page, errors);
  });

  test("a newer selection wins and a late sanitized result cannot publish", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Feature workflow requires the local-v1 build.");
    const errors = capturePageErrors(page);
    await prepareEditor(page, { width: 1100, height: 850 });
    await resetMediaProbe(page);
    await installFirstBitmapDelay(page);

    const first = await createBrowserRaster(page, "image/png");
    const second = await createBrowserRaster(page, "image/png");
    await addMedia(page, "first.png", "image/png", first);
    await expect.poll(async () => (await readMediaProbe(page)).bitmapCalls).toBe(1);
    await addMedia(page, "second.png", "image/png", second);
    await expectMediaOverlay(page);
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-file-name",
      "second.png",
      { timeout: 15_000 },
    );
    await releaseFirstBitmap(page);
    await page.waitForTimeout(100);

    await expect(page.getByTestId("media-overlay")).toHaveCount(1);
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-file-name",
      "second.png",
    );
    const probe = await readMediaProbe(page);
    expect(probe.sourceArrayBufferCalls).toBe(2);
    expect(probe.createdMediaUrls).toHaveLength(1);
    expect(probe.activeMediaUrls).toHaveLength(1);
    await expectNoForbiddenRequestsOrErrors(page, errors);
  });

  test("navigation during processing uses the active mixed-size page bounds", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Feature workflow requires the local-v1 build.");
    const errors = capturePageErrors(page);
    await prepareEditor(page, { width: 1100, height: 850 });
    await resetMediaProbe(page);
    await installFirstBitmapDelay(page);

    await addMedia(page, "page-two.png", "image/png");
    await expect.poll(async () => (await readMediaProbe(page)).bitmapCalls).toBe(1);
    const firstNavigation = page.getByText("Page 1 of 2").locator("..");
    await firstNavigation.locator("button").last().click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await releaseFirstBitmap(page);

    const overlay = await expectMediaOverlay(page);
    const pageBox = await page.getByTestId("pdf-page").boundingBox();
    const overlayBox = await overlay.boundingBox();
    expect(pageBox).not.toBeNull();
    expect(overlayBox).not.toBeNull();
    if (!pageBox || !overlayBox) throw new Error("Page-two geometry is unavailable");
    expect(pageBox.width).toBeGreaterThan(pageBox.height);
    expect(
      Math.abs(
        overlayBox.x + overlayBox.width / 2 -
          (pageBox.x + pageBox.width / 2),
      ),
    ).toBeLessThan(3);
    expect(
      Math.abs(
        overlayBox.y + overlayBox.height / 2 -
          (pageBox.y + pageBox.height / 2),
      ),
    ).toBeLessThan(3);
    expect(overlayBox.x).toBeGreaterThanOrEqual(pageBox.x);
    expect(overlayBox.y).toBeGreaterThanOrEqual(pageBox.y);
    expect(overlayBox.x + overlayBox.width).toBeLessThanOrEqual(
      pageBox.x + pageBox.width + 1,
    );
    expect(overlayBox.y + overlayBox.height).toBeLessThanOrEqual(
      pageBox.y + pageBox.height + 1,
    );

    const secondNavigation = page.getByText("Page 2 of 2").locator("..");
    await secondNavigation.locator("button").first().click();
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    const returnNavigation = page.getByText("Page 1 of 2").locator("..");
    await returnNavigation.locator("button").last().click();
    await expect(page.getByTestId("media-overlay")).toBeVisible();
    await page.getByRole("button", { name: "Delete media" }).click();
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);

    const probe = await readMediaProbe(page);
    expect(probe.sourceArrayBufferCalls).toBe(1);
    expect(probe.createdMediaUrls).toHaveLength(1);
    expect(probe.activeMediaUrls).toEqual([]);
    await expectNoForbiddenRequestsOrErrors(page, errors);
  });

  test("Start Over cancels in-flight work and leaves no media state or URL", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Feature workflow requires the local-v1 build.");
    const errors = capturePageErrors(page);
    await prepareEditor(page, { width: 1100, height: 850 });
    await resetMediaProbe(page);
    await installFirstBitmapDelay(page);

    await addMedia(page, "cancelled.png", "image/png");
    await expect.poll(async () => (await readMediaProbe(page)).bitmapCalls).toBe(1);
    await page.getByRole("button", { name: "Start Over" }).click();
    await expect(page.getByTestId("document-upload-input")).toBeAttached();
    await releaseFirstBitmap(page);
    await page.waitForTimeout(100);

    await expect(page.getByTestId("add-media-input")).toHaveCount(0);
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    const probe = await readMediaProbe(page);
    expect(probe.createdMediaUrls).toEqual([]);
    expect(probe.activeMediaUrls).toEqual([]);
    await expectNoForbiddenRequestsOrErrors(page, errors);
  });
});
