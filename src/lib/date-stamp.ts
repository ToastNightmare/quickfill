/**
 * Date stamp helpers for the Date tool.
 * Australian format (DD/MM/YYYY) is the app-wide default.
 */

export const DATE_STAMP_LOCALE = "en-AU";

/** Placeholder shown in the inline date editor. Must match the stamped format. */
export const DATE_STAMP_PLACEHOLDER = "DD/MM/YYYY";

/** Today's date formatted for stamping onto a form (DD/MM/YYYY). */
export function todayDateStamp(now: Date = new Date()): string {
  return now.toLocaleDateString(DATE_STAMP_LOCALE);
}
