/**
 * Google Ads conversion tracking helper.
 *
 * trackGoogleAdsConversion() queues a Google Ads conversion event.
 *
 * Returns false if:
 *   - called server-side (window unavailable)
 *   - NEXT_PUBLIC_GOOGLE_ADS_ID is missing or blank
 *
 * Otherwise initialises the dataLayer/gtag queue if not already present
 * (so the event is safely queued even if gtag.js has not loaded yet),
 * fires the conversion event, and returns true.
 *
 * Callers should only mark a dedup flag after receiving true.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag: (...args: any[]) => void;
    dataLayer: unknown[];
  }
}

export function trackGoogleAdsConversion(
  conversionLabel: string,
  value: number,
  currency: string = 'AUD',
): boolean {
  if (typeof window === 'undefined') return false;

  const conversionId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  if (!conversionId || conversionId.trim() === '') return false;

  // Initialise the dataLayer queue and gtag stub if gtag.js has not loaded yet.
  // Events pushed here will be processed once the external script loads.
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function gtag() { window.dataLayer.push(arguments); } as typeof window.gtag;
  }

  window.gtag('event', 'conversion', {
    send_to: `${conversionId.trim()}/${conversionLabel}`,
    value,
    currency,
  });

  return true;
}
