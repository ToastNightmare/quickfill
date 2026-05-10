import {
  applyAutofillPredictions,
  predictAutofillFields,
  summarizeAutofillPredictions,
  type AutofillFieldCandidate,
  type AutofillPrediction,
  type AutofillProfile,
} from "./autofill-intelligence";

export type ProfileAutofillMode = "legacy" | "shadow" | "intelligence";

export interface ProfileAutofillField {
  id: string;
  name?: string;
  label?: string;
  nearbyText?: string;
  type: "text" | "checkbox" | "signature" | "date" | "comb";
  value?: string;
}

export interface ProfileAutofillResult<T extends ProfileAutofillField> {
  fields: T[];
  matched: number;
  mode: ProfileAutofillMode;
  predictions: AutofillPrediction[];
  summary: ReturnType<typeof summarizeAutofillPredictions>;
}

const LEGACY_MATCHERS: { key: string; keywords: string[] }[] = [
  { key: "fullName", keywords: ["name", "full name", "fullname", "given name", "applicant"] },
  { key: "email", keywords: ["email", "e-mail", "email address"] },
  { key: "phone", keywords: ["phone", "telephone", "mobile", "tel", "contact number"] },
  { key: "street", keywords: ["address", "street", "address line 1", "address1"] },
  { key: "addressLine2", keywords: ["address line 2", "address2", "apt", "unit", "suite"] },
  { key: "city", keywords: ["city", "suburb", "town", "locality"] },
  { key: "state", keywords: ["state", "territory", "province", "region"] },
  { key: "postcode", keywords: ["postcode", "post code", "zip", "postal", "post"] },
  { key: "abn", keywords: ["abn", "business number"] },
  { key: "organisation", keywords: ["organisation", "organization", "company", "employer"] },
];

function normalizeFieldName(name: string | undefined) {
  return (name ?? "").toLowerCase().replace(/[_\-.]/g, " ");
}

export function matchLegacyProfileKey(name: string | undefined): string | null {
  const lower = normalizeFieldName(name);
  for (const { key, keywords } of LEGACY_MATCHERS) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) return key;
    }
  }
  return null;
}

function toCandidate(field: ProfileAutofillField): AutofillFieldCandidate {
  return {
    id: field.id,
    name: field.name,
    label: field.label,
    nearbyText: field.nearbyText,
    type: field.type,
    value: field.value,
  };
}

function applyLegacyProfileAutofill<T extends ProfileAutofillField>(fields: T[], profile: AutofillProfile) {
  let matched = 0;
  const next = fields.map((field) => {
    if (field.type !== "text") return field;
    const key = matchLegacyProfileKey(field.name ?? field.label);
    const value = key ? profile[key] : undefined;
    if (!value) return field;
    matched += 1;
    return { ...field, value };
  });

  return { fields: next, matched };
}

export function runProfileAutofill<T extends ProfileAutofillField>(
  fields: T[],
  profile: AutofillProfile,
  mode: ProfileAutofillMode = "legacy",
): ProfileAutofillResult<T> {
  const candidates = fields.map(toCandidate);
  const predictions = predictAutofillFields(candidates, profile);
  const summary = summarizeAutofillPredictions(predictions);

  if (mode === "intelligence") {
    const next = applyAutofillPredictions(fields, profile, predictions, "auto-fill");
    return {
      fields: next,
      matched: next.filter((field, index) => field.value !== fields[index]?.value).length,
      mode,
      predictions,
      summary,
    };
  }

  const legacy = applyLegacyProfileAutofill(fields, profile);
  return {
    fields: legacy.fields,
    matched: legacy.matched,
    mode,
    predictions,
    summary,
  };
}

export function autofillModeFromFlag(flag: string | undefined | null): ProfileAutofillMode {
  if (flag === "intelligence") return "intelligence";
  if (flag === "shadow") return "shadow";
  return "legacy";
}
