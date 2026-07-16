import { isDocumentRevision } from "./field-suggestions";

export type FieldSuggestionRolloutMode = "off" | "local-review";

export const FIELD_SUGGESTION_INTENT_KEY = "quickfill:field-suggestion-intent:v1";

interface FieldSuggestionIntent {
  version: 1;
  documentRevision: string;
  pageIndex: 0;
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function fieldSuggestionRolloutModeFromFlag(
  flag: string | undefined | null,
): FieldSuggestionRolloutMode {
  return flag === "local-review" ? "local-review" : "off";
}

export function isFieldSuggestionReviewEnabled(
  flag = process.env.NEXT_PUBLIC_QUICKFILL_FIELD_SUGGESTIONS,
): boolean {
  return fieldSuggestionRolloutModeFromFlag(flag) === "local-review";
}

export function storeFieldSuggestionIntent(
  documentRevision: string,
  storage: Storage | null = getSessionStorage(),
): boolean {
  if (!storage || !isDocumentRevision(documentRevision)) return false;
  const intent: FieldSuggestionIntent = { version: 1, documentRevision, pageIndex: 0 };
  try {
    storage.setItem(FIELD_SUGGESTION_INTENT_KEY, JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

export function consumeFieldSuggestionIntent(
  expectedDocumentRevision: string,
  storage: Storage | null = getSessionStorage(),
): FieldSuggestionIntent | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(FIELD_SUGGESTION_INTENT_KEY);
    storage.removeItem(FIELD_SUGGESTION_INTENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<FieldSuggestionIntent>;
    if (
      value.version !== 1 ||
      value.pageIndex !== 0 ||
      !isDocumentRevision(value.documentRevision) ||
      value.documentRevision !== expectedDocumentRevision
    ) {
      return null;
    }
    return value as FieldSuggestionIntent;
  } catch {
    return null;
  }
}

export function clearFieldSuggestionIntent(storage: Storage | null = getSessionStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(FIELD_SUGGESTION_INTENT_KEY);
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
}
