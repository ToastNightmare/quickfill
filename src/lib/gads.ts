import { trackEvent } from "@/lib/analytics";

const CHECKOUT_RETURN_HISTORY_STATE_KEY =
  "__quickfillGadsCheckoutReturnId";
const CHECKOUT_RETURN_MARKER_PREFIX =
  "quickfill_gads_checkout_return_download_ready_v1:";
const CHECKOUT_RETURN_MARKER_VALUE = "fired";

type GoogleAdsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

function createCheckoutReturnId(adsWindow: GoogleAdsWindow): string {
  if (typeof adsWindow.crypto.randomUUID === "function") {
    return adsWindow.crypto.randomUUID();
  }

  return Array.from(
    adsWindow.crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function checkoutReturnMarkerKey(
  adsWindow: GoogleAdsWindow,
): string | null {
  try {
    const currentState = adsWindow.history.state;
    const state =
      currentState && typeof currentState === "object"
        ? currentState as Record<string, unknown>
        : {};
    const existingReturnId =
      state[CHECKOUT_RETURN_HISTORY_STATE_KEY];
    if (
      typeof existingReturnId === "string" &&
      existingReturnId.length > 0
    ) {
      return `${CHECKOUT_RETURN_MARKER_PREFIX}${existingReturnId}`;
    }

    const returnId = createCheckoutReturnId(adsWindow);
    adsWindow.history.replaceState(
      {
        ...state,
        [CHECKOUT_RETURN_HISTORY_STATE_KEY]: returnId,
      },
      "",
    );

    const persistedState = adsWindow.history.state as
      | Record<string, unknown>
      | null;
    if (
      persistedState?.[CHECKOUT_RETURN_HISTORY_STATE_KEY] !==
      returnId
    ) {
      return null;
    }

    return `${CHECKOUT_RETURN_MARKER_PREFIX}${returnId}`;
  } catch {
    return null;
  }
}

/**
 * Queues the privacy-bounded Google Ads checkout conversion at most once for
 * the persisted download-ready return. Configuration and storage both fail
 * closed so ads tracking can never interrupt the product flow or double-fire
 * after a refresh.
 */
export function trackGoogleAdsCheckoutConversion(): boolean {
  if (typeof window === "undefined") return false;

  const conversionId =
    process.env.NEXT_PUBLIC_QUICKFILL_GADS_ID?.trim();
  const conversionLabel =
    process.env.NEXT_PUBLIC_QUICKFILL_GADS_CONVERSION_LABEL?.trim();
  if (!conversionId || !conversionLabel) return false;

  const adsWindow = window as GoogleAdsWindow;
  const markerKey = checkoutReturnMarkerKey(adsWindow);
  if (!markerKey) return false;

  try {
    if (
      adsWindow.localStorage.getItem(markerKey) ===
      CHECKOUT_RETURN_MARKER_VALUE
    ) {
      return false;
    }

    // Persist before queueing so refreshes and remounts remain at-most-once,
    // even if the provider throws after accepting the event.
    adsWindow.localStorage.setItem(
      markerKey,
      CHECKOUT_RETURN_MARKER_VALUE,
    );
    if (
      adsWindow.localStorage.getItem(markerKey) !==
      CHECKOUT_RETURN_MARKER_VALUE
    ) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    adsWindow.dataLayer = adsWindow.dataLayer || [];
    if (typeof adsWindow.gtag !== "function") {
      adsWindow.gtag = (...args: unknown[]) => {
        adsWindow.dataLayer?.push(args);
      };
    }

    adsWindow.gtag("event", "conversion", {
      send_to: `${conversionId}/${conversionLabel}`,
      value: 2.0,
      currency: "AUD",
    });
  } catch {
    return false;
  }

  try {
    trackEvent("checkout_conversion_fired");
  } catch {
    // First-party analytics must never interrupt the product flow.
  }

  return true;
}
