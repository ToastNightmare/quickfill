import { PRICING, formatAud } from "../pricing";

describe("pricing module", () => {
  it("formats whole and decimal AUD amounts correctly", () => {
    expect(formatAud(25)).toBe("A$25");
    expect(formatAud(12.5)).toBe("A$12.50");
    expect(formatAud(149)).toBe("A$149");
  });

  it("has correct Pro monthly values and disclosure", () => {
    expect(PRICING.pro.monthly.amount).toBe(25);
    expect(PRICING.pro.monthly.introAmount).toBe(12.5);
    expect(PRICING.pro.monthly.label).toBe("A$25");
    expect(PRICING.pro.monthly.labelWithPeriod).toBe("A$25/month");
    expect(PRICING.pro.monthly.introLabel).toBe("A$12.50");
    expect(PRICING.pro.monthly.disclosure).toBe(
      "A$12.50 first month, then A$25/month. Cancel anytime."
    );
  });

  it("has correct Pro annual values, derived figures, and disclosure", () => {
    expect(PRICING.pro.annual.amount).toBe(149);
    expect(PRICING.pro.annual.label).toBe("A$149");
    expect(PRICING.pro.annual.labelWithPeriod).toBe("A$149/year");
    expect(PRICING.pro.annual.perMonthLabel).toBe("A$12.42/month");
    expect(PRICING.pro.annual.savingsVsMonthly).toBe(151);
    expect(PRICING.pro.annual.savingsLabel).toBe("save A$151 vs monthly");
    expect(PRICING.pro.annual.disclosure).toBe("A$149/year. Cancel anytime.");
  });
});
