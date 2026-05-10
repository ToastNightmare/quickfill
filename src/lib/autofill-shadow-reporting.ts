import { trackEvent } from "./analytics";
import type { ProfileAutofillResult, ProfileAutofillField } from "./profile-autofill";
import { shouldReportAutofillShadowMode } from "./profile-autofill";

export function trackAutofillShadowReport<T extends ProfileAutofillField>(
  result: ProfileAutofillResult<T>,
  extra: Record<string, string | number | boolean | null | undefined> = {},
) {
  if (!shouldReportAutofillShadowMode(result.mode)) return false;

  trackEvent("profile_autofill_shadow_reported", {
    ...result.shadowReport,
    ...extra,
  });

  return true;
}
