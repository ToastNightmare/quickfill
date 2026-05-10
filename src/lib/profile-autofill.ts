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

export interface ProfileAutofillShadowReport {
  mode: ProfileAutofillMode;
  fieldCount: number;
  legacyMatched: number;
  intelligenceAutoFill: number;
  intelligenceReview: number;
  intelligenceSuggest: number;
  intelligenceSkip: number;
  agreementCount: number;
  disagreementCount: number;
  missingProfileValueCount: number;
  averageConfidence: number;
  highConfidenceWithoutLegacyCount: number;
  profileKeys: string;
}

export interface ProfileAutofillResult<T extends ProfileAutofillField> {
  fields: T[];
  matched: number;
  mode: ProfileAutofillMode;
  predictions: AutofillPrediction[];
  summary: ReturnType<typeof summarizeAutofillPredictions>;
  shadowReport: ProfileAutofillShadowReport;
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

function legacyKeyForField(field: ProfileAutofillField) {
  if (field.type !== "text") return null;
  return matchLegacyProfileKey(field.name ?? field.label);
}

function applyLegacyProfileAutofill<T extends ProfileAutofillField>(fields: T[], profile: AutofillProfile) {
  let matched = 0;
  const next = fields.map((field) => {
    const key = legacyKeyForField(field);
    const value = key ? profile[key] : undefined;
    if (!value) return field;
    matched += 1;
    return { ...field, value };
  });

  return { fields: next, matched };
}

function buildShadowReport<T extends ProfileAutofillField>(
  fields: T[],
  predictions: AutofillPrediction[],
  summary: ReturnType<typeof summarizeAutofillPredictions>,
  legacyMatched: number,
  mode: ProfileAutofillMode,
): ProfileAutofillShadowReport {
  const legacyKeysById = new Map(fields.map((field) => [field.id, legacyKeyForField(field)]));
  const confidences = predictions.map((prediction) => prediction.confidence);
  const profileKeys = new Set<string>();
  let agreementCount = 0;
  let disagreementCount = 0;
  let missingProfileValueCount = 0;
  let highConfidenceWithoutLegacyCount = 0;

  for (const prediction of predictions) {
    if (prediction.profileKey) profileKeys.add(prediction.profileKey);
    const legacyKey = legacyKeysById.get(prediction.fieldId) ?? null;
    if (prediction.profileKey && legacyKey === prediction.profileKey) agreementCount += 1;
    if (prediction.profileKey && legacyKey && legacyKey !== prediction.profileKey) disagreementCount += 1;
    if (prediction.profileKey && !prediction.hasProfileValue) missingProfileValueCount += 1;
    if (prediction.decision === "auto-fill" && !legacyKey) highConfidenceWithoutLegacyCount += 1;
  }

  const averageConfidence = confidences.length > 0
    ? Number((confidences.reduce((total, value) => total + value, 0) / confidences.length).toFixed(3))
    : 0;

  return {
    mode,
    fieldCount: fields.length,
    legacyMatched,
    intelligenceAutoFill: summary["auto-fill"],
    intelligenceReview: summary.review,
    intelligenceSuggest: summary.suggest,
    intelligenceSkip: summary.skip,
    agreementCount,
    disagreementCount,
    missingProfileValueCount,
    averageConfidence,
    highConfidenceWithoutLegacyCount,
    profileKeys: Array.from(profileKeys).sort().join(","),
  };
}

export function runProfileAutofill<T extends ProfileAutofillField>(
  fields: T[],
  profile: AutofillProfile,
  mode: ProfileAutofillMode = "legacy",
): ProfileAutofillResult<T> {
  const candidates = fields.map(toCandidate);
  const predictions = predictAutofillFields(candidates, profile);
  const summary = summarizeAutofillPredictions(predictions);
  const legacy = applyLegacyProfileAutofill(fields, profile);

  if (mode === "intelligence") {
    const next = applyAutofillPredictions(fields, profile, predictions, "auto-fill");
    const matched = next.filter((field, index) => field.value !== fields[index]?.value).length;
    return {
      fields: next,
      matched,
      mode,
      predictions,
      summary,
      shadowReport: buildShadowReport(fields, predictions, summary, legacy.matched, mode),
    };
  }

  return {
    fields: legacy.fields,
    matched: legacy.matched,
    mode,
    predictions,
    summary,
    shadowReport: buildShadowReport(fields, predictions, summary, legacy.matched, mode),
  };
}

export function shouldReportAutofillShadowMode(mode: ProfileAutofillMode) {
  return mode === "shadow" || mode === "intelligence";
}

export function autofillModeFromFlag(flag: string | undefined | null): ProfileAutofillMode {
  if (flag === "intelligence") return "intelligence";
  if (flag === "shadow") return "shadow";
  return "legacy";
}
