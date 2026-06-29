import { PRICING, formatAud } from "../pricing";

describe("pricing module", () => {
  it("formats whole and decimal AUD amounts correctly", () => {
    expect(formatAud(25)).toBe("A$25");
    expect(formatAud(12.42)).toBe("A$12.42");
    expect(formatAud(149)).toBe("A$149");
  });

  it("has correct Pro monthly values and disclosure", () => {
    expect(PRICING.pro.monthly.amount).toBe(25);
    expect(PRICING.pro.monthly.introAmount).toBe(2);
    expect(PRICING.pro.monthly.introDays).toBe(7);
    expect(PRICING.pro.monthly.label).toBe("A$25");
    expect(PRICING.pro.monthly.labelWithPeriod).toBe("A$25/month");
    expect(PRICING.pro.monthly.introLabel).toBe("A$2");
    expect(PRICING.pro.monthly.disclosure).toBe(
      "A$2 today for the 7-day intro, then A$25/month. Cancel anytime."
    );
  });

  it("has intro-led monthly display fields and conversion value", () => {
    expect(PRICING.pro.monthly.introTodayLabel).toBe("A$2 today");
    expect(PRICING.pro.monthly.introBadge).toBe("7-day intro offer");
    expect(PRICING.pro.monthly.thenLabel).toBe("Then A$25/month after 7 days");
    expect(PRICING.pro.monthly.ctaLabel).toBe("Start 7-day intro for A$2");
    expect(PRICING.pro.monthly.finePrint).toBe(
      "A$2 today. Then A$25/month after 7 days unless cancelled."
    );
    expect(PRICING.pro.monthly.conversionValue).toBe(2);
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

  it("has annual display fields and conversion value", () => {
    expect(PRICING.pro.annual.orLabel).toBe("or A$149/year");
    expect(PRICING.pro.annual.ctaLabel).toBe("Save with annual A$149");
    expect(PRICING.pro.annual.perMonthBilledAnnually).toBe("A$12.42/month billed annually");
    expect(PRICING.pro.annual.savingsLabelCap).toBe("Save A$151 vs monthly");
    expect(PRICING.pro.annual.conversionValue).toBe(149);
  });
});
