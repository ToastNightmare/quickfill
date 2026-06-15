/**
 * @jest-environment jsdom
 */

import { captureAndStoreUtm, clearStoredUtm, getStoredUtm } from "../utm";

function setUrl(search: string) {
  window.history.pushState({}, "", `/${search}`);
}

describe("UTM attribution storage", () => {
  beforeEach(() => {
    clearStoredUtm();
    setUrl("");
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-15T00:00:00.000Z"));
  });

  afterEach(() => {
    clearStoredUtm();
    jest.useRealTimers();
  });

  it("captures and returns UTM params", () => {
    setUrl("?utm_source=google&utm_medium=cpc&utm_campaign=summer&utm_content=banner&utm_term=pdf");

    captureAndStoreUtm();

    expect(getStoredUtm()).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer",
      utm_content: "banner",
      utm_term: "pdf",
    });
  });

  it("captures and returns gclid without UTM params", () => {
    setUrl("?gclid=test-click-id");

    captureAndStoreUtm();

    expect(getStoredUtm()).toEqual({
      gclid: "test-click-id",
    });
  });

  it("captures UTM params and gclid together", () => {
    setUrl("?utm_source=google&utm_medium=cpc&utm_campaign=summer&gclid=test-click-id");

    captureAndStoreUtm();

    expect(getStoredUtm()).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer",
      gclid: "test-click-id",
    });
  });

  it("preserves fresh first-touch UTM while merging a new gclid", () => {
    setUrl("?utm_source=google&utm_medium=cpc&utm_campaign=first");
    captureAndStoreUtm();

    setUrl("?utm_source=bing&utm_campaign=second&gclid=new-click-id");
    captureAndStoreUtm();

    expect(getStoredUtm()).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "first",
      gclid: "new-click-id",
    });
  });

  it("clears expired attribution on read", () => {
    window.localStorage.setItem(
      "qf_utm",
      JSON.stringify({
        utm_source: "google",
        gclid: "expired-click-id",
        capturedAt: "2026-05-01T00:00:00.000Z",
      }),
    );

    expect(getStoredUtm()).toEqual({});
    expect(window.localStorage.getItem("qf_utm")).toBeNull();
  });
});
