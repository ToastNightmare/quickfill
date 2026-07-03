export const ANALYTICS_EVENTS = [
  "landing_page_view",
  "home_cta_click",
  "template_start",
  "editor_upload_started",
  "editor_pdf_loaded",
  "field_added",
  "field_detection_used",
  "profile_autofill_used",
  "download_attempt",
  "download_success",
  "download_failed",
  "download_gate_shown",
  "free_limit_hit",
  "upgrade_prompted",
  "checkout_start",
  "checkout_cancelled",
  "billing_portal_open",
  "subscription_started",
  "subscription_updated",
  "subscription_cancelled"
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const ANALYTICS_EVENT_SET = new Set<string>(ANALYTICS_EVENTS);
