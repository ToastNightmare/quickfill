import { todayDateStamp, DATE_STAMP_PLACEHOLDER, DATE_STAMP_LOCALE } from "../date-stamp";

describe("date-stamp", () => {
  it("formats a fixed date as DD/MM/YYYY (en-AU)", () => {
    // 4 July 2026: day/month order distinguishes AU from US formatting
    const fixed = new Date(2026, 6, 4, 12, 0, 0);
    expect(todayDateStamp(fixed)).toBe("04/07/2026");
  });

  it("formats another fixed date correctly across month boundaries", () => {
    const fixed = new Date(2026, 0, 31, 12, 0, 0);
    expect(todayDateStamp(fixed)).toBe("31/01/2026");
  });

  it("uses the en-AU locale", () => {
    expect(DATE_STAMP_LOCALE).toBe("en-AU");
  });

  it("placeholder matches the Australian stamp format", () => {
    expect(DATE_STAMP_PLACEHOLDER).toBe("DD/MM/YYYY");
  });

  it("defaults to today when no date is provided", () => {
    expect(todayDateStamp()).toBe(new Date().toLocaleDateString("en-AU"));
  });
});
