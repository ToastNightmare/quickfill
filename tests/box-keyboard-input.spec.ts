import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type CombSnapshot = {
  type: string;
  value: string;
  charCount: number;
  cursorIndex: number | null;
};

async function createBoxFieldPdf() {
  const pdfDocument = await PDFDocument.create();
  const pdfPage = pdfDocument.addPage([612, 792]);
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
  pdfPage.drawText("QuickFill Box Field keyboard regression", {
    x: 48,
    y: 730,
    size: 18,
    font,
    color: rgb(0.05, 0.08, 0.15),
  });
  return Buffer.from(await pdfDocument.save());
}

async function prepareEditor(page: Page) {
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

  await page.goto("/editor?advanced=1", { waitUntil: "domcontentloaded" });
  const input = page.getByTestId("document-upload-input");
  await expect(input).toBeAttached();
  await input.setInputFiles({
    name: "box-keyboard-input.pdf",
    mimeType: "application/pdf",
    buffer: await createBoxFieldPdf(),
  });
  await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="pdf-page"] canvas').length >= 2
  );
}

async function readCombField(page: Page): Promise<CombSnapshot | null> {
  return page.evaluate(() => {
    const rawFields = localStorage.getItem("quickfill_fields");
    if (!rawFields) return null;
    const fields = JSON.parse(rawFields) as Array<Record<string, unknown>>;
    const field = fields.find((candidate) => candidate.type === "comb");
    if (!field) return null;
    return {
      type: String(field.type),
      value: String(field.value ?? ""),
      charCount: Number(field.charCount),
      cursorIndex: typeof field.cursorIndex === "number" ? field.cursorIndex : null,
    };
  });
}

async function readCombGeometry(page: Page) {
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
    };
  });
}

function paddedValue(value: string, charCount: number) {
  return value.padEnd(charCount, " ");
}

test("Box Field stores Comb keyboard input, deletion, and cursor navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await prepareEditor(page);

  const boxFieldTool = page.locator('button[title="Box field: drag across character boxes"]').first();
  await expect(boxFieldTool).toBeVisible();
  await boxFieldTool.click();

  const interactionCanvas = page
    .getByTestId("pdf-page")
    .locator(".konvajs-content canvas")
    .first();
  await expect(interactionCanvas).toBeVisible();
  await interactionCanvas.click({ position: { x: 180, y: 240 } });

  await expect.poll(() => readCombField(page)).not.toBeNull();
  const placedField = await readCombField(page);
  expect(placedField).not.toBeNull();
  expect(placedField!.type).toBe("comb");
  expect(placedField!.value).toBe("");
  expect(placedField!.charCount).toBeGreaterThanOrEqual(4);

  const charCount = placedField!.charCount;
  await page.keyboard.type("ABC");
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: paddedValue("ABC", charCount),
    charCount,
    cursorIndex: 3,
  });

  await page.keyboard.press("Backspace");
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: paddedValue("AB", charCount),
    charCount,
    cursorIndex: 2,
  });

  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: paddedValue("AB", charCount),
    charCount,
    cursorIndex: 1,
  });

  await page.keyboard.type("Z");
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: paddedValue("AZ", charCount),
    charCount,
    cursorIndex: 2,
  });

  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: paddedValue("AZ", charCount),
    charCount,
    cursorIndex: 1,
  });

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: paddedValue("AZ", charCount),
    charCount,
    cursorIndex: 2,
  });

  await page.keyboard.type("X");
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: paddedValue("AZX", charCount),
    charCount,
    cursorIndex: 3,
  });

  await expect(page.getByText(`3 / ${charCount} characters filled`).last()).toBeVisible();

  const geometry = await readCombGeometry(page);
  expect(geometry).not.toBeNull();
  const canvasBox = await interactionCanvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const pdfScale = canvasBox!.width / 612;
  const clickedCellIndex = Math.min(5, charCount - 1);
  const cellWidth = geometry!.width / charCount;

  await interactionCanvas.click({
    position: {
      x: (geometry!.x + (clickedCellIndex + 0.5) * cellWidth) * pdfScale,
      y: (geometry!.y + geometry!.height / 2) * pdfScale,
    },
  });
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: paddedValue("AZX", charCount),
    charCount,
    cursorIndex: clickedCellIndex,
  });

  await page.keyboard.type("Q");
  const valueBeforeCellEntry = paddedValue("AZX", charCount);
  const valueAfterCellEntry =
    valueBeforeCellEntry.slice(0, clickedCellIndex) +
    "Q" +
    valueBeforeCellEntry.slice(clickedCellIndex + 1);
  await expect.poll(() => readCombField(page)).toEqual({
    type: "comb",
    value: valueAfterCellEntry,
    charCount,
    cursorIndex: Math.min(clickedCellIndex + 1, charCount - 1),
  });

  const saveBadge = page.getByTestId("local-save-status");
  await expect(saveBadge).toBeVisible();
  await expect(saveBadge).toHaveAttribute(
    "title",
    "Saved in this browser only. Use Save Progress for account save when available."
  );
  await expect(saveBadge).toContainText("Saved locally");
});
