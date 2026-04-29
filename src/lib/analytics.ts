export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: string, properties: AnalyticsProperties = {}) {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({ name, properties });

  try {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/analytics", blob)) return;
  } catch {
    // Fall back to fetch below.
  }

  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}
