import { expect, test, type Locator, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const localBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const loopbackHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      loopbackHostnames.has(url.hostname.toLowerCase()) &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

const runsAgainstLocalApp = isLoopbackBaseUrl(localBaseUrl);
const PDF_WIDTH = 612;
const MINIMUM_TOUCH_TARGET = 44;

type Interaction = "mouse" | "touch";

type PersistedField = {
  id: string;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  charCount?: number;
  cursorIndex?: number | null;
  [key: string]: unknown;
};

type RuntimeAudit = {
  consoleErrors: string[];
  pageErrors: string[];
  forbiddenApiCalls: string[];
  unexpectedApiCalls: string[];
  usageApiCalls: number;
  analyticsApiCalls: number;
  analyticsPayloads: number;
};

const allowedAnalyticsProperties = new Map<string, Set<string>>([
  ["editor_upload_started", new Set(["sizeKb"])],
  [
    "editor_pdf_loaded",
    new Set(["source", "sizeKb", "hasAcroForm", "detectedFieldCount"]),
  ],
  ["field_added", new Set(["source", "type", "snapped"])],
]);

const tools = [
  { title: "Select fields", accessibleName: /Select/ },
  { title: "Text field: tap or drag to place", accessibleName: /Text/ },
  { title: "Box field: drag across character boxes", accessibleName: /Box/ },
] as const;

async function createDeviceInputPdf() {
  const pdfDocument = await PDFDocument.create();
  const pdfPage = pdfDocument.addPage([PDF_WIDTH, 792]);
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);

  pdfPage.drawText("QuickFill cross-device input baseline", {
    x: 48,
    y: 730,
    size: 18,
    font,
    color: rgb(0.05, 0.08, 0.15),
  });

  return Buffer.from(await pdfDocument.save());
}

function auditAnalyticsPayload(audit: RuntimeAudit, postData: string) {
  try {
    const payload = JSON.parse(postData) as {
      name?: unknown;
      properties?: unknown;
      [key: string]: unknown;
    };
    const envelopeKeys = Object.keys(payload).sort();
    const allowedProperties =
      typeof payload.name === "string" ? allowedAnalyticsProperties.get(payload.name) : undefined;
    const properties = payload.properties;
    const propertyRecord =
      properties && typeof properties === "object" && !Array.isArray(properties)
        ? (properties as Record<string, unknown>)
        : {};
    const propertyKeys = Object.keys(propertyRecord);
    const hasUnexpectedProperty =
      !allowedProperties ||
      propertyKeys.length !== allowedProperties.size ||
      propertyKeys.some((key) => !allowedProperties.has(key));
    const hasUnexpectedValue =
      payload.name === "editor_upload_started"
        ? typeof propertyRecord.sizeKb !== "number"
        : payload.name === "editor_pdf_loaded"
          ? propertyRecord.source !== "upload" ||
            typeof propertyRecord.sizeKb !== "number" ||
            typeof propertyRecord.hasAcroForm !== "boolean" ||
            typeof propertyRecord.detectedFieldCount !== "number"
          : payload.name === "field_added"
            ? propertyRecord.source !== "manual" ||
              !["text", "comb", "date"].includes(String(propertyRecord.type)) ||
              typeof propertyRecord.snapped !== "boolean"
            : true;

    if (
      envelopeKeys.length !== 2 ||
      envelopeKeys[0] !== "name" ||
      envelopeKeys[1] !== "properties" ||
      hasUnexpectedProperty ||
      hasUnexpectedValue
    ) {
      audit.unexpectedApiCalls.push("POST /api/analytics with unexpected analytics payload");
    }
  } catch {
    audit.unexpectedApiCalls.push("POST /api/analytics with unreadable analytics payload");
  }
}

async function installRuntimeAudit(page: Page): Promise<RuntimeAudit> {
  const audit: RuntimeAudit = {
    consoleErrors: [],
    pageErrors: [],
    forbiddenApiCalls: [],
    unexpectedApiCalls: [],
    usageApiCalls: 0,
    analyticsApiCalls: 0,
    analyticsPayloads: 0,
  };
  const localOrigin = new URL(localBaseUrl).origin;
  const forbiddenApiPrefixes = [
    "/api/detect-fields",
    "/api/fill-pdf",
    "/api/fills",
    "/api/profile",
    "/api/session",
    "/api/signature",
  ];

  await page.addInitScript(() => {
    const originalSendBeacon = navigator.sendBeacon?.bind(navigator);

    navigator.sendBeacon = (url, data) => {
      const target = new URL(String(url), window.location.href);
      // Chromium does not expose Blob-backed beacon bodies to Playwright.
      // Returning false exercises the application's existing fetch fallback,
      // preserving one real localhost request whose payload can be audited.
      if (target.pathname === "/api/analytics") return false;
      return originalSendBeacon ? originalSendBeacon(url, data) : false;
    };
  });

  page.on("console", (message) => {
    if (message.type() === "error") audit.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => audit.pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;

    const requestLabel = `${request.method()} ${url.pathname}${url.search}`;
    if (url.origin !== localOrigin) {
      audit.unexpectedApiCalls.push(`${requestLabel} on ${url.origin}`);
      return;
    }

    if (
      forbiddenApiPrefixes.some(
        (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
      )
    ) {
      audit.forbiddenApiCalls.push(requestLabel);
      return;
    }

    if (url.pathname === "/api/usage") {
      audit.usageApiCalls += 1;
      if (request.method() !== "GET" || url.search !== "" || request.postData() !== null) {
        audit.unexpectedApiCalls.push(requestLabel);
      }
      return;
    }

    if (url.pathname === "/api/analytics") {
      audit.analyticsApiCalls += 1;
      const postData = request.postData();
      if (request.method() !== "POST" || url.search !== "") {
        audit.unexpectedApiCalls.push(requestLabel);
        return;
      }
      if (postData) {
        audit.analyticsPayloads += 1;
        auditAnalyticsPayload(audit, postData);
      }
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      audit.unexpectedApiCalls.push(requestLabel);
    }
  });

  return audit;
}

async function expectCleanRuntime(audit: RuntimeAudit) {
  await expect
    .poll(() => audit.analyticsPayloads, {
      message: "Every analytics request should have one audited payload",
    })
    .toBe(audit.analyticsApiCalls);
  expect(audit.forbiddenApiCalls, "Forbidden sensitive API calls").toEqual([]);
  expect(audit.unexpectedApiCalls, "Unexpected local API calls").toEqual([]);
  expect(audit.usageApiCalls, "Expected bounded usage reads").toBeGreaterThan(0);
  expect(audit.usageApiCalls, "Expected bounded usage reads").toBeLessThanOrEqual(20);
  expect(audit.analyticsApiCalls, "Expected bounded analytics writes").toBeGreaterThan(0);
  expect(audit.analyticsApiCalls, "Expected bounded analytics writes").toBeLessThanOrEqual(8);
  expect(audit.pageErrors, "Unexpected page errors").toEqual([]);
  expect(audit.consoleErrors, "Unexpected console errors").toEqual([]);
}

async function prepareEmptyEditor(page: Page) {
  await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("document-upload-input")).toBeAttached();
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
  await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("document-upload-input")).toBeAttached();
}

async function uploadDeviceInputPdf(page: Page, name: string) {
  await page.getByTestId("document-upload-input").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: await createDeviceInputPdf(),
  });
  await waitForDocumentReady(page);
}

async function waitForDocumentReady(page: Page) {
  const pdfPage = page.getByTestId("pdf-page");
  await expect(pdfPage).toBeVisible({ timeout: 15_000 });
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
  await expect(page.getByText("Failed to render PDF. The file may be corrupted.")).toHaveCount(0);
  await expect(page.getByTestId("local-save-status")).toHaveText(/Saved locally|Restored locally/);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
}

async function expectDocumentFitted(page: Page) {
  const metrics = await page.getByTestId("pdf-page").evaluate((pdfPage) => {
    const scrollViewport = pdfPage.parentElement?.parentElement;
    if (!scrollViewport) throw new Error("Expected the PDF scroll viewport");
    const pageRect = pdfPage.getBoundingClientRect();
    const viewportRect = scrollViewport.getBoundingClientRect();
    return {
      pageWidth: pageRect.width,
      viewportWidth: scrollViewport.clientWidth,
      pageLeft: pageRect.left,
      pageRight: pageRect.right,
      viewportLeft: viewportRect.left,
      viewportRight: viewportRect.right,
    };
  });

  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.pageLeft).toBeGreaterThanOrEqual(metrics.viewportLeft - 1);
  expect(metrics.pageRight).toBeLessThanOrEqual(metrics.viewportRight + 1);
}

function visibleTool(page: Page, title: (typeof tools)[number]["title"]) {
  return page.getByTitle(title).filter({ visible: true });
}

async function tapLocator(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function activate(locator: Locator, page: Page, interaction: Interaction) {
  if (interaction === "touch") await tapLocator(page, locator);
  else await locator.click();
}

async function visibleToolbarSurface(page: Page) {
  const mobileDownload = page.getByTitle("Download PDF").filter({ visible: true });
  if ((await mobileDownload.count()) === 1) return mobileDownload.locator("xpath=..");

  const desktopDownload = page.getByTitle("Download filled PDF").filter({ visible: true });
  await expect(desktopDownload).toHaveCount(1);
  return desktopDownload.locator("xpath=../..");
}

async function expectMinimumTouchTargets(surface: Locator, surfaceLabel: string) {
  const targets = surface.locator("button:visible, [role='button']:visible");
  const targetCount = await targets.count();
  expect(targetCount, `${surfaceLabel} should expose actionable controls`).toBeGreaterThan(0);

  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    const target = targets.nth(targetIndex);
    await target.scrollIntoViewIfNeeded();
    const metric = await target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      return {
        label:
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent?.trim() ||
          element.tagName.toLowerCase(),
        width: rect.width,
        height: rect.height,
        hitTestVisible: Boolean(hitTarget && (hitTarget === element || element.contains(hitTarget))),
      };
    });

    expect(metric.width, `${surfaceLabel}: ${metric.label} target width`).toBeGreaterThanOrEqual(
      MINIMUM_TOUCH_TARGET
    );
    expect(metric.height, `${surfaceLabel}: ${metric.label} target height`).toBeGreaterThanOrEqual(
      MINIMUM_TOUCH_TARGET
    );
    expect(metric.hitTestVisible, `${surfaceLabel}: ${metric.label} should receive input`).toBe(true);
  }

  const metrics = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        label:
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent?.trim() ||
          element.tagName.toLowerCase(),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    })
  );

  for (let firstIndex = 0; firstIndex < metrics.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < metrics.length; secondIndex += 1) {
      const first = metrics[firstIndex];
      const second = metrics[secondIndex];
      const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
      const overlapHeight = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
      expect(
        overlapWidth > 0.5 && overlapHeight > 0.5,
        `${surfaceLabel}: ${first.label} overlaps ${second.label}`
      ).toBe(false);
    }
  }
}

async function expectSelectedFieldTouchTargets(page: Page) {
  const mobileSheet = page.getByTestId("mobile-field-sheet").filter({ visible: true });
  if ((await mobileSheet.count()) === 1) {
    await expect(page.getByTestId("desktop-field-edit")).toBeHidden();
    await expectMinimumTouchTargets(mobileSheet, "mobile selected-field sheet");
    return;
  }

  const contextPanel = page.getByTestId("context-panel").filter({ visible: true });
  await expect(contextPanel).toHaveCount(1);
  await expect(page.getByTestId("mobile-field-edit")).toBeHidden();
  await expectMinimumTouchTargets(contextPanel, "1024px selected-field panel");
}

async function expectPrimaryControls(
  page: Page,
  interaction: Interaction,
  enforceTouchTargets: boolean
) {
  for (const tool of tools) {
    const control = visibleTool(page, tool.title);
    await expect(control).toHaveCount(1);
    await expect(control).toBeVisible();
    await expect(control).toHaveAccessibleName(tool.accessibleName);
  }

  const selectTool = visibleTool(page, "Select fields");
  const textTool = visibleTool(page, "Text field: tap or drag to place");
  await expect(selectTool).toHaveClass(/bg-accent/);
  await activate(textTool, page, interaction);
  await expect(textTool).toHaveClass(/bg-accent/);
  if (enforceTouchTargets) {
    await expectMinimumTouchTargets(await visibleToolbarSurface(page), "editor toolbar");
  }
  await activate(selectTool, page, interaction);
  await expect(selectTool).toHaveClass(/bg-accent/);
}

async function expectHelpAndStartOverReachable(
  page: Page,
  interaction: Interaction,
  usesMobileToolbar: boolean,
  enforceTouchTargets: boolean
) {
  if (usesMobileToolbar) {
    const actions = page.getByRole("button", { name: "More actions" });
    await expect(actions).toBeVisible();
    await expect(actions).toHaveAttribute("aria-expanded", "false");
    await activate(actions, page, interaction);
    await expect(actions).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("group", { name: "Actions" });
    const help = page.getByRole("button", { name: "Help", exact: true });
    const startOver = page.getByRole("button", { name: "Start Over", exact: true });
    await expect(help).toBeVisible();
    await expect(startOver).toBeVisible();
    if (enforceTouchTargets) {
      await expectMinimumTouchTargets(menu, "mobile Help and Start Over menu");
    }
    await page.keyboard.press("Escape");
    await expect(actions).toHaveAttribute("aria-expanded", "false");
    return;
  }

  const help = page.getByTitle("Show tutorial").filter({ visible: true });
  const startOver = page.getByTitle("Clear all fields and start fresh").filter({ visible: true });
  await expect(help).toBeVisible();
  await expect(help).toHaveAccessibleName("Show tutorial");
  await expect(startOver).toBeVisible();
  await expect(startOver).toHaveAccessibleName("Start Over");
  if (enforceTouchTargets) {
    const helpBox = await help.boundingBox();
    const startOverBox = await startOver.boundingBox();
    expect(helpBox?.width ?? 0).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
    expect(helpBox?.height ?? 0).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
    expect(startOverBox?.width ?? 0).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
    expect(startOverBox?.height ?? 0).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET);
  }
}

async function expectEditorBaseline(
  page: Page,
  interaction: Interaction,
  usesMobileToolbar: boolean,
  enforceTouchTargets = usesMobileToolbar
) {
  await waitForDocumentReady(page);
  await expectPrimaryControls(page, interaction, enforceTouchTargets);
  await expectHelpAndStartOverReachable(
    page,
    interaction,
    usesMobileToolbar,
    enforceTouchTargets
  );
  await expectNoHorizontalOverflow(page);
  await expectDocumentFitted(page);
}

async function interactAtPageFraction(
  page: Page,
  interaction: Interaction,
  xFraction: number,
  yFraction: number
) {
  const pdfPage = page.getByTestId("pdf-page");
  await pdfPage.scrollIntoViewIfNeeded();
  const box = await pdfPage.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * xFraction;
  const y = box!.y + box!.height * yFraction;

  if (interaction === "touch") await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function clientPointForField(
  page: Page,
  field: PersistedField,
  fieldXFraction = 0.5,
  fieldYFraction = 0.5
) {
  const pageBox = await page.getByTestId("pdf-page").boundingBox();
  expect(pageBox).not.toBeNull();
  const scale = pageBox!.width / PDF_WIDTH;
  return {
    x: pageBox!.x + (field.x + field.width * fieldXFraction) * scale,
    y: pageBox!.y + (field.y + field.height * fieldYFraction) * scale,
  };
}

async function selectPersistedField(
  page: Page,
  field: PersistedField,
  interaction: Interaction,
  fieldXFraction = 0.5
) {
  const point = await clientPointForField(page, field, fieldXFraction);
  if (interaction === "touch") await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function readPersistedFields(page: Page): Promise<PersistedField[]> {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("quickfill_fields") ?? "[]") as PersistedField[]
  );
}

async function persistedField(page: Page, type: string) {
  const fields = await readPersistedFields(page);
  const field = fields.find((candidate) => candidate.type === type);
  if (!field) throw new Error(`Expected a persisted ${type} field`);
  return field;
}

async function waitForFieldCount(page: Page, count: number) {
  await expect.poll(async () => (await readPersistedFields(page)).length).toBe(count);
}

async function focusSelectedTextField(
  page: Page,
  interaction: Interaction,
  persistedTextField?: PersistedField,
  desktopEditActivation: "interaction" | "keyboard" = "interaction"
) {
  const mobileEdit = page.getByTestId("mobile-field-edit");
  const desktopEdit = page.getByTestId("desktop-field-edit").filter({ visible: true });
  if (await mobileEdit.isVisible()) {
    await activate(mobileEdit, page, interaction);
  } else if (interaction === "touch" && (await desktopEdit.count()) === 1) {
    await expect(desktopEdit).toHaveAccessibleName(/Edit (Text|Date)/);
    if (desktopEditActivation === "keyboard") {
      await desktopEdit.focus();
      await expect(desktopEdit).toBeFocused();
      await page.keyboard.press("Enter");
    } else {
      await activate(desktopEdit, page, interaction);
    }
  } else if (persistedTextField) {
    const point = await clientPointForField(page, persistedTextField);
    if (interaction === "mouse") await page.mouse.dblclick(point.x, point.y);
    else await page.touchscreen.tap(point.x, point.y);
  }

  const editor = page.getByTestId("pdf-field-editor");
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  return editor;
}

async function dismissMobileSelection(page: Page, interaction: Interaction) {
  const usesCompactSurface = await page.evaluate(() =>
    window.matchMedia("(max-width: 1023px)").matches
  );
  if (!usesCompactSurface) return;

  const done = page.getByTestId("mobile-field-done");
  await expect(done).toBeVisible();
  await activate(done, page, interaction);
  await expect(done).toBeHidden();
}

async function placeTextAndBox(
  page: Page,
  interaction: Interaction,
  textValue: string,
  boxValue: string,
  enforceTouchTargets = false
) {
  const textTool = visibleTool(page, "Text field: tap or drag to place");
  await activate(textTool, page, interaction);
  await expect(textTool).toHaveClass(/bg-accent/);
  await interactAtPageFraction(page, interaction, 0.3, 0.3);
  await waitForFieldCount(page, 1);
  if (enforceTouchTargets) await expectSelectedFieldTouchTargets(page);

  const textEditor = await focusSelectedTextField(page, interaction);
  // Focus plus browser insertion establishes editable-focus/software-keyboard readiness.
  // It does not prove that a physical operating-system keyboard appeared.
  await page.keyboard.insertText(textValue);
  await expect(textEditor).toHaveValue(textValue);
  await expect.poll(async () => (await persistedField(page, "text")).value).toBe(textValue);
  await textEditor.press("Enter");
  await dismissMobileSelection(page, interaction);

  const boxTool = visibleTool(page, "Box field: drag across character boxes");
  await activate(boxTool, page, interaction);
  await expect(boxTool).toHaveClass(/bg-accent/);
  await interactAtPageFraction(page, interaction, 0.55, 0.38);
  await waitForFieldCount(page, 2);
  if (enforceTouchTargets) await expectSelectedFieldTouchTargets(page);
  await page.keyboard.type(boxValue);
  await expect
    .poll(async () => (await persistedField(page, "comb")).value.trimEnd())
    .toBe(boxValue);
  await expect(page.getByTestId("local-save-status")).toContainText("Saved locally");
}

async function expectPersistedFields(page: Page, expectedFields: PersistedField[]) {
  await expect.poll(async () => readPersistedFields(page)).toEqual(expectedFields);
}

async function exercisePersistedFields(
  page: Page,
  interaction: Interaction,
  expectedFields: PersistedField[],
  enforceTouchTargets = false,
  desktopEditActivation: "interaction" | "keyboard" = "interaction",
  restoredTextInsertion = ""
) {
  const textField = expectedFields.find((field) => field.type === "text");
  const boxField = expectedFields.find((field) => field.type === "comb");
  expect(textField).toBeDefined();
  expect(boxField).toBeDefined();

  await selectPersistedField(page, textField!, interaction);
  if (enforceTouchTargets) await expectSelectedFieldTouchTargets(page);
  const textEditor = await focusSelectedTextField(
    page,
    interaction,
    textField,
    desktopEditActivation
  );
  await expect(textEditor).toHaveValue(textField!.value);
  if (restoredTextInsertion) {
    await textEditor.press("End");
    await page.keyboard.insertText(restoredTextInsertion);
    const expectedTextValue = `${textField!.value}${restoredTextInsertion}`;
    await expect(textEditor).toHaveValue(expectedTextValue);
    await expect.poll(async () => (await persistedField(page, "text")).value).toBe(expectedTextValue);
  }
  await textEditor.press("Escape");
  await dismissMobileSelection(page, interaction);

  const firstCellFraction = 0.5 / (boxField!.charCount ?? 1);
  await selectPersistedField(page, boxField!, interaction, firstCellFraction);
  if (enforceTouchTargets) await expectSelectedFieldTouchTargets(page);
  await expect.poll(async () => (await persistedField(page, "comb")).cursorIndex).not.toBeNull();
  const focusedBox = await persistedField(page, "comb");
  expect(focusedBox.cursorIndex).toBeGreaterThanOrEqual(0);
  expect(focusedBox.cursorIndex).toBeLessThan(focusedBox.charCount ?? 0);
  await page.keyboard.type("Z");
  await expect
    .poll(async () => (await persistedField(page, "comb")).value[focusedBox.cursorIndex!])
    .toBe("Z");
  await expectNoHorizontalOverflow(page);
}

async function restoreAndExerciseFields(
  page: Page,
  interaction: Interaction,
  expectedFields: PersistedField[],
  enforceTouchTargets = false
) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDocumentReady(page);
  await expectPersistedFields(page, expectedFields);
  await exercisePersistedFields(page, interaction, expectedFields, enforceTouchTargets);
}

test.describe("cross-device editor input baseline", () => {
  test.skip(!runsAgainstLocalApp, "Requires PLAYWRIGHT_BASE_URL pointing at a local app.");
  test.setTimeout(60_000);

  test.describe("desktop mouse and keyboard", () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false });

    test("desktop 1440x900 places, restores, selects, and focuses Text and Box fields", async ({
      page,
    }) => {
      const audit = await installRuntimeAudit(page);
      await prepareEmptyEditor(page);
      await uploadDeviceInputPdf(page, "desktop-device-input.pdf");
      await expectEditorBaseline(page, "mouse", false);

      await placeTextAndBox(page, "mouse", "Desktop input", "D7");
      const savedFields = await readPersistedFields(page);
      await restoreAndExerciseFields(page, "mouse", savedFields);

      await expectCleanRuntime(audit);
    });
  });

  test.describe("phone touch input", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("phone 390x844 proves editable-focus/software-keyboard readiness, not keyboard appearance", async ({
      page,
    }) => {
      const audit = await installRuntimeAudit(page);
      await prepareEmptyEditor(page);
      await uploadDeviceInputPdf(page, "phone-device-input.pdf");
      await expectEditorBaseline(page, "touch", true);

      await placeTextAndBox(page, "touch", "Phone input", "P7", true);
      const savedFields = await readPersistedFields(page);
      await restoreAndExerciseFields(page, "touch", savedFields, true);

      await expectCleanRuntime(audit);
    });
  });

  test.describe("compact phone touch input", () => {
    test.use({ viewport: { width: 320, height: 700 }, hasTouch: true });

    test("compact phone 320x700 exercises restored Text and Box input without overflow", async ({
      page,
    }) => {
      const audit = await installRuntimeAudit(page);
      await prepareEmptyEditor(page);
      await uploadDeviceInputPdf(page, "compact-phone-device-input.pdf");
      await expectEditorBaseline(page, "touch", true);
      await placeTextAndBox(page, "touch", "Compact input", "C7", true);
      const savedFields = await readPersistedFields(page);
      await restoreAndExerciseFields(page, "touch", savedFields, true);

      await expectCleanRuntime(audit);
    });
  });

  test.describe("tablet portrait touch input", () => {
    test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

    test("tablet portrait 768x1024 exercises restored Text and Box touch input", async ({
      page,
    }) => {
      const audit = await installRuntimeAudit(page);
      await prepareEmptyEditor(page);
      await uploadDeviceInputPdf(page, "tablet-portrait-device-input.pdf");
      await expectEditorBaseline(page, "touch", true);
      await placeTextAndBox(page, "touch", "Portrait input", "R7", true);
      const savedFields = await readPersistedFields(page);
      await restoreAndExerciseFields(page, "touch", savedFields, true);

      await expectCleanRuntime(audit);
    });
  });

  test.describe("tablet orientation input", () => {
    test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

    test("tablet landscape 1024x768 preserves restored fields and refits after rotation", async ({
      page,
    }) => {
      const audit = await installRuntimeAudit(page);
      await prepareEmptyEditor(page);
      await uploadDeviceInputPdf(page, "tablet-orientation-device-input.pdf");
      await expectEditorBaseline(page, "touch", true);
      await placeTextAndBox(page, "touch", "Tablet input", "T7", true);
      const savedFields = await readPersistedFields(page);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForDocumentReady(page);
      await expectPersistedFields(page, savedFields);
      const portraitWidth = (await page.getByTestId("pdf-page").boundingBox())?.width ?? 0;

      await page.setViewportSize({ width: 1024, height: 768 });
      await waitForDocumentReady(page);
      await expect
        .poll(async () => (await page.getByTestId("pdf-page").boundingBox())?.width ?? 0)
        .not.toBe(portraitWidth);
      await expectPersistedFields(page, savedFields);
      await expectPrimaryControls(page, "touch", true);
      await expectHelpAndStartOverReachable(page, "touch", false, true);
      await expectNoHorizontalOverflow(page);
      await expectDocumentFitted(page);
      await exercisePersistedFields(page, "touch", savedFields, true, "keyboard", " landscape");
      await expectDocumentFitted(page);

      const dateTool = page
        .getByTitle("Date: tap to stamp today's date")
        .filter({ visible: true });
      await activate(dateTool, page, "touch");
      await interactAtPageFraction(page, "touch", 0.7, 0.55);
      await waitForFieldCount(page, 3);
      const fieldsWithDate = await readPersistedFields(page);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForDocumentReady(page);
      await expectPersistedFields(page, fieldsWithDate);
      const restoredDate = await persistedField(page, "date");
      await activate(visibleTool(page, "Select fields"), page, "touch");
      await selectPersistedField(page, restoredDate, "touch");
      await expectSelectedFieldTouchTargets(page);

      const editDate = page.getByTestId("desktop-field-edit").filter({ visible: true });
      await expect(editDate).toHaveAccessibleName("Edit Date");
      await editDate.focus();
      await expect(editDate).toBeFocused();
      await page.keyboard.press("Enter");
      const dateEditor = page.getByTestId("pdf-field-editor");
      await expect(dateEditor).toBeVisible();
      await expect(dateEditor).toBeFocused();
      await page.keyboard.press("Control+A");
      await page.keyboard.insertText("31/12/2030");
      await expect(dateEditor).toHaveValue("31/12/2030");
      await expect.poll(async () => (await persistedField(page, "date")).value).toBe("31/12/2030");
      await dateEditor.press("Escape");
      await expectNoHorizontalOverflow(page);

      await expectCleanRuntime(audit);
    });
  });

  test.describe("touch and mouse hybrid input", () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

    test("touch/hybrid laptop 1280x800 keeps state across touch then mouse without duplicates", async ({
      page,
    }) => {
      const audit = await installRuntimeAudit(page);
      await prepareEmptyEditor(page);
      await uploadDeviceInputPdf(page, "hybrid-device-input.pdf");
      await expectEditorBaseline(page, "mouse", false);

      const textTool = visibleTool(page, "Text field: tap or drag to place");
      await tapLocator(page, textTool);
      await interactAtPageFraction(page, "touch", 0.3, 0.3);
      await waitForFieldCount(page, 1);
      const touchedText = await persistedField(page, "text");

      await page.waitForTimeout(750);
      const textPoint = await clientPointForField(page, touchedText);
      await page.mouse.dblclick(textPoint.x, textPoint.y);
      const editor = await focusSelectedTextField(page, "mouse");
      await page.keyboard.insertText("Hybrid input");
      await expect(editor).toHaveValue("Hybrid input");
      await editor.press("Enter");

      const boxTool = visibleTool(page, "Box field: drag across character boxes");
      await boxTool.click();
      await interactAtPageFraction(page, "mouse", 0.42, 0.52);
      await waitForFieldCount(page, 2);
      await page.keyboard.type("H7");
      await expect
        .poll(async () => (await persistedField(page, "comb")).value.trimEnd())
        .toBe("H7");
      const savedFields = await readPersistedFields(page);

      await restoreAndExerciseFields(page, "mouse", savedFields);

      await expectCleanRuntime(audit);
    });
  });

  test.describe("synthetic pen browser contract", () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

    test("bounded pointerType pen events do not crash or duplicate placement", async ({ page }) => {
      const audit = await installRuntimeAudit(page);
      await prepareEmptyEditor(page);
      await uploadDeviceInputPdf(page, "synthetic-pen-device-input.pdf");
      await expectEditorBaseline(page, "mouse", false);

      const textTool = visibleTool(page, "Text field: tap or drag to place");
      await textTool.click();
      const pdfPage = page.getByTestId("pdf-page");
      const inputSurface = pdfPage.locator(".konvajs-content").filter({ visible: true }).last();
      await expect(inputSurface).toBeVisible();
      const surfaceBox = await inputSurface.boundingBox();
      expect(surfaceBox).not.toBeNull();
      const point = {
        x: surfaceBox!.x + surfaceBox!.width * 0.34,
        y: surfaceBox!.y + surfaceBox!.height * 0.36,
      };
      const observedPointerEvents = await inputSurface.evaluate(
        (surface, coordinates) => {
          const wrapper = surface.closest('[data-testid="pdf-page"]');
          if (!wrapper) throw new Error("Expected the editor input surface inside the PDF page");
          const observed: Array<{
            type: string;
            pointerType: string;
            targetedInputSurface: boolean;
          }> = [];
          const record = (event: Event) => {
            const pointerEvent = event as PointerEvent;
            observed.push({
              type: event.type,
              pointerType: pointerEvent.pointerType,
              targetedInputSurface: event.target === surface,
            });
          };
          wrapper.addEventListener("pointerdown", record, { once: true });
          wrapper.addEventListener("pointerup", record, { once: true });
          wrapper.addEventListener("click", record, { once: true });
          for (const type of ["pointerdown", "pointerup", "click"] as const) {
            surface.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: coordinates.x,
                clientY: coordinates.y,
                isPrimary: true,
                pointerId: 17,
                pointerType: "pen",
              })
            );
          }
          return observed;
        },
        point
      );
      expect(observedPointerEvents).toEqual([
        { type: "pointerdown", pointerType: "pen", targetedInputSurface: true },
        { type: "pointerup", pointerType: "pen", targetedInputSurface: true },
        { type: "click", pointerType: "pen", targetedInputSurface: true },
      ]);

      await page.waitForTimeout(100);
      expect((await readPersistedFields(page)).length).toBeLessThanOrEqual(1);
      await page.mouse.click(point.x, point.y);
      await waitForFieldCount(page, 1);
      await page.waitForTimeout(100);
      await waitForFieldCount(page, 1);
      await expect(page.getByTestId("pdf-page")).toBeVisible();

      // This is a bounded browser event-contract check only. It does not certify
      // physical stylus precision, palm rejection, or device-specific behavior.
      await expectCleanRuntime(audit);
    });
  });
});
