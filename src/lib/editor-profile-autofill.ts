import { trackEvent } from "./analytics";
import type { AutofillProfile } from "./autofill-intelligence";
import {
  autofillModeFromFlag,
  runProfileAutofill,
  shouldReportAutofillShadowMode,
  type ProfileAutofillField,
  type ProfileAutofillMode,
  type ProfileAutofillShadowReport,
} from "./profile-autofill";
import type { EditorField } from "./types";

type EditorAutofillField = EditorField & ProfileAutofillField;

export interface EditorProfileAutofillResult {
  fields: EditorField[];
  matched: number;
  mode: ProfileAutofillMode;
  shadowReport: ProfileAutofillShadowReport;
}

function toAutofillField(field: EditorField): EditorAutofillField {
  return {
    ...field,
    name: field.id,
  } as EditorAutofillField;
}

function mergeAutofillResult(fields: EditorField[], autofilledFields: EditorAutofillField[]) {
  const autofilledById = new Map(autofilledFields.map((field) => [field.id, field]));

  return fields.map((field) => {
    const autofilled = autofilledById.get(field.id);
    if (!autofilled || !("value" in field) || typeof autofilled.value !== "string") return field;
    return { ...field, value: autofilled.value } as EditorField;
  });
}

export function runEditorProfileAutofill(
  fields: EditorField[],
  profile: AutofillProfile,
  mode = autofillModeFromFlag(process.env.NEXT_PUBLIC_QUICKFILL_AUTOFILL_MODE),
): EditorProfileAutofillResult {
  const autofillFields = fields.map(toAutofillField);
  const result = runProfileAutofill(autofillFields, profile, mode);

  return {
    fields: mergeAutofillResult(fields, result.fields),
    matched: result.matched,
    mode: result.mode,
    shadowReport: result.shadowReport,
  };
}

export function trackEditorAutofillShadowReport(
  result: EditorProfileAutofillResult,
  extra: Record<string, string | number | boolean | null | undefined> = {},
) {
  if (!shouldReportAutofillShadowMode(result.mode)) return false;

  trackEvent("profile_autofill_used", {
    shadowReported: true,
    ...result.shadowReport,
    ...extra,
  });

  return true;
}
