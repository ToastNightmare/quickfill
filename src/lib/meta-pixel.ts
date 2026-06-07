/**
 * Meta Pixel event tracking helper.
 *
 * Routes standard Facebook events to fbq('track') and custom events to fbq('trackCustom').
 * Standard events: Lead, ViewContent, InitiateCheckout
 * Custom events: QF_UploadStarted, QF_DownloadAttempt, QF_UpgradePrompted
 *
 * Returns early if window.fbq is not available or NEXT_PUBLIC_META_PIXEL_ID is not set.
 */

const STANDARD_EVENTS = new Set(['Lead', 'ViewContent', 'InitiateCheckout']);
const CUSTOM_EVENTS = new Set(['QF_UploadStarted', 'QF_DownloadAttempt', 'QF_UpgradePrompted']);

export function trackMetaEvent(name: string, data?: Record<string, string | number | boolean | undefined>): void {
  // Guard: server-side rendering
  if (typeof window === 'undefined') return;

  // Guard: fbq not available
  if (typeof window.fbq !== 'function') return;

  // Guard: Pixel ID not configured
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId || pixelId.trim() === '') return;

  // Route to appropriate fbq method
  if (STANDARD_EVENTS.has(name)) {
    window.fbq('track', name, data);
  } else if (CUSTOM_EVENTS.has(name)) {
    window.fbq('trackCustom', name, data);
  }
  // Silently ignore unknown events (future-safe)
}
