export type AutofillProfileKey =
  | "fullName"
  | "email"
  | "phone"
  | "addressLine1"
  | "addressLine2"
  | "street"
  | "city"
  | "state"
  | "postcode"
  | "country"
  | "abn"
  | "organisation"
  | "dateOfBirth"
  | "gender"
  | "tfn"
  | "medicareNumber"
  | "medicareExpiry"
  | "driversLicence"
  | "driversLicenceExpiry"
  | "passportNumber"
  | "employer"
  | "jobTitle"
  | "bankBsb"
  | "bankAccount"
  | "bankName"
  | "signature";

export type AutofillFieldType = "text" | "checkbox" | "signature" | "date" | "comb";
export type AutofillDecision = "auto-fill" | "review" | "suggest" | "skip";
export type AutofillSource = "field-name" | "field-label" | "nearby-text" | "combined-context";

export interface AutofillFieldCandidate {
  id: string;
  name?: string;
  label?: string;
  nearbyText?: string;
  type: AutofillFieldType;
  value?: string;
}

export type AutofillProfile = Partial<Record<AutofillProfileKey, string | undefined>> & Record<string, string | undefined>;

export interface AutofillPrediction {
  fieldId: string;
  fieldType: AutofillFieldType;
  profileKey: AutofillProfileKey | null;
  confidence: number;
  decision: AutofillDecision;
  source: AutofillSource;
  reason: string;
  hasProfileValue: boolean;
}

interface MatchRule {
  key: AutofillProfileKey;
  exact: string[];
  tokens: string[][];
  weak?: string[];
  blocked?: string[];
  types?: AutofillFieldType[];
}

const AUTO_FILL_CONFIDENCE = 0.9;
const REVIEW_CONFIDENCE = 0.65;
const SUGGEST_CONFIDENCE = 0.45;

const RULES: MatchRule[] = [
  {
    key: "dateOfBirth",
    exact: ["date of birth", "birth date", "dob", "d o b"],
    tokens: [["date", "birth"], ["birth", "date"]],
    weak: ["born"],
    types: ["text", "date", "comb"],
  },
  {
    key: "fullName",
    exact: ["full name", "applicant name", "your name", "name of applicant", "client name", "tenant name"],
    tokens: [["full", "name"], ["applicant", "name"], ["client", "name"], ["tenant", "name"], ["given", "name"]],
    weak: ["name"],
    blocked: ["business name", "company name", "bank name", "employer name", "account name"],
    types: ["text"],
  },
  {
    key: "email",
    exact: ["email", "e mail", "email address", "e-mail address"],
    tokens: [["email"], ["mail", "address"]],
    types: ["text"],
  },
  {
    key: "phone",
    exact: ["phone", "telephone", "mobile", "mobile number", "contact number", "phone number"],
    tokens: [["phone"], ["mobile"], ["contact", "number"], ["telephone"]],
    types: ["text"],
  },
  {
    key: "addressLine1",
    exact: ["address line 1", "street address", "residential address", "postal address", "home address"],
    tokens: [["address", "line", "1"], ["street", "address"], ["residential", "address"], ["home", "address"]],
    weak: ["address"],
    blocked: ["email address"],
    types: ["text"],
  },
  {
    key: "addressLine2",
    exact: ["address line 2", "unit", "suite", "apartment", "apt"],
    tokens: [["address", "line", "2"], ["unit"], ["suite"], ["apartment"]],
    types: ["text"],
  },
  {
    key: "city",
    exact: ["city", "suburb", "town", "locality"],
    tokens: [["city"], ["suburb"], ["town"], ["locality"]],
    types: ["text"],
  },
  {
    key: "state",
    exact: ["state", "territory", "state territory", "province", "region"],
    tokens: [["state"], ["territory"], ["province"], ["region"]],
    types: ["text"],
  },
  {
    key: "postcode",
    exact: ["postcode", "post code", "postal code", "zip", "zip code"],
    tokens: [["post", "code"], ["postal", "code"], ["postcode"], ["zip"]],
    types: ["text", "comb"],
  },
  {
    key: "country",
    exact: ["country"],
    tokens: [["country"]],
    types: ["text"],
  },
  {
    key: "abn",
    exact: ["abn", "a b n", "australian business number", "business number"],
    tokens: [["abn"], ["business", "number"]],
    types: ["text", "comb"],
  },
  {
    key: "organisation",
    exact: ["organisation", "organization", "company", "company name", "business name", "trading name"],
    tokens: [["company"], ["business", "name"], ["organisation"], ["organization"], ["trading", "name"]],
    types: ["text"],
  },
  {
    key: "tfn",
    exact: ["tfn", "tax file number", "tax number"],
    tokens: [["tax", "file", "number"], ["tfn"]],
    types: ["text", "comb"],
  },
  {
    key: "medicareNumber",
    exact: ["medicare number", "medicare card number"],
    tokens: [["medicare", "number"], ["medicare", "card"]],
    types: ["text", "comb"],
  },
  {
    key: "medicareExpiry",
    exact: ["medicare expiry", "medicare expiry date", "medicare valid to"],
    tokens: [["medicare", "expiry"], ["medicare", "valid", "to"]],
    types: ["text", "date", "comb"],
  },
  {
    key: "driversLicence",
    exact: ["driver licence number", "drivers licence number", "licence number", "license number"],
    tokens: [["driver", "licence"], ["drivers", "licence"], ["license", "number"], ["licence", "number"]],
    types: ["text", "comb"],
  },
  {
    key: "driversLicenceExpiry",
    exact: ["driver licence expiry", "drivers licence expiry", "licence expiry", "license expiry"],
    tokens: [["driver", "licence", "expiry"], ["licence", "expiry"], ["license", "expiry"]],
    types: ["text", "date", "comb"],
  },
  {
    key: "passportNumber",
    exact: ["passport number", "passport no"],
    tokens: [["passport", "number"], ["passport", "no"]],
    types: ["text", "comb"],
  },
  {
    key: "employer",
    exact: ["employer", "employer name", "employer business name"],
    tokens: [["employer"], ["employer", "name"]],
    types: ["text"],
  },
  {
    key: "jobTitle",
    exact: ["job title", "occupation", "position", "role"],
    tokens: [["job", "title"], ["occupation"], ["position"], ["role"]],
    types: ["text"],
  },
  {
    key: "bankBsb",
    exact: ["bsb", "b s b", "bank bsb", "branch number"],
    tokens: [["bsb"], ["branch", "number"]],
    types: ["text", "comb"],
  },
  {
    key: "bankAccount",
    exact: ["account number", "bank account number", "acct number"],
    tokens: [["account", "number"], ["bank", "account"]],
    blocked: ["phone number", "contact number", "abn", "tax file number"],
    types: ["text", "comb"],
  },
  {
    key: "bankName",
    exact: ["bank name", "financial institution", "bank institution"],
    tokens: [["bank", "name"], ["financial", "institution"]],
    types: ["text"],
  },
  {
    key: "signature",
    exact: ["signature", "sign here", "signed", "applicant signature", "your signature"],
    tokens: [["signature"], ["sign", "here"], ["applicant", "signature"]],
    weak: ["signed"],
    types: ["signature", "text"],
  },
];

function normalizeText(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_\-.()[\]{}:/\\]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldContext(field: AutofillFieldCandidate) {
  const parts = [field.label, field.name, field.nearbyText].filter(Boolean) as string[];
  return normalizeText(parts.join(" "));
}

function contextSource(field: AutofillFieldCandidate): AutofillSource {
  if (field.label && normalizeText(field.label)) return "field-label";
  if (field.name && normalizeText(field.name)) return "field-name";
  if (field.nearbyText && normalizeText(field.nearbyText)) return "nearby-text";
  return "combined-context";
}

function includesPhrase(context: string, phrase: string) {
  const normalized = normalizeText(phrase);
  return context === normalized || context.includes(` ${normalized} `) || context.startsWith(`${normalized} `) || context.endsWith(` ${normalized}`);
}

function hasAllTokens(context: string, tokens: string[]) {
  const words = new Set(context.split(" ").filter(Boolean));
  return tokens.every((token) => words.has(normalizeText(token)));
}

function profileHasValue(profile: AutofillProfile | undefined, key: AutofillProfileKey | null) {
  if (!profile || !key) return false;
  return Boolean(profile[key]?.trim());
}

function confidenceToDecision(confidence: number, hasValue: boolean): AutofillDecision {
  if (!hasValue) return confidence >= SUGGEST_CONFIDENCE ? "suggest" : "skip";
  if (confidence >= AUTO_FILL_CONFIDENCE) return "auto-fill";
  if (confidence >= REVIEW_CONFIDENCE) return "review";
  if (confidence >= SUGGEST_CONFIDENCE) return "suggest";
  return "skip";
}

function scoreRule(rule: MatchRule, field: AutofillFieldCandidate, context: string) {
  if (rule.types && !rule.types.includes(field.type)) return null;
  if (rule.blocked?.some((phrase) => includesPhrase(context, phrase))) return null;

  let confidence = 0;
  let reason = "";

  for (const phrase of rule.exact) {
    if (includesPhrase(context, phrase)) {
      confidence = Math.max(confidence, phrase.length <= 4 ? 0.91 : 0.96);
      reason = `Matched exact phrase "${phrase}"`;
    }
  }

  for (const tokens of rule.tokens) {
    if (hasAllTokens(context, tokens)) {
      const tokenScore = tokens.length === 1 ? 0.72 : 0.86 + Math.min(tokens.length, 3) * 0.03;
      if (tokenScore > confidence) {
        confidence = Math.min(tokenScore, 0.94);
        reason = `Matched tokens ${tokens.join(" + ")}`;
      }
    }
  }

  for (const weak of rule.weak ?? []) {
    if (includesPhrase(context, weak) && confidence < 0.66) {
      confidence = 0.58;
      reason = `Weak match on "${weak}"`;
    }
  }

  if (field.type === "signature" && rule.key === "signature") {
    confidence = Math.max(confidence, 0.98);
    reason = reason || "Signature field type";
  }

  if (field.type === "checkbox" && rule.key !== "signature") return null;
  if (confidence === 0) return null;

  return { key: rule.key, confidence: Number(confidence.toFixed(2)), reason };
}

export function predictAutofillField(
  field: AutofillFieldCandidate,
  profile?: AutofillProfile,
): AutofillPrediction {
  const context = fieldContext(field);
  let best: { key: AutofillProfileKey; confidence: number; reason: string } | null = null;

  for (const rule of RULES) {
    const scored = scoreRule(rule, field, context);
    if (!scored) continue;
    if (!best || scored.confidence > best.confidence) best = scored;
  }

  const hasValue = profileHasValue(profile, best?.key ?? null);
  const confidence = best?.confidence ?? 0;

  return {
    fieldId: field.id,
    fieldType: field.type,
    profileKey: best?.key ?? null,
    confidence,
    decision: confidenceToDecision(confidence, hasValue),
    source: contextSource(field),
    reason: best?.reason ?? "No confident profile match",
    hasProfileValue: hasValue,
  };
}

export function predictAutofillFields(
  fields: AutofillFieldCandidate[],
  profile?: AutofillProfile,
) {
  return fields.map((field) => predictAutofillField(field, profile));
}

export function applyAutofillPredictions<T extends { id: string; value?: string; type: AutofillFieldType }>(
  fields: T[],
  profile: AutofillProfile,
  predictions: AutofillPrediction[],
  minimumDecision: AutofillDecision = "auto-fill",
): T[] {
  const decisionRank: Record<AutofillDecision, number> = {
    skip: 0,
    suggest: 1,
    review: 2,
    "auto-fill": 3,
  };
  const minimumRank = decisionRank[minimumDecision];
  const byId = new Map(predictions.map((prediction) => [prediction.fieldId, prediction]));

  return fields.map((field) => {
    const prediction = byId.get(field.id);
    if (!prediction?.profileKey) return field;
    if (field.type !== "text" && field.type !== "date" && field.type !== "comb") return field;
    if (decisionRank[prediction.decision] < minimumRank) return field;
    const value = profile[prediction.profileKey];
    if (!value) return field;
    return { ...field, value };
  });
}

export function summarizeAutofillPredictions(predictions: AutofillPrediction[]) {
  return predictions.reduce(
    (summary, prediction) => {
      summary[prediction.decision] += 1;
      return summary;
    },
    { "auto-fill": 0, review: 0, suggest: 0, skip: 0 } as Record<AutofillDecision, number>,
  );
}
