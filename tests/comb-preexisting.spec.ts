import { expect, test, type Page } from "@playwright/test";
import {
  decodePDFRawStream,
  PDFDocument,
  PDFRawStream,
} from "pdf-lib";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

const combPreexistingEnabled =
  process.env.NEXT_PUBLIC_QUICKFILL_COMB_PREEXISTING === "v1";
const qaToken = process.env.QUICKFILL_QA_TOKEN;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const baseOrigin = new URL(baseUrl).origin;
const localRedisUrl = "http://127.0.0.1:38079";
const fixture = readFileSync(
  join(
    process.cwd(),
    "src",
    "lib",
    "__tests__",
    "fixtures",
    "comb-preexisting-browser.pdf",
  ),
);

type PersistedField = {
  id: string;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
  charCount?: number;
  cellWidth?: number;
  cellPositions?: number[];
  cellWidths?: number[];
  [key: string]: unknown;
};

type RuntimeAudit = {
  consoleErrors: string[];
  pageErrors: string[];
  externalDataRequests: string[];
  editorLoadedProperties: Array<Record<string, unknown>>;
};

function sendRedisJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    connection: "close",
  });
  response.end(JSON.stringify(body));
}

async function startLocalRedisStub(token: string) {
  const server = createServer(async (request, response) => {
    try {
      if (
        request.method !== "POST" ||
        !new Set(["/", "/pipeline"]).has(request.url ?? "")
      ) {
        sendRedisJson(response, 404, { error: "Not found" });
        return;
      }
      if (request.headers.authorization !== `Bearer ${token}`) {
        sendRedisJson(response, 401, { error: "Unauthorized" });
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 1_000_000) throw new Error("Redis request is too large");
        chunks.push(buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      if (!Array.isArray(body)) throw new Error("Expected Redis command array");
      const commands = body.every(Array.isArray) ? body : [body];
      const results = commands.map((redisCommand) => {
        const command = String(redisCommand[0] ?? "").toLowerCase();
        const key = String(redisCommand[1] ?? "");
        if (
          !new Set(["lpush", "ltrim"]).has(command) ||
          key !== "admin:download_logs"
        ) {
          throw new Error("Unsupported local Redis command");
        }
        return { result: command === "ltrim" ? "OK" : 1 };
      });
      sendRedisJson(
        response,
        200,
        request.url === "/pipeline" ? results : results[0],
      );
    } catch {
      sendRedisJson(response, 400, { error: "Invalid local Redis request" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => reject(error);
    server.once("error", handleError);
    server.listen(38079, "127.0.0.1", () => {
      server.off("error", handleError);
      resolve();
    });
  });
  return server;
}

async function stopLocalRedisStub(server: Server | undefined) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function installRuntimeAudit(page: Page): Promise<RuntimeAudit> {
  const audit: RuntimeAudit = {
    consoleErrors: [],
    pageErrors: [],
    externalDataRequests: [],
    editorLoadedProperties: [],
  };

  await page.addInitScript(() => {
    const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      const target = new URL(String(url), window.location.href);
      if (target.pathname === "/api/analytics") return false;
      return originalSendBeacon ? originalSendBeacon(url, data) : false;
    };
  });
  await page.route("**/_vercel/insights/script.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );
  await page.route("**/api/usage", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ isPro: false, tier: "free" }),
    }),
  );
  await page.route("**/api/analytics", async (route) => {
    try {
      const payload = route.request().postDataJSON() as {
        name?: unknown;
        properties?: unknown;
      };
      if (
        payload.name === "editor_pdf_loaded" &&
        payload.properties &&
        typeof payload.properties === "object" &&
        !Array.isArray(payload.properties)
      ) {
        audit.editorLoadedProperties.push(
          payload.properties as Record<string, unknown>,
        );
      }
    } catch {
      // The payload assertion below fails if the expected event is absent.
    }
    await route.fulfill({ status: 204, body: "" });
  });
  page.on("console", (message) => {
    if (message.type() === "error") audit.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => audit.pageErrors.push(error.message));
  page.on("request", (request) => {
    if (!new Set(["fetch", "xhr"]).has(request.resourceType())) return;
    const url = new URL(request.url());
    // Clerk's Development FAPI uses deployment-specific hosts under
    // accounts.dev; the feature must not add any other cross-origin request.
    if (url.hostname.endsWith(".accounts.dev")) return;
    if (url.origin !== baseOrigin) {
      audit.externalDataRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
  });

  return audit;
}

async function resetEditorStorage(page: Page) {
  await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("qf_welcome_dismissed", "1");
    localStorage.setItem("quickfill_welcomed", "1");
    localStorage.setItem("quickfill_tour_done", "1");
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("quickfill_db");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("document-upload-input")).toBeAttached();
}

async function uploadFixture(page: Page) {
  await page.getByTestId("document-upload-input").setInputFiles({
    name: "comb-preexisting-browser.pdf",
    mimeType: "application/pdf",
    buffer: fixture,
  });
  await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Rendering PDF...", { exact: true })).toBeHidden();
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

async function readFields(page: Page): Promise<PersistedField[]> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("quickfill_fields") ?? "[]"),
  );
}

async function readField(page: Page, id: string) {
  return (await readFields(page)).find((field) => field.id === id) ?? null;
}

async function expectFieldType(page: Page, id: string, type: string) {
  await expect.poll(async () => (await readField(page, id))?.type).toBe(type);
  return (await readField(page, id))!;
}

async function expectCleanAudit(page: Page, audit: RuntimeAudit) {
  await expect.poll(() => audit.editorLoadedProperties.length).toBeGreaterThan(0);
  for (const properties of audit.editorLoadedProperties) {
    expect(Object.keys(properties).sort()).toEqual([
      "detectedFieldCount",
      "hasAcroForm",
      "sizeKb",
      "source",
    ]);
  }
  expect(audit.externalDataRequests).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  expect(audit.consoleErrors).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function decodedPdfStreams(bytes: Uint8Array): Promise<string> {
  const pdfDocument = await PDFDocument.load(bytes);
  let decoded = "";
  for (const [, object] of pdfDocument.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    try {
      decoded += Buffer.from(decodePDFRawStream(object).decode()).toString(
        "latin1",
      );
    } catch {
      decoded += Buffer.from(object.getContents()).toString("latin1");
    }
  }
  return decoded;
}

async function renderedPdfPageText(bytes: Buffer, pageNumber = 1) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
  }).promise;
  try {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
  } finally {
    await document.destroy();
  }
}

function characterCount(text: string, character: string) {
  return Array.from(text).filter((candidate) => candidate === character)
    .length;
}

function textDrawsForMarker(decoded: string, marker: string) {
  const markerToken = `<${Buffer.from(marker, "latin1").toString("hex")}> Tj`;
  const normalized = decoded.toLowerCase();
  const normalizedMarker = markerToken.toLowerCase();
  const number = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?";
  const draws: Array<{ x: number; y: number }> = [];
  let searchFrom = 0;

  while (searchFrom < normalized.length) {
    const markerIndex = normalized.indexOf(normalizedMarker, searchFrom);
    if (markerIndex < 0) break;
    const prefix = decoded.slice(Math.max(0, markerIndex - 300), markerIndex);
    const matrices = [
      ...prefix.matchAll(
        new RegExp(`1 0 0 1 (${number}) (${number}) Tm`, "gi"),
      ),
    ];
    const matrix = matrices.at(-1);
    if (matrix) draws.push({ x: Number(matrix[1]), y: Number(matrix[2]) });
    searchFrom = markerIndex + normalizedMarker.length;
  }

  return draws;
}

function uniqueTextDrawsForMarker(decoded: string, marker: string) {
  return Array.from(
    new Map(
      textDrawsForMarker(decoded, marker).map((draw) => [
        `${draw.x}:${draw.y}`,
        draw,
      ] as const),
    ).values(),
  );
}

if (combPreexistingEnabled) {
  test.describe("comb-aware pre-existing fields (flag on)", () => {
    let redisStub: Server | undefined;

    test.beforeAll(async () => {
      expect(
        qaToken,
        "QUICKFILL_QA_TOKEN is required for the download proof",
      ).toBeTruthy();
      expect(process.env.UPSTASH_REDIS_REST_URL).toBe(localRedisUrl);
      expect(process.env.UPSTASH_REDIS_REST_TOKEN).toBe(qaToken);
      redisStub = await startLocalRedisStub(qaToken!);
    });

    test.afterAll(async () => {
      await stopLocalRedisStub(redisStub);
    });

    test("hydrates declarations, normalizes conservative visual matches lazily, and preserves undo", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const audit = await installRuntimeAudit(page);
      await resetEditorStorage(page);
      await uploadFixture(page);

      await expect.poll(async () => (await readFields(page)).length).toBe(8);
      const declared = await expectFieldType(page, "declared-comb", "comb");
      expect(declared.value).toBe("123");
      expect(declared.charCount).toBe(6);
      expect(declared).not.toHaveProperty("cellWidth");
      expect(declared).not.toHaveProperty("cellPositions");
      expect(declared).not.toHaveProperty("cellWidths");

      const visual = await expectFieldType(page, "visual-comb", "comb");
      expect(visual.value).toBe("45");
      expect(visual.charCount).toBe(6);
      expect(visual.cellPositions).toHaveLength(6);
      expect(visual.cellWidths).toHaveLength(6);
      await expectFieldType(page, "ambiguous-text", "text");
      await expectFieldType(page, "oversized-text", "text");
      await expectFieldType(page, "multiline-text", "text");
      await expectFieldType(page, "choice-field", "text");
      await expectFieldType(page, "page-two-comb", "text");

      const originalIds = new Set((await readFields(page)).map((field) => field.id));
      await page
        .locator('button[title="Text field: tap or drag to place"]:visible')
        .first()
        .click();
      await page
        .getByTestId("pdf-page")
        .locator(".konvajs-content canvas")
        .first()
        .click({ position: { x: 330, y: 330 } });
      await expect.poll(async () => (await readFields(page)).length).toBe(9);
      const manualField = (await readFields(page)).find(
        (field) => !originalIds.has(field.id),
      );
      expect(manualField).toBeDefined();
      await page.keyboard.press("Escape");

      const pager = page.getByText("Page 1 of 2", { exact: true }).filter({ visible: true });
      await expect(pager).toHaveCount(1);
      await pager.locator("..").locator("button").nth(1).click();
      const pageTwo = await expectFieldType(page, "page-two-comb", "comb");
      expect(pageTwo.value).toBe("67");
      expect(pageTwo.charCount).toBe(6);
      expect(pageTwo.cellPositions).toHaveLength(6);

      await page.keyboard.press("Control+z");
      await expect.poll(async () => readField(page, manualField!.id)).toBeNull();
      await expectFieldType(page, "page-two-comb", "comb");
      await expectCleanAudit(page, audit);
    });

    test("downloads a prefilled source value exactly once after upgrade", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const audit = await installRuntimeAudit(page);
      await page.setExtraHTTPHeaders({ "x-quickfill-qa-token": qaToken! });
      await page.route("**/api/usage", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ isPro: true, tier: "pro" }),
        }),
      );
      await resetEditorStorage(page);
      await uploadFixture(page);
      const upgraded = await expectFieldType(page, "download-comb", "comb");
      expect(upgraded.value).toBe("VX");

      const downloadPromise = page.waitForEvent("download");
      await page
        .locator('button[title="Download filled PDF"]:visible')
        .click();
      const download = await downloadPromise;
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const downloadedBytes = Buffer.from(await readFile(downloadPath!));
      const renderedText = await renderedPdfPageText(downloadedBytes);

      expect(characterCount(renderedText, "V")).toBe(1);
      expect(characterCount(renderedText, "X")).toBe(1);
      await expectCleanAudit(page, audit);
    });

    test("retroactively upgrades a saved value and downloads one character per cell", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const audit = await installRuntimeAudit(page);
      await page.setExtraHTTPHeaders({ "x-quickfill-qa-token": qaToken! });
      await page.route("**/api/usage", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ isPro: true, tier: "pro" }),
        }),
      );
      await resetEditorStorage(page);
      await uploadFixture(page);
      await expectFieldType(page, "download-comb", "comb");

      await page.evaluate(() => {
        const fields = JSON.parse(
          localStorage.getItem("quickfill_fields") ?? "[]",
        ) as Array<Record<string, unknown>>;
        const field = fields.find((candidate) => candidate.id === "download-comb");
        if (!field) throw new Error("Missing download-comb field");
        field.type = "text";
        field.value = "89";
        field.fontSize = 12;
        delete field.charCount;
        delete field.cellWidth;
        delete field.cellPositions;
        delete field.cellWidths;
        localStorage.setItem("quickfill_fields", JSON.stringify(fields));
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
      const restored = await expectFieldType(page, "download-comb", "comb");
      expect(restored.value).toBe("89");
      expect(restored.charCount).toBe(6);
      expect(restored.cellPositions).toHaveLength(6);

      const downloadPromise = page.waitForEvent("download");
      await page
        .locator('button[title="Download filled PDF"]:visible')
        .click();
      const download = await downloadPromise;
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const downloadedBytes = Buffer.from(await readFile(downloadPath!));
      const decoded = await decodedPdfStreams(downloadedBytes);
      const renderedText = await renderedPdfPageText(downloadedBytes);
      const eights = uniqueTextDrawsForMarker(decoded, "8");
      const nines = uniqueTextDrawsForMarker(decoded, "9");

      expect(characterCount(renderedText, "V")).toBe(0);
      expect(characterCount(renderedText, "X")).toBe(0);
      expect(characterCount(renderedText, "8")).toBe(1);
      expect(characterCount(renderedText, "9")).toBe(1);
      expect(eights).toHaveLength(1);
      expect(nines).toHaveLength(1);
      expect(nines[0].x - eights[0].x).toBeGreaterThanOrEqual(18);
      expect(nines[0].x - eights[0].x).toBeLessThanOrEqual(22);
      expect(nines[0].y).toBeCloseTo(eights[0].y, 6);
      await expectCleanAudit(page, audit);
    });
  });
} else {
  test("flag off preserves master hydration with every AcroForm field as text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const audit = await installRuntimeAudit(page);
    await resetEditorStorage(page);
    await uploadFixture(page);

    await expect.poll(async () => (await readFields(page)).length).toBe(8);
    await page.waitForTimeout(750);
    const fields = await readFields(page);
    expect(fields.map((field) => field.id).sort()).toEqual([
      "ambiguous-text",
      "choice-field",
      "declared-comb",
      "download-comb",
      "multiline-text",
      "oversized-text",
      "page-two-comb",
      "visual-comb",
    ]);
    expect(fields.every((field) => field.type === "text")).toBe(true);
    expect(fields.some((field) => "charCount" in field)).toBe(false);
    await expectCleanAudit(page, audit);
  });
}
