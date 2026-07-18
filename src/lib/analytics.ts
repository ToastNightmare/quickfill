import { getStoredUtm } from "@/lib/utm";

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

function dispatchEvent(name: string, properties: AnalyticsProperties) {
  if (typeof window === "undefined") return;

  let payload: string;
  try {
    payload = JSON.stringify({ name, properties });
  } catch {
    return;
  }

  try {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/analytics", blob)) return;
  } catch {
    // Fall back to fetch below.
  }

  try {
    void Promise.resolve(fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    })).catch(() => {});
  } catch {
    // Analytics must never interrupt the product flow.
  }
}

export function trackEvent(name: string, properties: AnalyticsProperties = {}) {
  let mergedProperties: AnalyticsProperties = { ...properties };
  try {
    mergedProperties = { ...getStoredUtm(), ...properties };
  } catch {
    // Attribution storage can be unavailable in privacy-restricted browsers.
  }
  dispatchEvent(name, mergedProperties);
}

/**
 * Sends only the supplied properties. Callers must build the object from a
 * closed allowlist; UTM attribution is deliberately omitted.
 */
export function trackPrivacySafeEvent(name: string, properties: AnalyticsProperties = {}) {
  dispatchEvent(name, properties);
}
