export const ANALYTICS_EVENTS = [
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
  "free_limit_hit",
  "checkout_start",
  "checkout_session_created",
  "checkout_session_failed",
  "subscription_started",
  "subscription_updated",
  "subscription_cancelled",
  "support_request_submitted"
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const ANALYTICS_EVENT_SET = new Set<string>(ANALYTICS_EVENTS);
