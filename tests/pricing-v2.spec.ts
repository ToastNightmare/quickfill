import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { PRICING_V2, pricingV2Enabled, saleWindowOpen } from "../src/lib/pricing-v2";

const usePricingV2 = pricingV2Enabled(process.env.NEXT_PUBLIC_QUICKFILL_PRICING_V2);
const saleOpen = saleWindowOpen(new Date(), process.env.NEXT_PUBLIC_QUICKFILL_SALE_ENDS);

async function openDownloadGate(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem("quickfill_welcomed", "true");
    localStorage.setItem("quickfill_tour_done", "true");
  });
  await page.route("**/api/usage", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ isPro: false, tier: "guest", used: 0, limit: 3, guest: true }),
    });
  });
  await page.route("**/_vercel/insights/script.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    });
  });

  const pdf = await PDFDocument.create();
  pdf.addPage([320, 420]);
  const bytes = Buffer.from(await pdf.save());

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("document-upload-input").setInputFiles({
    name: "pricing-v2-gate.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await expect(page.getByTestId("pdf-page")).toBeVisible({ timeout: 15_000 });

  const downloadButton = page.getByRole("button", { name: "Download PDF", exact: true });
  await expect(downloadButton).toBeVisible();
  await downloadButton.click();

  const gate = page.getByRole("dialog", { name: "Your document is ready" });
  await expect(gate).toBeVisible();
  return { gate, consoleErrors, pageErrors };
}

test("flag-off download gate keeps the master pricing contract", async ({ page }) => {
  test.skip(usePricingV2, "Requires NEXT_PUBLIC_QUICKFILL_PRICING_V2 to be off.");

  const { gate, consoleErrors, pageErrors } = await openDownloadGate(page);

  await expect(gate.getByText("Unlock your clean download for A$2", { exact: true })).toBeVisible();
  await expect(gate.getByText("7-day intro, then A$25/month. Cancel anytime.", { exact: true })).toBeVisible();
  await expect(gate.getByRole("link", { name: "Unlock download for A$2" })).toHaveAttribute(
    "href",
    "/checkout?plan=pro&billing=monthly&source=download_preview_gate",
  );
  await expect(gate.getByRole("link", { name: "Prefer annual? A$149/year" })).toHaveAttribute(
    "href",
    "/checkout?plan=pro&billing=annual&source=download_preview_gate",
  );
  await expect(gate.getByRole("list").getByRole("listitem")).toHaveText([
    "Clean PDF, no watermark",
    "Unlimited downloads",
    "Works with PDFs, photos and scans",
    "Secure checkout by Stripe, cancel anytime",
  ]);
  await expect(gate.getByRole("button", { name: "View all plans" })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("flag-on gate adapts its cards, disclosure, and checkout link without starting checkout", async ({ page }) => {
  test.skip(!usePricingV2, "Requires NEXT_PUBLIC_QUICKFILL_PRICING_V2=v1.");

  const checkoutRequests: string[] = [];
  await page.route("**/api/stripe/checkout", async (route) => {
    checkoutRequests.push(route.request().postData() ?? "");
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Checkout is blocked in pricing UI QA." }),
    });
  });

  const { gate, consoleErrors, pageErrors } = await openDownloadGate(page);

  await expect(gate.getByText(PRICING_V2.hero, { exact: true })).toBeVisible();
  await expect(gate).not.toContainText(/\bfree\b/i);
  await expect(gate.getByTestId("pricing-v2-cta")).toHaveCount(1);
  await expect(gate.getByTestId("pricing-v2-cta")).toHaveAttribute(
    "href",
    "/checkout?plan=pro&billing=annual&source=download_preview_gate",
  );
  await expect(gate.getByTestId("pricing-v2-fine-print")).toHaveText(PRICING_V2.annual.finePrint);

  await gate.getByRole("button", { name: "View all plans" }).click();
  const picker = page.getByRole("dialog", { name: "Choose your plan" });
  await expect(picker).toBeVisible();
  await expect(page.getByTestId("pricing-v2-cta")).toHaveCount(1);

  const annualCard = picker.getByTestId("pricing-v2-plan-annual");
  await expect(annualCard).toContainText("Yearly");
  await expect(annualCard).toContainText(PRICING_V2.annual.cardPrice);
  await expect(annualCard).toContainText(PRICING_V2.annual.sublabel);
  await expect(annualCard).toContainText(PRICING_V2.annual.badge);
  await expect(annualCard).toHaveAttribute("aria-pressed", "true");

  const monthlyCard = picker.getByTestId("pricing-v2-plan-monthly");
  await expect(monthlyCard).toContainText("Monthly");
  await expect(monthlyCard).toContainText(PRICING_V2.monthly.cardPrice);
  await monthlyCard.click();
  await expect(picker.getByTestId("pricing-v2-fine-print")).toHaveText(PRICING_V2.monthly.finePrint);
  await expect(picker.getByTestId("pricing-v2-cta")).toHaveAttribute(
    "href",
    "/checkout?plan=pro&billing=monthly&source=download_preview_gate",
  );

  const saleCard = picker.getByTestId("pricing-v2-plan-sale");
  if (saleOpen) {
    await expect(saleCard).toBeVisible();
    await expect(saleCard).toContainText("Sale");
    await expect(saleCard).toContainText(PRICING_V2.sale.cardPrice);
    await expect(saleCard).toContainText(PRICING_V2.sale.sublabel);
    await expect(saleCard).toContainText(PRICING_V2.sale.badge);
    await saleCard.click();
    await expect(picker.getByTestId("pricing-v2-fine-print")).toHaveText(PRICING_V2.sale.finePrint);
    await expect(picker.getByTestId("pricing-v2-cta")).toHaveAttribute(
      "href",
      "/checkout?plan=pro&billing=sale&source=download_preview_gate",
    );
  } else {
    await expect(saleCard).toHaveCount(0);
  }

  await expect(picker.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
  await expect(picker.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  expect(checkoutRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
