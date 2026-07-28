import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const addMediaEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA === "local-v1";

test.beforeEach(async ({ page }) => {
  await page.route(
    "http://localhost:3000/_vercel/insights/script.js",
    (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
});

type PersistenceProbe = {
  track: boolean;
  mediaTransactions: string[][];
  mediaOperations: string[];
  mediaDigestCalls: number;
  createdMediaUrls: string[];
  revokedMediaUrls: string[];
  requests: string[];
  analyticsPayloads: string[];
  delayedHydrationReads: number;
  releaseHydrationRead?: () => void;
};

async function installPersistenceProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: PersistenceProbe = {
      track: false,
      mediaTransactions: [],
      mediaOperations: [],
      mediaDigestCalls: 0,
      createdMediaUrls: [],
      revokedMediaUrls: [],
      requests: [],
      analyticsPayloads: [],
      delayedHydrationReads: 0,
    };
    Object.defineProperty(window, "__quickFillMediaPersistenceProbe", {
      configurable: true,
      value: probe,
    });

    const mediaStores = new Set(["media_sessions", "media_assets"]);
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function transaction(
      storeNames: string | string[],
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions,
    ) {
      const names =
        typeof storeNames === "string" ? [storeNames] : Array.from(storeNames);
      if (probe.track && names.some((name) => mediaStores.has(name))) {
        probe.mediaTransactions.push(names);
      }
      return originalTransaction.call(this, storeNames, mode, options);
    };

    for (const method of [
      "get",
      "getAll",
      "getAllKeys",
      "put",
      "delete",
      "clear",
    ] as const) {
      const original = IDBObjectStore.prototype[method] as (
        ...args: unknown[]
      ) => IDBRequest;
      Object.defineProperty(IDBObjectStore.prototype, method, {
        configurable: true,
        value: function instrumentedStoreOperation(
          this: IDBObjectStore,
          ...args: unknown[]
        ) {
          if (probe.track && mediaStores.has(this.name)) {
            probe.mediaOperations.push(`${this.name}.${method}`);
          }
          return original.apply(this, args);
        },
      });
    }

    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, "digest", {
      configurable: true,
      value: async (...args: Parameters<SubtleCrypto["digest"]>) => {
        if (probe.track) probe.mediaDigestCalls += 1;
        return originalDigest(...args);
      },
    });

    let delayHydrationRead = false;
    try {
      delayHydrationRead =
        sessionStorage.getItem("qf-test-delay-media-hydration") === "1";
    } catch {
      // Session storage may be unavailable in an initial opaque document.
    }
    if (delayHydrationRead) {
      const originalArrayBuffer = Blob.prototype.arrayBuffer;
      let delayed = false;
      Blob.prototype.arrayBuffer = function arrayBuffer() {
        const pending = originalArrayBuffer.call(this);
        if (
          delayed ||
          this instanceof File ||
          (this.type !== "image/png" && this.type !== "image/jpeg")
        ) {
          return pending;
        }
        delayed = true;
        probe.delayedHydrationReads += 1;
        return new Promise<ArrayBuffer>((resolve, reject) => {
          probe.releaseHydrationRead = () => {
            probe.releaseHydrationRead = undefined;
            void pending.then(resolve, reject);
          };
        });
      };
    }

    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = originalCreateObjectURL(blob);
      if (
        probe.track &&
        (blob.type === "image/png" || blob.type === "image/jpeg")
      ) {
        probe.createdMediaUrls.push(url);
      }
      return url;
    };
    URL.revokeObjectURL = (url) => {
      if (probe.track) probe.revokedMediaUrls.push(url);
      originalRevokeObjectURL(url);
    };

    const recordRequest = (method: string, rawUrl: string) => {
      if (!probe.track) return;
      let url: URL;
      try {
        url = new URL(rawUrl, window.location.href);
      } catch {
        probe.requests.push(`${method} ${rawUrl}`);
        return;
      }
      const clerkRequest =
        url.hostname.endsWith(".clerk.accounts.dev") ||
        url.hostname.endsWith(".clerk.com");
      if (
        (url.origin !== window.location.origin && !clerkRequest) ||
        (url.pathname.startsWith("/api/") && url.pathname !== "/api/usage")
      ) {
        probe.requests.push(`${method} ${url.href}`);
      }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const request = input instanceof Request ? input : null;
      const requestUrl = request?.url ?? String(input);
      recordRequest(
        init?.method ?? request?.method ?? "GET",
        requestUrl,
      );
      if (new URL(requestUrl, window.location.href).pathname === "/api/analytics") {
        const body = init?.body;
        if (typeof body === "string") probe.analyticsPayloads.push(body);
        else if (body instanceof Blob) {
          void body.text().then((payload) => probe.analyticsPayloads.push(payload));
        }
      }
      return originalFetch(input, init);
    };
    const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
    if (originalSendBeacon) {
      navigator.sendBeacon = (url, data) => {
        const beaconUrl = String(url);
        recordRequest("BEACON", beaconUrl);
        if (
          new URL(beaconUrl, window.location.href).pathname === "/api/analytics"
        ) {
          if (typeof data === "string") probe.analyticsPayloads.push(data);
          else if (data instanceof Blob) {
            void data
              .text()
              .then((payload) => probe.analyticsPayloads.push(payload));
          }
        }
        return originalSendBeacon(url, data);
      };
    }
  });
}

async function resetProbe(page: Page) {
  await page.evaluate(() => {
    const probe = (
      window as unknown as Window & {
        __quickFillMediaPersistenceProbe: PersistenceProbe;
      }
    ).__quickFillMediaPersistenceProbe;
    probe.track = true;
    probe.mediaTransactions = [];
    probe.mediaOperations = [];
    probe.mediaDigestCalls = 0;
    probe.createdMediaUrls = [];
    probe.revokedMediaUrls = [];
    probe.requests = [];
    probe.analyticsPayloads = [];
    probe.delayedHydrationReads = 0;
  });
}

async function readProbe(page: Page): Promise<PersistenceProbe> {
  return page.evaluate(() => {
    const probe = (
      window as unknown as Window & {
        __quickFillMediaPersistenceProbe: PersistenceProbe;
      }
    ).__quickFillMediaPersistenceProbe;
    return { ...probe, releaseHydrationRead: undefined };
  });
}

async function createPdfFixture(
  label = "QuickFill media persistence",
  pageCount = 1,
) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const pdfPage = document.addPage([612, 792]);
    pdfPage.drawText(`${label} ${index + 1}`, {
      x: 48,
      y: 730,
      size: 18,
      font,
    });
  }
  return Buffer.from(await document.save());
}

async function uploadEditorPdf(
  page: Page,
  pdf: Buffer,
  name = "media-persistence.pdf",
) {
  await page.getByTestId("document-upload-input").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
}

async function createPngFixture(page: Page) {
  return Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 80;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 120, 80);
      context.fillStyle = "#2563eb";
      context.fillRect(10, 10, 100, 60);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("PNG encoding failed")),
          "image/png",
        );
      });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }),
  );
}

async function deleteQuickFillDatabase(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("quickfill_db");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
}

async function prepareEditor(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await installPersistenceProbe(page);
  await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("qf_welcome_dismissed", "1");
    localStorage.setItem("quickfill_welcomed", "1");
    localStorage.setItem("quickfill_tour_done", "1");
  });
  await deleteQuickFillDatabase(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await uploadEditorPdf(page, await createPdfFixture());
  await expect(page.getByTestId("pdf-viewer")).toBeVisible();
  await resetProbe(page);
}

async function addPng(page: Page, buffer: Buffer, name = "overlay.png") {
  await page.getByTestId("add-media-input").setInputFiles({
    name,
    mimeType: "image/png",
    buffer,
  });
  await expect(page.getByTestId("media-overlay").last()).toBeVisible({
    timeout: 15_000,
  });
}

async function mediaDatabaseState(page: Page) {
  return page.evaluate(async () => {
    const probe = (
      window as unknown as Window & {
        __quickFillMediaPersistenceProbe: PersistenceProbe;
      }
    ).__quickFillMediaPersistenceProbe;
    const tracking = probe.track;
    probe.track = false;
    try {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("quickfill_db");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        if (
          !database.objectStoreNames.contains("media_sessions") ||
          !database.objectStoreNames.contains("media_assets")
        ) {
          return {
            version: database.version,
            manifest: null,
            assets: [] as Array<Record<string, unknown>>,
          };
        }
        const transaction = database.transaction(
          ["media_sessions", "media_assets"],
          "readonly",
        );
        const manifest = await new Promise<unknown>((resolve, reject) => {
          const request = transaction
            .objectStore("media_sessions")
            .get("current_media");
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        });
        const assets = await new Promise<Array<Record<string, unknown>>>(
          (resolve, reject) => {
            const request = transaction.objectStore("media_assets").getAll();
            request.onsuccess = () =>
              resolve(
                request.result.map((record: Record<string, unknown>) => ({
                  ...record,
                  blob:
                    record.blob instanceof Blob
                      ? {
                          type: record.blob.type,
                          size: record.blob.size,
                        }
                      : null,
                })),
              );
            request.onerror = () => reject(request.error);
          },
        );
        return { version: database.version, manifest, assets };
      } finally {
        database.close();
      }
    } finally {
      probe.track = tracking;
    }
  });
}

async function waitForPersistedOverlayCount(page: Page, count: number) {
  await expect
    .poll(async () => {
      const state = await mediaDatabaseState(page);
      const manifest = state.manifest as { overlays?: unknown[] } | null;
      return manifest?.overlays?.length ?? 0;
    })
    .toBe(count);
}

async function replaceStoredPdfWithoutTouchingMedia(
  page: Page,
  pdf: Buffer,
  fileName: string,
) {
  await page.evaluate(
    async ({ values, name }) => {
      const probe = (
        window as unknown as Window & {
          __quickFillMediaPersistenceProbe: PersistenceProbe;
        }
      ).__quickFillMediaPersistenceProbe;
      const tracking = probe.track;
      probe.track = false;
      try {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("quickfill_db");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction(
          ["pdfs", "current_pdf_timestamp"],
          "readwrite",
        );
        transaction.objectStore("pdfs").put(
          new Uint8Array(values).buffer,
          "current_pdf",
        );
        transaction
          .objectStore("current_pdf_timestamp")
          .put(Date.now(), "current_pdf_timestamp");
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = transaction.onabort = () =>
            reject(transaction.error);
        });
        database.close();
        localStorage.setItem("quickfill_filename", name);
      } finally {
        probe.track = tracking;
      }
    },
    { values: Array.from(pdf), name: fileName },
  );
}

async function waitForDelayedHydrationRead(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as Window & {
              __quickFillMediaPersistenceProbe: PersistenceProbe;
            }
          ).__quickFillMediaPersistenceProbe.delayedHydrationReads,
      ),
    )
    .toBe(1);
}

async function releaseDelayedHydrationRead(page: Page) {
  await page.evaluate(() => {
    sessionStorage.removeItem("qf-test-delay-media-hydration");
    (
      window as unknown as Window & {
        __quickFillMediaPersistenceProbe: PersistenceProbe;
      }
    ).__quickFillMediaPersistenceProbe.releaseHydrationRead?.();
  });
}

async function seedVersionThreeDefaultOffSession(
  page: Page,
  pdf: Buffer,
) {
  await page.evaluate(async (pdfValues) => {
    localStorage.clear();
    localStorage.setItem("qf_welcome_dismissed", "1");
    localStorage.setItem("quickfill_welcomed", "1");
    localStorage.setItem("quickfill_tour_done", "1");
    localStorage.setItem("quickfill_filename", "preseeded.pdf");
    await new Promise<void>((resolve) => {
      const remove = indexedDB.deleteDatabase("quickfill_db");
      remove.onsuccess = remove.onerror = remove.onblocked = () => resolve();
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("quickfill_db", 3);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("pdfs");
        request.result.createObjectStore("current_pdf_timestamp");
        request.result.createObjectStore("media_sessions", { keyPath: "key" });
        request.result.createObjectStore("media_assets", {
          keyPath: "resourceId",
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(
      [
        "pdfs",
        "current_pdf_timestamp",
        "media_sessions",
        "media_assets",
      ],
      "readwrite",
    );
    transaction
      .objectStore("pdfs")
      .put(new Uint8Array(pdfValues).buffer, "current_pdf");
    transaction
      .objectStore("current_pdf_timestamp")
      .put(Date.now(), "current_pdf_timestamp");
    transaction.objectStore("media_sessions").put({
      key: "current_media",
      sentinel: "default-off-must-not-read",
    });
    transaction.objectStore("media_assets").put({
      resourceId: "sentinel",
      sentinel: "default-off-must-not-read",
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error);
    });
    database.close();
  }, Array.from(pdf));
}

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.describe("Add Media persistence rollout", () => {
  test("default-off preseeded version-3 media remains completely inert", async ({
    page,
  }) => {
    test.skip(addMediaEnabled, "Default-off assertion runs against the default build.");
    await page.setViewportSize({ width: 1280, height: 900 });
    await installPersistenceProbe(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await seedVersionThreeDefaultOffSession(page, await createPdfFixture());
    await resetProbe(page);
    const errors = captureBrowserErrors(page);

    await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("add-media-input")).toHaveCount(0);
    await expect(page.getByTestId("add-media-action-desktop")).toHaveCount(0);

    const probe = await readProbe(page);
    expect(probe.mediaTransactions).toEqual([]);
    expect(probe.mediaOperations).toEqual([]);
    expect(probe.mediaDigestCalls).toBe(0);
    expect(probe.createdMediaUrls).toEqual([]);
    expect(probe.requests).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);

    const state = await mediaDatabaseState(page);
    expect(state.version).toBe(3);
    expect(state.manifest).toEqual({
      key: "current_media",
      sentinel: "default-off-must-not-read",
    });
    expect(state.assets).toHaveLength(1);
  });

  test("desktop persists latest geometry, z-order, shared bytes, edits, deletion, and Start Over", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    const errors = captureBrowserErrors(page);
    await prepareEditor(page, { width: 1280, height: 900 });
    const png = await createPngFixture(page);

    await addPng(page, png, "first.png");
    const firstOverlay = page.getByTestId("media-overlay").last();
    const initialBox = await firstOverlay.boundingBox();
    if (!initialBox) throw new Error("Initial media geometry is unavailable");
    await page.mouse.move(
      initialBox.x + initialBox.width / 2,
      initialBox.y + initialBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      initialBox.x + initialBox.width / 2 + 55,
      initialBox.y + initialBox.height / 2 + 30,
      { steps: 4 },
    );
    await page.mouse.up();
    const movedBox = await firstOverlay.boundingBox();
    if (!movedBox) throw new Error("Moved media geometry is unavailable");
    expect(movedBox.x).toBeGreaterThan(initialBox.x + 20);
    expect(movedBox.y).toBeGreaterThan(initialBox.y + 10);

    const resizeHandle = page.getByTestId("media-resize-handle");
    const handleBox = await resizeHandle.boundingBox();
    if (!handleBox) throw new Error("Media resize handle is unavailable");
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 45,
      handleBox.y + handleBox.height / 2 + 30,
      { steps: 4 },
    );
    await page.mouse.up();
    const resizedBox = await firstOverlay.boundingBox();
    if (!resizedBox) throw new Error("Resized media geometry is unavailable");
    expect(resizedBox.width).toBeGreaterThan(movedBox.width);
    expect(resizedBox.width / resizedBox.height).toBeCloseTo(1.5, 1);

    await page.getByRole("button", { name: "Rotate media right" }).click();
    await page.getByRole("button", { name: "Flip media horizontally" }).click();
    const transformedBox = await firstOverlay.boundingBox();
    if (!transformedBox) {
      throw new Error("Transformed media geometry is unavailable");
    }

    await addPng(page, png, "alias.png");
    await expect(page.getByTestId("media-overlay")).toHaveCount(2);
    await waitForPersistedOverlayCount(page, 2);
    let databaseState = await mediaDatabaseState(page);
    expect(databaseState.version).toBe(3);
    expect(databaseState.assets).toHaveLength(1);
    const manifest = databaseState.manifest as {
      overlays: Array<Record<string, unknown>>;
    };
    expect(manifest.overlays).toHaveLength(2);
    expect(Object.keys(manifest.overlays[0])).not.toContain("fileName");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("media-overlay")).toHaveCount(2, {
      timeout: 15_000,
    });
    const images = page.getByTestId("sanitized-media-image");
    expect(await images.nth(0).getAttribute("src")).toBe(
      await images.nth(1).getAttribute("src"),
    );
    await expect(page.getByTestId("media-overlay").nth(0)).toHaveAttribute(
      "data-media-rotation",
      "90",
    );
    await expect(page.getByTestId("media-overlay").nth(0)).toHaveAttribute(
      "data-media-flip-x",
      "true",
    );
    const restoredBox = await page.getByTestId("media-overlay").nth(0).boundingBox();
    if (!restoredBox) throw new Error("Restored media geometry is unavailable");
    expect(Math.abs(restoredBox.x - transformedBox.x)).toBeLessThan(3);
    expect(Math.abs(restoredBox.y - transformedBox.y)).toBeLessThan(3);
    expect(Math.abs(restoredBox.width - transformedBox.width)).toBeLessThan(3);
    expect(Math.abs(restoredBox.height - transformedBox.height)).toBeLessThan(3);

    await page.getByTestId("media-overlay").nth(1).click();
    await page.getByRole("button", { name: "Delete media" }).click();
    await waitForPersistedOverlayCount(page, 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("media-overlay")).toHaveCount(1, {
      timeout: 15_000,
    });
    databaseState = await mediaDatabaseState(page);
    expect(databaseState.assets).toHaveLength(1);

    await page.getByRole("button", { name: "Start Over" }).click();
    await expect(page.getByTestId("document-upload-input")).toBeAttached();
    await expect
      .poll(async () => (await mediaDatabaseState(page)).assets.length)
      .toBe(0);
    const probe = await readProbe(page);
    expect(probe.requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("mobile reload restores accessible local media without horizontal overflow", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    const errors = captureBrowserErrors(page);
    await prepareEditor(page, { width: 390, height: 844 });
    await addPng(page, await createPngFixture(page), "mobile.png");
    await page.getByRole("button", { name: "Rotate media left" }).click();
    await page.getByRole("button", { name: "Flip media vertically" }).click();
    await expect
      .poll(async () => {
        const state = await mediaDatabaseState(page);
        const manifest = state.manifest as {
          overlays?: Array<{ rotation?: unknown; flipY?: unknown }>;
        } | null;
        const persisted = manifest?.overlays?.[0];
        return persisted
          ? { rotation: persisted.rotation, flipY: persisted.flipY }
          : null;
      })
      .toEqual({ rotation: -90, flipY: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("media-overlay")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-rotation",
      "-90",
    );
    await expect(page.getByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-y",
      "true",
    );
    await page.getByTestId("media-overlay").click();
    await expect(
      page.getByRole("toolbar", { name: "Selected media controls" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test("reload restores an overlay on its authoritative second PDF page", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    const errors = captureBrowserErrors(page);
    await prepareEditor(page, { width: 1100, height: 850 });
    await page.getByRole("button", { name: "Start Over" }).click();
    await uploadEditorPdf(
      page,
      await createPdfFixture("two-page persistence", 2),
      "two-page.pdf",
    );
    const firstNavigation = page.getByText("Page 1 of 2").locator("..");
    await firstNavigation.locator("button").last().click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await addPng(page, await createPngFixture(page), "second-page.png");
    await waitForPersistedOverlayCount(page, 1);
    expect(
      (
        (await mediaDatabaseState(page)).manifest as {
          overlays: Array<{ pageIndex: number }>;
        }
      ).overlays[0].pageIndex,
    ).toBe(1);

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByText("Page 2 of 2")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("media-overlay")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("byte-identical replacement rotates incarnation and same-filename different bytes stay isolated", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    const errors = captureBrowserErrors(page);
    const firstPdf = await createPdfFixture("same bytes");
    await prepareEditor(page, { width: 1100, height: 850 });
    await page.getByRole("button", { name: "Start Over" }).click();
    await uploadEditorPdf(page, firstPdf, "same-name.pdf");
    await addPng(page, await createPngFixture(page), "replace-me.png");
    await waitForPersistedOverlayCount(page, 1);
    const firstManifest = (await mediaDatabaseState(page)).manifest as {
      documentBinding: { pdfDigest: string; incarnation: string };
    };

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Upload a PDF, JPG, or PNG").setInputFiles({
      name: "same-name.pdf",
      mimeType: "application/pdf",
      buffer: firstPdf,
    });
    await expect(page).toHaveURL(/\/editor(?:\?.*)?$/, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("pdf-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(async () => {
        const manifest = (await mediaDatabaseState(page)).manifest as {
          documentBinding?: { incarnation?: string };
        } | null;
        return manifest?.documentBinding?.incarnation ?? null;
      })
      .not.toBe(firstManifest.documentBinding.incarnation);
    const byteIdenticalManifest = (await mediaDatabaseState(page)).manifest as {
      documentBinding: { pdfDigest: string; incarnation: string };
      overlays: unknown[];
    };
    expect(byteIdenticalManifest.documentBinding.pdfDigest).toBe(
      firstManifest.documentBinding.pdfDigest,
    );
    expect(byteIdenticalManifest.documentBinding.incarnation).not.toBe(
      firstManifest.documentBinding.incarnation,
    );
    expect(byteIdenticalManifest.overlays).toEqual([]);

    await addPng(page, await createPngFixture(page), "isolated.png");
    await waitForPersistedOverlayCount(page, 1);
    const differentPdf = await createPdfFixture("different bytes, same name");
    await replaceStoredPdfWithoutTouchingMedia(
      page,
      differentPdf,
      "same-name.pdf",
    );
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("same-name.pdf")).toBeVisible();
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    const isolatedManifest = (await mediaDatabaseState(page)).manifest as {
      documentBinding: { pdfDigest: string; incarnation: string };
      overlays: unknown[];
    };
    expect(isolatedManifest.documentBinding.pdfDigest).not.toBe(
      byteIdenticalManifest.documentBinding.pdfDigest,
    );
    expect(isolatedManifest.overlays).toEqual([]);
    expect((await mediaDatabaseState(page)).assets).toEqual([]);
    const probe = await readProbe(page);
    expect(probe.requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("append and remove page each invalidate media instead of remapping it", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    await page.route("**/api/analytics", async (route) => {
      await route.fulfill({ status: 204, body: "" });
    });
    const errors = captureBrowserErrors(page);
    await prepareEditor(page, { width: 1100, height: 850 });
    const png = await createPngFixture(page);
    await addPng(page, png, "before-append.png");
    await waitForPersistedOverlayCount(page, 1);

    await page.getByTestId("add-page-input").setInputFiles({
      name: "append.pdf",
      mimeType: "application/pdf",
      buffer: await createPdfFixture("appended page"),
    });
    await expect(page.getByText("Page 2 of 2")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    await expect
      .poll(async () => (await mediaDatabaseState(page)).assets.length)
      .toBe(0);

    await addPng(page, png, "before-remove.png");
    await waitForPersistedOverlayCount(page, 1);
    await page
      .getByRole("button", { name: "Remove Page" })
      .filter({ visible: true })
      .first()
      .click();
    const confirmation = page
      .locator("div.fixed.inset-0")
      .filter({ hasText: "This cannot be undone." });
    await confirmation.getByRole("button", { name: "Remove Page" }).click();
    await expect(
      page
        .getByRole("button", { name: "Remove Page" })
        .filter({ visible: true })
        .first(),
    ).toBeDisabled({ timeout: 15_000 });
    await expect(page.getByText(/Page \d+ of \d+/)).toHaveCount(0);
    await expect(page.getByTestId("pdf-page")).toBeVisible();
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    await expect
      .poll(async () => (await mediaDatabaseState(page)).assets.length)
      .toBe(0);
    await expect
      .poll(async () => (await readProbe(page)).analyticsPayloads.length)
      .toBe(2);
    const probe = await readProbe(page);
    const analytics = probe.analyticsPayloads.map((payload) =>
      JSON.parse(payload) as {
        name: string;
        properties: Record<string, unknown>;
      },
    );
    expect(analytics.map(({ name }) => name).sort()).toEqual([
      "page_added",
      "page_removed",
    ]);
    expect(JSON.stringify(analytics).toLowerCase()).not.toMatch(
      /media|resourceid|assetid|filename|coordinate|rotation|flip|blob|byte/,
    );
    expect(
      probe.requests.filter(
        (request) => !request.endsWith("/api/analytics"),
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a delayed stale hydration cannot publish media after Start Over", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    const errors = captureBrowserErrors(page);
    await prepareEditor(page, { width: 1100, height: 850 });
    await addPng(page, await createPngFixture(page), "delayed.png");
    await waitForPersistedOverlayCount(page, 1);
    await page.evaluate(() => {
      sessionStorage.setItem("qf-test-delay-media-hydration", "1");
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await waitForDelayedHydrationRead(page);
    await resetProbe(page);
    await page.getByRole("button", { name: "Start Over" }).click();
    await expect(page.getByTestId("document-upload-input")).toBeAttached();
    await releaseDelayedHydrationRead(page);

    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    await expect
      .poll(async () => (await mediaDatabaseState(page)).assets.length)
      .toBe(0);
    const probe = await readProbe(page);
    expect(probe.createdMediaUrls).toEqual([]);
    expect(probe.requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("corrupt stored media restores nothing while the PDF remains usable", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    await prepareEditor(page, { width: 1100, height: 850 });
    await addPng(page, await createPngFixture(page), "corrupt.png");
    await waitForPersistedOverlayCount(page, 1);
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("quickfill_db");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction("media_assets", "readwrite");
      const store = transaction.objectStore("media_assets");
      const records = await new Promise<Array<Record<string, unknown>>>(
        (resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );
      const record = records[0];
      store.put({
        ...record,
        byteLength: 3,
        blob: new Blob([Uint8Array.of(1, 2, 3)], { type: "image/png" }),
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () =>
          reject(transaction.error);
      });
      database.close();
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    await expect(page.getByText(/Media couldn’t be saved in this browser/)).toBeVisible();
    expect((await mediaDatabaseState(page)).assets).toHaveLength(0);
  });

  test("a persisted File is rejected without blocking the current PDF", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    await prepareEditor(page, { width: 1100, height: 850 });
    await addPng(page, await createPngFixture(page), "sanitized.png");
    await waitForPersistedOverlayCount(page, 1);
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("quickfill_db");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const readTransaction = database.transaction("media_assets", "readonly");
      const store = readTransaction.objectStore("media_assets");
      const records = await new Promise<Array<Record<string, unknown>>>(
        (resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );
      const record = records[0];
      const blob = record.blob;
      if (!(blob instanceof Blob)) throw new Error("Expected a stored Blob");
      const bytes = await blob.arrayBuffer();
      const writeTransaction = database.transaction(
        "media_assets",
        "readwrite",
      );
      writeTransaction.objectStore("media_assets").put({
        ...record,
        blob: new File(
          [bytes],
          "must-not-persist.png",
          { type: blob.type },
        ),
      });
      await new Promise<void>((resolve, reject) => {
        writeTransaction.oncomplete = () => resolve();
        writeTransaction.onerror = writeTransaction.onabort = () =>
          reject(writeTransaction.error);
      });
      database.close();
    });

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("media-overlay")).toHaveCount(0);
    await expect(
      page.getByText(/Media couldn’t be saved in this browser/),
    ).toHaveCount(0);
    expect((await mediaDatabaseState(page)).assets).toHaveLength(0);
  });

  test("media-only quota failure preserves the in-session overlay and warns once", async ({
    page,
  }) => {
    test.skip(!addMediaEnabled, "Persistence workflow requires the local-v1 build.");
    await prepareEditor(page, { width: 1100, height: 850 });
    await page.evaluate(() => {
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function put(
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name === "media_assets") {
          throw new DOMException("simulated media quota", "QuotaExceededError");
        }
        return originalPut.call(this, value, key);
      };
    });
    await addPng(page, await createPngFixture(page), "quota.png");

    await expect(page.getByTestId("media-overlay")).toBeVisible();
    await expect(page.getByText(/Media couldn’t be saved in this browser/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Media couldn’t be saved in this browser/)).toHaveCount(1);
    await expect(page.getByTestId("pdf-page")).toBeVisible();
  });
});
