import { expect, test } from "@playwright/test";

const localBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const runsAgainstLocalApp = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(localBaseUrl);
const localFieldSuggestionReviewEnabled = process.env.NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS === "local-review";
const fieldSuggestionPropertyKeys = new Set([
  "stage",
  "eligibility",
  "reason",
  "outcome",
  "count_bucket",
  "scan_duration_bucket",
  "incremental_duration_bucket",
]);

type FieldSuggestionAnalyticsPayload = {
  name: "field_suggestion_lifecycle";
  properties: Record<string, string>;
};

async function installFieldSuggestionAnalyticsProbe(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const probe = {
      payloads: [] as FieldSuggestionAnalyticsPayload[],
      pending: 0,
    };
    Object.defineProperty(window, "__quickFillFieldSuggestionAnalyticsProbe", {
      configurable: true,
      value: probe,
    });

    const capture = (urlValue: string, body: BodyInit | null | undefined) => {
      let pathname = "";
      try {
        pathname = new URL(urlValue, window.location.href).pathname;
      } catch {
        return;
      }
      if (pathname !== "/api/analytics" || !body) return;

      const parse = (value: string) => {
        try {
          const payload = JSON.parse(value) as Partial<FieldSuggestionAnalyticsPayload>;
          if (
            payload.name === "field_suggestion_lifecycle" &&
            payload.properties &&
            typeof payload.properties === "object"
          ) {
            probe.payloads.push(payload as FieldSuggestionAnalyticsPayload);
          }
        } catch {
          // Ignore unrelated or malformed analytics bodies.
        }
      };

      if (typeof body === "string") {
        parse(body);
      } else if (body instanceof Blob) {
        probe.pending += 1;
        void body.text()
          .then(parse)
          .finally(() => {
            probe.pending -= 1;
          });
      }
    };

    const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
    if (originalSendBeacon) {
      navigator.sendBeacon = (url, data) => {
        capture(String(url), data);
        return originalSendBeacon(url, data);
      };
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      capture(url, init?.body);
      return originalFetch(input, init);
    };
  });
}

async function fieldSuggestionAnalyticsProbe(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const probe = (window as Window & {
      __quickFillFieldSuggestionAnalyticsProbe?: {
        pending: number;
      };
    }).__quickFillFieldSuggestionAnalyticsProbe;
    return probe?.pending === 0;
  });
  return page.evaluate(() => {
    const probe = (window as Window & {
      __quickFillFieldSuggestionAnalyticsProbe?: {
        payloads: FieldSuggestionAnalyticsPayload[];
      };
    }).__quickFillFieldSuggestionAnalyticsProbe;
    return probe?.payloads ?? [];
  });
}

function expectPrivacySafeFieldSuggestionPayloads(payloads: FieldSuggestionAnalyticsPayload[]) {
  expect(payloads.length).toBeGreaterThan(0);
  for (const payload of payloads) {
    expect(Object.keys(payload.properties).every((key) => fieldSuggestionPropertyKeys.has(key))).toBe(true);
  }
  const serialized = JSON.stringify(payloads);
  for (const forbidden of [
    ".png",
    "data:image",
    "documentRevision",
    "userId",
    "sessionId",
    "coordinates",
    "boundingBox",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

async function installLocalSuggestionPerformanceProbe(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const probe = { fullCanvasReads: 0, longTasks: 0 };
    Object.defineProperty(window, "__quickFillLocalSuggestionProbe", {
      configurable: true,
      value: probe,
    });
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function getImageData(
      x: number,
      y: number,
      width: number,
      height: number,
      settings?: ImageDataSettings,
    ) {
      if (x === 0 && y === 0 && width === this.canvas.width && height === this.canvas.height) {
        probe.fullCanvasReads += 1;
      }
      return originalGetImageData.call(this, x, y, width, height, settings);
    };
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const observer = new PerformanceObserver((list) => {
          probe.longTasks += list.getEntries().length;
        });
        observer.observe({ type: "longtask", buffered: true });
      } catch {
        // Older test browsers may not expose Long Tasks.
      }
    }
  });
}

async function localSuggestionPerformanceProbe(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const probe = (window as Window & {
      __quickFillLocalSuggestionProbe?: { fullCanvasReads: number; longTasks: number };
    }).__quickFillLocalSuggestionProbe;
    return probe ?? { fullCanvasReads: -1, longTasks: -1 };
  });
}

async function prepareEditor(page: import("@playwright/test").Page) {
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

async function completePhotoCleanup(page: import("@playwright/test").Page) {
  const cleanupHeading = page.getByRole("heading", { name: "Clean up photo" });
  await expect(cleanupHeading).toBeVisible();
  await expect(page.getByTestId("photo-cleanup-preview")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Document mode" })).toBeChecked();
  if (localFieldSuggestionReviewEnabled) {
    await expect(page.getByRole("button", { name: "Make this fillable" })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "Make this fillable" })).toHaveCount(0);
  }

  const usePhotoButton = page.getByRole("button", { name: "Use photo" });
  await expect(usePhotoButton).toBeEnabled();
  await usePhotoButton.click();
  await expect(cleanupHeading).toHaveCount(0, { timeout: 15_000 });
}

async function expectSavedLocally(page: import("@playwright/test").Page) {
  const saveBadge = page.getByTestId("local-save-status");
  await expect(saveBadge).toBeVisible();
  await expect(saveBadge).toHaveAttribute(
    "title",
    "Saved in this browser only. Use Save Progress for account save when available."
  );
  await expect(saveBadge).toContainText("Saved locally");
}

async function uploadImage(page: import("@playwright/test").Page, name: string, mimeType: string, buffer: Buffer) {
  const chooseFileButton = page.getByRole("button", { name: "Choose file" });
  if (await chooseFileButton.isVisible().catch(() => false)) {
    await page.locator("main input[type='file']").first().setInputFiles({ name, mimeType, buffer });
  } else {
    const uploadZoneInput = page.getByTestId("document-upload-input");
    await expect(uploadZoneInput).toBeAttached();
    await uploadZoneInput.setInputFiles({
      name,
      mimeType,
      buffer,
    });
  }

  await completePhotoCleanup(page);
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

async function createFieldSuggestionFixture(page: import("@playwright/test").Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.strokeRect(120, 180, 500, 64);
    ctx.strokeRect(120, 320, 38, 38);
    ctx.strokeRect(120, 430, 500, 90);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Fixture generation failed")), "image/png");
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function uploadForLocalSuggestions(page: import("@playwright/test").Page, name: string) {
  const input = page.getByTestId("document-upload-input");
  await expect(input).toBeAttached();
  await input.setInputFiles({
    name,
    mimeType: "image/png",
    buffer: await createFieldSuggestionFixture(page),
  });

  await expect(page.getByRole("heading", { name: "Clean up photo" })).toBeVisible();
  await page.getByRole("button", { name: "Make this fillable" }).click();
  await expect(page.getByRole("heading", { name: "Review fillable field suggestions" })).toBeVisible({ timeout: 15_000 });
}

async function persistedFields(page: import("@playwright/test").Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("quickfill_fields") ?? "[]") as unknown[]);
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function uploadPng(page: import("@playwright/test").Page, name = "smoke-image.png") {
  await uploadImage(page, name, "image/png", await createCanvasImageFixture(page, "image/png"));
}

async function uploadJpg(page: import("@playwright/test").Page, name = "smoke-image.jpg") {
  await uploadImage(page, name, "image/jpeg", await createCanvasImageFixture(page, "image/jpeg"));
}

test.describe("privacy trust communication", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");

  for (const width of [320, 390]) {
    test(`homepage trust copy and privacy link fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await expect(page.getByText("Private by default. Core editing runs in your browser. Optional cloud AI detection and completed-file generation process the data needed for those requests.")).toBeVisible();
      await expect(page.getByRole("link", { name: "How QuickFill handles files" })).toHaveAttribute("href", "/privacy");
      await expectNoHorizontalOverflow(page);
    });
  }

  test("privacy page keeps the five processing boundaries distinct on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "How QuickFill handles your document" })).toBeVisible();
    for (const heading of [
      "Core editing and optional local suggestions",
      "Cloud AI field detection",
      "Creating the completed PDF",
      "Browser-local working data",
      "Limited operational telemetry",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(page.getByText(/currently OpenAI/)).toBeVisible();
    await expect(page.getByText(/not cohort-safe or complete rollout evidence/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("editor image upload intake", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");

  test("advanced mobile accepts PNG and renders the full editor", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await prepareEditor(page);
    await page.goto("/editor?advanced=1");

    await expect(page.getByText("Upload a PDF, JPG, or PNG. Up to 15MB.")).toBeVisible();
    await uploadPng(page, "advanced-mobile-image.png");

    await expect(page.getByText("advanced-mobile-image.jpg")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expectSavedLocally(page);
    await expect(page.getByText(/Detect Fields sends an image of the current page/)).toBeVisible();
    if (localFieldSuggestionReviewEnabled) {
      await expect(page.getByText(/Local field suggestions reuse browser-derived geometry/)).toBeVisible();
    } else {
      await expect(page.getByText(/Local field suggestions reuse browser-derived geometry/)).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);
  });

  test("mobile default upload accepts PNG and keeps the full editor visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareEditor(page);
    await page.goto("/editor");

    await expect(page.getByRole("heading", { name: "Finish paperwork fast" })).toBeVisible();
    await expect(page.getByText("Upload a PDF, JPG, or PNG. Add text, ticks, signatures, and dates, then download your finished document.")).toBeVisible();
    await uploadPng(page, "mobile-image.png");

    await expect(page.getByText("mobile-image.jpg")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expectSavedLocally(page);
    await expect(page.getByText(/Detect Fields sends an image of the current page/)).toBeVisible();
    if (localFieldSuggestionReviewEnabled) {
      await expect(page.getByText(/Local field suggestions reuse browser-derived geometry/)).toBeVisible();
    } else {
      await expect(page.getByText(/Local field suggestions reuse browser-derived geometry/)).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);
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
    await expectSavedLocally(page);

    const textTool = page.locator('button[title="Text field: tap or drag to place"]:visible').first();
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
    await expectSavedLocally(page);
  });

});

test.describe("local photo field suggestion review", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local dev server.");

  for (const { label, viewport } of [
    { label: "desktop", viewport: { width: 1280, height: 900 } },
    { label: "mobile", viewport: { width: 390, height: 844 } },
    { label: "compact mobile", viewport: { width: 320, height: 844 } },
  ]) {
    test(`feature-off Photo Cleanup is unchanged on ${label}`, async ({ page }) => {
      test.skip(localFieldSuggestionReviewEnabled, "This assertion is for the default-off server configuration.");
      await installFieldSuggestionAnalyticsProbe(page);
      await page.setViewportSize(viewport);
      await prepareEditor(page);
      await page.getByTestId("document-upload-input").setInputFiles({
        name: `feature-off-${viewport.width}.png`,
        mimeType: "image/png",
        buffer: await createCanvasImageFixture(page, "image/png"),
      });
      await expect(page.getByRole("heading", { name: "Clean up photo" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Use photo" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Make this fillable" })).toHaveCount(0);
      await page.getByRole("button", { name: "Cancel" }).click();
      await expectNoHorizontalOverflow(page);
      expect(await fieldSuggestionAnalyticsProbe(page)).toEqual([]);
    });
  }

  test("desktop review stays local and supports review, retry, replacement, batch accept, and undo", async ({ page }) => {
    test.skip(!localFieldSuggestionReviewEnabled, "Requires the internal local-review build flag.");
    await page.setViewportSize({ width: 1280, height: 900 });
    await installLocalSuggestionPerformanceProbe(page);
    await installFieldSuggestionAnalyticsProbe(page);
    const forbiddenRequests: string[] = [];
    const signatureRequests: string[] = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const requestCounts = { total: 0, local: 0, external: 0, localApi: 0 };
    const localOrigin = new URL(localBaseUrl).origin;
    page.on("request", (request) => {
      const url = new URL(request.url());
      const pathname = url.pathname;
      requestCounts.total += 1;
      if (url.origin === localOrigin) {
        requestCounts.local += 1;
        if (pathname.startsWith("/api/")) requestCounts.localApi += 1;
      } else {
        requestCounts.external += 1;
      }
      if (pathname === "/api/detect-fields") forbiddenRequests.push(request.url());
      if (pathname === "/api/signature") signatureRequests.push(request.url());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await prepareEditor(page);

    await uploadForLocalSuggestions(page, "desktop-local-review.png");

    const reviewDialog = page.getByRole("dialog", { name: "Review fillable field suggestions" });
    await expect(reviewDialog).toBeFocused();
    await expect(reviewDialog.getByText(/reuses geometry derived in your browser/)).toBeVisible();
    await expect(reviewDialog.getByText(/No page image is sent to an external provider/)).toBeVisible();
    await expect(page.getByText(/Detect Fields sends an image of the current page/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept all" })).toBeVisible();
    const suggestions = page.locator('[data-testid^="field-suggestion-"]');
    await expect.poll(() => suggestions.count()).toBeGreaterThanOrEqual(2);
    const stableIdsBeforeRetry = await suggestions.evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")));
    expect(await persistedFields(page)).toEqual([]);
    expect(forbiddenRequests).toEqual([]);
    expect(signatureRequests).toEqual([]);
    await expectNoHorizontalOverflow(page);

    await page.waitForTimeout(250);
    const performanceBeforeRetry = await localSuggestionPerformanceProbe(page);
    expect(performanceBeforeRetry.fullCanvasReads).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Retry" }).click();
    // Retry reuses the immutable snapshot, so mapping may settle within one frame.
    await expect(page.getByRole("heading", { name: "Review fillable field suggestions" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => suggestions.count()).toBe(stableIdsBeforeRetry.length);
    expect(await suggestions.evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")))).toEqual(stableIdsBeforeRetry);
    await page.waitForTimeout(250);
    expect(await localSuggestionPerformanceProbe(page)).toEqual(performanceBeforeRetry);

    const firstType = page.getByRole("combobox", { name: "Field type" }).first();
    const changedType = await firstType.inputValue() === "checkbox" ? "text" : "checkbox";
    await firstType.selectOption(changedType);
    await page.getByRole("button", { name: "Accept field 1" }).click();
    await page.getByRole("button", { name: "Reject field 2" }).click();
    expect(await persistedFields(page)).toEqual([]);
    await page.getByRole("button", { name: "Add accepted fields (1)" }).click();
    await expect.poll(() => persistedFields(page)).toHaveLength(1);
    expect((await persistedFields(page))[0]).toMatchObject({ type: changedType, page: 0 });
    await page.locator('button[title="Undo (Ctrl+Z)"]').click();
    await expect.poll(() => persistedFields(page)).toEqual([]);
    expect(await localSuggestionPerformanceProbe(page)).toEqual(performanceBeforeRetry);

    await page.locator('button[title="Clear all fields and start fresh"]').click();
    await expect(page.getByTestId("document-upload-input")).toBeAttached();
    await uploadForLocalSuggestions(page, "desktop-replacement-local-review.png");
    const performanceAfterReplacement = await localSuggestionPerformanceProbe(page);
    expect(performanceAfterReplacement.fullCanvasReads).toBeGreaterThan(performanceBeforeRetry.fullCanvasReads);
    expect(await persistedFields(page)).toEqual([]);
    await page.getByRole("button", { name: "Accept all" }).click();
    await expect.poll(() => persistedFields(page)).not.toEqual([]);
    await page.locator('button[title="Undo (Ctrl+Z)"]').click();
    await expect.poll(() => persistedFields(page)).toEqual([]);

    expect(forbiddenRequests).toEqual([]);
    expect(signatureRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    const fieldSuggestionPayloads = await fieldSuggestionAnalyticsProbe(page);
    expectPrivacySafeFieldSuggestionPayloads(fieldSuggestionPayloads);
    expect(fieldSuggestionPayloads.map((payload) => payload.properties.stage)).toEqual(expect.arrayContaining([
      "eligibility",
      "review_requested",
      "snapshot_ready",
      "review_displayed",
      "retry",
      "individual_accept",
      "individual_reject",
      "accept_all",
      "completed",
    ]));
    console.log(JSON.stringify({
      scenario: "local-review-desktop",
      requestCounts,
      forbiddenDetectApiCount: forbiddenRequests.length,
      signatureApiCount: signatureRequests.length,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      beforeRetryProbe: performanceBeforeRetry,
      afterReplacementProbe: performanceAfterReplacement,
    }));
  });

  test("mobile review is focused, screen-reader labelled, touch sized, and cancellable", async ({ page }) => {
    test.skip(!localFieldSuggestionReviewEnabled, "Requires the internal local-review build flag.");
    await page.setViewportSize({ width: 390, height: 844 });
    await installLocalSuggestionPerformanceProbe(page);
    await installFieldSuggestionAnalyticsProbe(page);
    const forbiddenRequests: string[] = [];
    const signatureRequests: string[] = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const requestCounts = { total: 0, local: 0, external: 0, localApi: 0 };
    const localOrigin = new URL(localBaseUrl).origin;
    page.on("request", (request) => {
      const url = new URL(request.url());
      const pathname = url.pathname;
      requestCounts.total += 1;
      if (url.origin === localOrigin) {
        requestCounts.local += 1;
        if (pathname.startsWith("/api/")) requestCounts.localApi += 1;
      } else {
        requestCounts.external += 1;
      }
      if (pathname === "/api/detect-fields") forbiddenRequests.push(request.url());
      if (pathname === "/api/signature") signatureRequests.push(request.url());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await prepareEditor(page);

    await uploadForLocalSuggestions(page, "mobile-local-review.png");

    const dialog = page.getByRole("dialog", { name: "Review fillable field suggestions" });
    await expect(dialog).toBeFocused();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByText(/reuses geometry derived in your browser/)).toBeVisible();
    await expect(dialog.getByText(/No page image is sent to an external provider/)).toBeVisible();
    await expect(page.getByText(/Detect Fields sends an image of the current page/)).toBeVisible();
    for (const control of await dialog.locator("button, select").all()) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect(await persistedFields(page)).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    expect(await persistedFields(page)).toEqual([]);
    expect(forbiddenRequests).toEqual([]);
    expect(signatureRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    const fieldSuggestionPayloads = await fieldSuggestionAnalyticsProbe(page);
    expectPrivacySafeFieldSuggestionPayloads(fieldSuggestionPayloads);
    expect(fieldSuggestionPayloads.map((payload) => payload.properties.stage)).toEqual(expect.arrayContaining([
      "eligibility",
      "review_requested",
      "snapshot_ready",
      "review_displayed",
      "dismissed",
      "completed",
    ]));
    await page.waitForTimeout(250);
    console.log(JSON.stringify({
      scenario: "local-review-mobile",
      requestCounts,
      forbiddenDetectApiCount: forbiddenRequests.length,
      signatureApiCount: signatureRequests.length,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      probe: await localSuggestionPerformanceProbe(page),
    }));
  });
});
