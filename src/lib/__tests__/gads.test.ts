import { trackEvent } from "@/lib/analytics";
import { trackGoogleAdsCheckoutConversion } from "@/lib/gads";

jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

const GOOGLE_ADS_ID_ENV = "NEXT_PUBLIC_QUICKFILL_GADS_ID";
const GOOGLE_ADS_LABEL_ENV =
  "NEXT_PUBLIC_QUICKFILL_GADS_CONVERSION_LABEL";
const originalGoogleAdsId = process.env[GOOGLE_ADS_ID_ENV];
const originalGoogleAdsLabel = process.env[GOOGLE_ADS_LABEL_ENV];
const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>;
const adsWindow = window as unknown as {
  dataLayer?: unknown[];
  gtag?: jest.Mock;
};

function restoreEnvironment(name: string, originalValue: string | undefined) {
  if (originalValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = originalValue;
  }
}

describe("trackGoogleAdsCheckoutConversion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.history.replaceState(
      {},
      "",
      "/editor?download=ready",
    );
    delete adsWindow.dataLayer;
    delete adsWindow.gtag;
    delete process.env[GOOGLE_ADS_ID_ENV];
    delete process.env[GOOGLE_ADS_LABEL_ENV];
  });

  afterAll(() => {
    restoreEnvironment(GOOGLE_ADS_ID_ENV, originalGoogleAdsId);
    restoreEnvironment(GOOGLE_ADS_LABEL_ENV, originalGoogleAdsLabel);
  });

  it.each([
    ["both values are missing", undefined, undefined],
    ["the ID is missing", undefined, "conversion-label"],
    ["the label is missing", "AW-123456789", undefined],
    ["the ID is blank", "   ", "conversion-label"],
    ["the label is blank", "AW-123456789", "   "],
  ])("does nothing when %s", (_case, conversionId, conversionLabel) => {
    if (conversionId !== undefined) {
      process.env[GOOGLE_ADS_ID_ENV] = conversionId;
    }
    if (conversionLabel !== undefined) {
      process.env[GOOGLE_ADS_LABEL_ENV] = conversionLabel;
    }
    adsWindow.gtag = jest.fn();

    expect(trackGoogleAdsCheckoutConversion()).toBe(false);
    expect(adsWindow.gtag).not.toHaveBeenCalled();
    expect(mockedTrackEvent).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it("queues only the approved payload and records the parallel first-party event", () => {
    process.env[GOOGLE_ADS_ID_ENV] = "  AW-123456789  ";
    process.env[GOOGLE_ADS_LABEL_ENV] = "  conversion-label  ";
    adsWindow.gtag = jest.fn();

    expect(trackGoogleAdsCheckoutConversion()).toBe(true);
    expect(adsWindow.gtag).toHaveBeenCalledTimes(1);
    expect(adsWindow.gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-123456789/conversion-label",
      value: 2,
      currency: "AUD",
    });
    expect(Object.keys(adsWindow.gtag.mock.calls[0][2])).toEqual([
      "send_to",
      "value",
      "currency",
    ]);
    expect(mockedTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "checkout_conversion_fired",
    );
  });

  it("persists one shared marker so a refresh or second surface cannot re-fire", () => {
    process.env[GOOGLE_ADS_ID_ENV] = "AW-123456789";
    process.env[GOOGLE_ADS_LABEL_ENV] = "conversion-label";
    adsWindow.gtag = jest.fn();

    expect(trackGoogleAdsCheckoutConversion()).toBe(true);
    expect(trackGoogleAdsCheckoutConversion()).toBe(false);
    expect(adsWindow.gtag).toHaveBeenCalledTimes(1);
    expect(mockedTrackEvent).toHaveBeenCalledTimes(1);
    expect(localStorage).toHaveLength(1);
  });

  it("allows a later checkout return to fire once with its own marker", () => {
    process.env[GOOGLE_ADS_ID_ENV] = "AW-123456789";
    process.env[GOOGLE_ADS_LABEL_ENV] = "conversion-label";
    adsWindow.gtag = jest.fn();

    expect(trackGoogleAdsCheckoutConversion()).toBe(true);
    window.history.pushState({}, "", "/editor?download=ready");
    expect(trackGoogleAdsCheckoutConversion()).toBe(true);
    expect(trackGoogleAdsCheckoutConversion()).toBe(false);

    expect(adsWindow.gtag).toHaveBeenCalledTimes(2);
    expect(mockedTrackEvent).toHaveBeenCalledTimes(2);
    expect(localStorage).toHaveLength(2);
  });

  it("swallows provider failures and still prevents a refresh double-fire", () => {
    process.env[GOOGLE_ADS_ID_ENV] = "AW-123456789";
    process.env[GOOGLE_ADS_LABEL_ENV] = "conversion-label";
    adsWindow.gtag = jest.fn(() => {
      throw new Error("provider unavailable");
    });

    expect(() => trackGoogleAdsCheckoutConversion()).not.toThrow();
    expect(trackGoogleAdsCheckoutConversion()).toBe(false);
    expect(adsWindow.gtag).toHaveBeenCalledTimes(1);
    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });
});
