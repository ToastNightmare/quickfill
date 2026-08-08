import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRICING_V2,
  pricingV2AuthSummary,
  pricingV2Enabled,
  saleWindowOpen,
  savePercent,
} from "../pricing-v2";

describe("pricing V2", () => {
  it("keeps the approved cent values and display strings together", () => {
    expect(PRICING_V2.annual.cents).toBe(19_900);
    expect(PRICING_V2.annual.cardPrice).toBe("A$199 / yr (A$16.58 / mo)");
    expect(PRICING_V2.monthly.cents).toBe(2_500);
    expect(PRICING_V2.monthly.cardPrice).toBe("A$25 / mo");
    expect(PRICING_V2.sale.cents).toBe(15_000);
    expect(PRICING_V2.sale.cardPrice).toBe("A$150 / yr (A$12.50 / mo)");
  });

  it("computes annual and sale savings from the monthly price", () => {
    expect(savePercent(PRICING_V2.annual.cents, PRICING_V2.monthly.cents)).toBe(34);
    expect(savePercent(PRICING_V2.sale.cents, PRICING_V2.monthly.cents)).toBe(50);
    expect(PRICING_V2.annual.badge).toBe("Save 34%");
    expect(PRICING_V2.sale.badge).toBe("Save 50%");
  });

  it("uses only the exact flag value", () => {
    expect(pricingV2Enabled("v1")).toBe(true);
    expect(pricingV2Enabled("V1")).toBe(false);
    expect(pricingV2Enabled("true")).toBe(false);
    expect(pricingV2Enabled(undefined)).toBe(false);
  });

  it("opens a sale only for a valid future instant", () => {
    const now = new Date("2026-08-08T00:00:00.000Z");

    expect(saleWindowOpen(now, "2026-08-08T00:00:00.001Z")).toBe(true);
    expect(saleWindowOpen(now, "2026-08-08T00:00:00.000Z")).toBe(false);
    expect(saleWindowOpen(now, "2026-08-07T23:59:59.999Z")).toBe(false);
  });

  it("keeps an absent or invalid sale window dark", () => {
    const now = new Date("2026-08-08T00:00:00.000Z");

    expect(saleWindowOpen(now, undefined)).toBe(false);
    expect(saleWindowOpen(now, "")).toBe(false);
    expect(saleWindowOpen(now, "not-a-date")).toBe(false);
    expect(saleWindowOpen(Number.NaN, "2099-01-01T00:00:00.000Z")).toBe(false);
  });

  it("provides billing-specific auth handoff copy", () => {
    expect(pricingV2AuthSummary("annual")).toBe(
      "Next: A$2 for 7 days, then A$199/year. Cancel anytime.",
    );
    expect(pricingV2AuthSummary("monthly")).toBe("Next: A$25/month. Cancel anytime.");
    expect(pricingV2AuthSummary("sale")).toBe("Next: A$150/year. Cancel anytime.");
  });

  it("keeps the banned pricing claim out of the download gate source", () => {
    const gateSource = readFileSync(
      join(process.cwd(), "src/components/DownloadPreviewGate.tsx"),
      "utf8",
    );

    expect(gateSource).not.toMatch(/\bfree\b/i);
  });
});
