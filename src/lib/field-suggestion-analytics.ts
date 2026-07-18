import { trackPrivacySafeEvent, type AnalyticsProperties } from "./analytics";

export const FIELD_SUGGESTION_ANALYTICS_EVENT = "field_suggestion_lifecycle" as const;

export const FIELD_SUGGESTION_LIFECYCLE_STAGES = [
  "eligibility",
  "review_requested",
  "snapshot_ready",
  "fail_closed",
  "review_displayed",
  "retry",
  "individual_accept",
  "individual_reject",
  "accept_all",
  "dismissed",
  "completed",
] as const;

export const FIELD_SUGGESTION_FAILURE_REASONS = [
  "render_failed",
  "missing_canvas",
  "missing_canvas_context",
  "detector_failed",
  "ineligible_metadata",
  "invalid_snapshot",
  "incremental_budget_exceeded",
  "snapshot_timeout",
  "snapshot_cancelled",
  "stale_document",
  "page_changed",
  "mapping_failed",
  "revision_mismatch",
  "invalid_request",
  "unknown",
] as const;

export const FIELD_SUGGESTION_OUTCOMES = [
  "accepted_all",
  "accepted_selected",
  "dismissed",
  "fail_closed",
  "superseded",
  "ineligible",
] as const;

export const FIELD_SUGGESTION_COUNT_BUCKETS = [
  "0",
  "1",
  "2_to_5",
  "6_to_10",
  "11_to_25",
  "26_to_50",
  "51_to_100",
  "over_100",
  "unknown",
] as const;

export const FIELD_SUGGESTION_DURATION_BUCKETS = [
  "under_1_ms",
  "1_to_5_ms",
  "5_to_10_ms",
  "10_to_25_ms",
  "25_to_50_ms",
  "over_50_ms",
  "unknown",
] as const;

export type FieldSuggestionLifecycleStage = (typeof FIELD_SUGGESTION_LIFECYCLE_STAGES)[number];
export type FieldSuggestionFailureReason = (typeof FIELD_SUGGESTION_FAILURE_REASONS)[number];
export type FieldSuggestionOutcome = (typeof FIELD_SUGGESTION_OUTCOMES)[number];
export type FieldSuggestionCountBucket = (typeof FIELD_SUGGESTION_COUNT_BUCKETS)[number];
export type FieldSuggestionDurationBucket = (typeof FIELD_SUGGESTION_DURATION_BUCKETS)[number];
export type FieldSuggestionEligibility = "eligible" | "ineligible";

export interface FieldSuggestionLifecycleInput {
  stage: unknown;
  eligibility?: unknown;
  reason?: unknown;
  outcome?: unknown;
  count?: unknown;
  scanDurationMs?: unknown;
  incrementalDurationMs?: unknown;
  count_bucket?: unknown;
  scan_duration_bucket?: unknown;
  incremental_duration_bucket?: unknown;
}

export interface FieldSuggestionLifecycleProperties extends AnalyticsProperties {
  stage: FieldSuggestionLifecycleStage;
  eligibility?: FieldSuggestionEligibility;
  reason?: FieldSuggestionFailureReason;
  outcome?: FieldSuggestionOutcome;
  count_bucket?: FieldSuggestionCountBucket;
  scan_duration_bucket?: FieldSuggestionDurationBucket;
  incremental_duration_bucket?: FieldSuggestionDurationBucket;
}

type FieldSuggestionAnalyticsEmitter = (
  name: typeof FIELD_SUGGESTION_ANALYTICS_EVENT,
  properties: FieldSuggestionLifecycleProperties,
) => void;

const STAGE_SET = new Set<string>(FIELD_SUGGESTION_LIFECYCLE_STAGES);
const OUTCOME_SET = new Set<string>(FIELD_SUGGESTION_OUTCOMES);
const COUNT_BUCKET_SET = new Set<string>(FIELD_SUGGESTION_COUNT_BUCKETS);
const DURATION_BUCKET_SET = new Set<string>(FIELD_SUGGESTION_DURATION_BUCKETS);
const SINGLETON_STAGES = new Set<FieldSuggestionLifecycleStage>([
  "eligibility",
  "review_requested",
  "snapshot_ready",
  "fail_closed",
  "review_displayed",
  "accept_all",
  "dismissed",
]);

const FAILURE_REASON_ALIASES: Readonly<Record<string, FieldSuggestionFailureReason>> = {
  "render-failed": "render_failed",
  render_failed: "render_failed",
  "missing-canvas": "missing_canvas",
  missing_canvas: "missing_canvas",
  "missing-canvas-context": "missing_canvas_context",
  missing_canvas_context: "missing_canvas_context",
  "detector-failed": "detector_failed",
  detector_failed: "detector_failed",
  "ineligible-metadata": "ineligible_metadata",
  ineligible_metadata: "ineligible_metadata",
  "invalid-snapshot": "invalid_snapshot",
  invalid_snapshot: "invalid_snapshot",
  "incremental-budget-exceeded": "incremental_budget_exceeded",
  incremental_budget_exceeded: "incremental_budget_exceeded",
  snapshot_timeout: "snapshot_timeout",
  snapshot_cancelled: "snapshot_cancelled",
  stale_document: "stale_document",
  page_changed: "page_changed",
  mapping_failed: "mapping_failed",
  revision_mismatch: "revision_mismatch",
  invalid_request: "invalid_request",
  unknown: "unknown",
};

function normalizeStage(value: unknown): FieldSuggestionLifecycleStage | null {
  return typeof value === "string" && STAGE_SET.has(value)
    ? value as FieldSuggestionLifecycleStage
    : null;
}

export function normalizeFieldSuggestionFailureReason(value: unknown): FieldSuggestionFailureReason {
  return typeof value === "string" ? FAILURE_REASON_ALIASES[value] ?? "unknown" : "unknown";
}

function normalizeOutcome(value: unknown): FieldSuggestionOutcome | null {
  return typeof value === "string" && OUTCOME_SET.has(value)
    ? value as FieldSuggestionOutcome
    : null;
}

function normalizeCountBucket(value: unknown): FieldSuggestionCountBucket | null {
  return typeof value === "string" && COUNT_BUCKET_SET.has(value)
    ? value as FieldSuggestionCountBucket
    : null;
}

function normalizeDurationBucket(value: unknown): FieldSuggestionDurationBucket | null {
  return typeof value === "string" && DURATION_BUCKET_SET.has(value)
    ? value as FieldSuggestionDurationBucket
    : null;
}

export function fieldSuggestionCountBucket(value: unknown): FieldSuggestionCountBucket {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return "unknown";
  const count = value as number;
  if (count === 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2_to_5";
  if (count <= 10) return "6_to_10";
  if (count <= 25) return "11_to_25";
  if (count <= 50) return "26_to_50";
  if (count <= 100) return "51_to_100";
  return "over_100";
}

export function fieldSuggestionDurationBucket(value: unknown): FieldSuggestionDurationBucket {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "unknown";
  if (value < 1) return "under_1_ms";
  if (value < 5) return "1_to_5_ms";
  if (value < 10) return "5_to_10_ms";
  if (value < 25) return "10_to_25_ms";
  if (value <= 50) return "25_to_50_ms";
  return "over_50_ms";
}

export function buildFieldSuggestionLifecycleProperties(
  input: FieldSuggestionLifecycleInput,
): FieldSuggestionLifecycleProperties | null {
  if (!input || typeof input !== "object") return null;
  const stage = normalizeStage(input.stage);
  if (!stage) return null;

  const properties: FieldSuggestionLifecycleProperties = { stage };

  if (stage === "eligibility") {
    if (input.eligibility !== "eligible" && input.eligibility !== "ineligible") return null;
    properties.eligibility = input.eligibility;
    if (input.eligibility === "ineligible") {
      properties.reason = normalizeFieldSuggestionFailureReason(input.reason);
    }
  }

  if (stage === "fail_closed") {
    properties.reason = normalizeFieldSuggestionFailureReason(input.reason);
  }

  if (stage === "completed") {
    const outcome = normalizeOutcome(input.outcome);
    if (!outcome) return null;
    properties.outcome = outcome;
  }

  if (stage === "snapshot_ready" || stage === "review_displayed" || stage === "accept_all" || stage === "completed") {
    if (input.count !== undefined) {
      properties.count_bucket = fieldSuggestionCountBucket(input.count);
    } else {
      const countBucket = normalizeCountBucket(input.count_bucket);
      if (countBucket) properties.count_bucket = countBucket;
    }
  }

  if (stage === "snapshot_ready" || stage === "review_displayed" || stage === "fail_closed") {
    if (input.scanDurationMs !== undefined) {
      properties.scan_duration_bucket = fieldSuggestionDurationBucket(input.scanDurationMs);
    } else {
      const scanDurationBucket = normalizeDurationBucket(input.scan_duration_bucket);
      if (scanDurationBucket) properties.scan_duration_bucket = scanDurationBucket;
    }
    if (input.incrementalDurationMs !== undefined) {
      properties.incremental_duration_bucket = fieldSuggestionDurationBucket(input.incrementalDurationMs);
    } else {
      const incrementalDurationBucket = normalizeDurationBucket(input.incremental_duration_bucket);
      if (incrementalDurationBucket) properties.incremental_duration_bucket = incrementalDurationBucket;
    }
  }

  return properties;
}

/**
 * Validates the exact wire payload accepted by the analytics API. Unlike the
 * client-side builder, this rejects rather than drops or normalizes anything:
 * every supplied key and value must already match the documented schema.
 */
export function validateFieldSuggestionLifecycleProperties(
  input: unknown,
): FieldSuggestionLifecycleProperties | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const inputRecord = input as Record<string, unknown>;
  const properties = buildFieldSuggestionLifecycleProperties(
    inputRecord as unknown as FieldSuggestionLifecycleInput,
  );
  if (!properties) return null;

  const inputKeys = Object.keys(inputRecord).sort();
  const propertyKeys = Object.keys(properties).sort();
  if (
    inputKeys.length !== propertyKeys.length ||
    inputKeys.some((key, index) => key !== propertyKeys[index])
  ) return null;

  for (const key of propertyKeys) {
    if (inputRecord[key] !== properties[key]) return null;
  }

  return properties;
}

export function trackFieldSuggestionLifecycle(
  enabled: boolean,
  input: FieldSuggestionLifecycleInput,
  emit: FieldSuggestionAnalyticsEmitter = trackPrivacySafeEvent,
): boolean {
  if (!enabled) return false;
  const properties = buildFieldSuggestionLifecycleProperties(input);
  if (!properties) return false;
  try {
    emit(FIELD_SUGGESTION_ANALYTICS_EVENT, properties);
    return true;
  } catch {
    return false;
  }
}

export interface FieldSuggestionAnalyticsSession {
  record: (input: FieldSuggestionLifecycleInput) => boolean;
  complete: (
    outcome: FieldSuggestionOutcome,
    details?: Pick<FieldSuggestionLifecycleInput, "count">,
  ) => boolean;
  isComplete: () => boolean;
}

export function createFieldSuggestionAnalyticsSession(
  enabled: boolean,
  emit: FieldSuggestionAnalyticsEmitter = trackPrivacySafeEvent,
): FieldSuggestionAnalyticsSession {
  const emittedSingletons = new Set<FieldSuggestionLifecycleStage>();
  let completed = false;

  return {
    record(input) {
      if (completed) return false;
      const properties = buildFieldSuggestionLifecycleProperties(input);
      if (!properties) return false;
      if (SINGLETON_STAGES.has(properties.stage)) {
        if (emittedSingletons.has(properties.stage)) return false;
        emittedSingletons.add(properties.stage);
      }
      return trackFieldSuggestionLifecycle(enabled, input, emit);
    },
    complete(outcome, details = {}) {
      if (completed) return false;
      completed = true;
      return trackFieldSuggestionLifecycle(enabled, {
        stage: "completed",
        outcome,
        count: details.count,
      }, emit);
    },
    isComplete() {
      return completed;
    },
  };
}

export interface FieldSuggestionOpsSummary {
  lifecycleEvents: number;
  eligibleSessions: number;
  ineligibleSessions: number;
  reviewRequests: number;
  reviewsDisplayed: number;
  reviewDisplayRate: number | null;
  acceptedOutcomes: number;
  dismissedOutcomes: number;
  failClosedOutcomes: number;
  supersededOutcomes: number;
  outcomes: Record<FieldSuggestionOutcome, number>;
  failClosedReasons: Record<FieldSuggestionFailureReason, number>;
  scanDurationBuckets: Record<FieldSuggestionDurationBucket, number>;
  incrementalDurationBuckets: Record<FieldSuggestionDurationBucket, number>;
}

function zeroRecord<const T extends readonly string[]>(values: T): Record<T[number], number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T[number], number>;
}

export function summarizeFieldSuggestionAnalytics(events: readonly unknown[]): FieldSuggestionOpsSummary {
  const outcomes = zeroRecord(FIELD_SUGGESTION_OUTCOMES);
  const failClosedReasons = zeroRecord(FIELD_SUGGESTION_FAILURE_REASONS);
  const scanDurationBuckets = zeroRecord(FIELD_SUGGESTION_DURATION_BUCKETS);
  const incrementalDurationBuckets = zeroRecord(FIELD_SUGGESTION_DURATION_BUCKETS);
  let lifecycleEvents = 0;
  let eligibleSessions = 0;
  let ineligibleSessions = 0;
  let reviewRequests = 0;
  let reviewsDisplayed = 0;

  for (const rawEvent of events) {
    if (!rawEvent || typeof rawEvent !== "object") continue;
    const event = rawEvent as { name?: unknown; properties?: unknown };
    if (event.name !== FIELD_SUGGESTION_ANALYTICS_EVENT || !event.properties || typeof event.properties !== "object") continue;
    const properties = buildFieldSuggestionLifecycleProperties(event.properties as FieldSuggestionLifecycleInput);
    if (!properties) continue;

    lifecycleEvents += 1;
    if (properties.stage === "eligibility" && properties.eligibility === "eligible") eligibleSessions += 1;
    if (properties.stage === "eligibility" && properties.eligibility === "ineligible") ineligibleSessions += 1;
    if (properties.stage === "review_requested") reviewRequests += 1;
    if (properties.stage === "review_displayed") reviewsDisplayed += 1;
    if (properties.stage === "completed" && properties.outcome) outcomes[properties.outcome] += 1;
    if (properties.stage === "fail_closed" && properties.reason) failClosedReasons[properties.reason] += 1;
    if (properties.scan_duration_bucket) scanDurationBuckets[properties.scan_duration_bucket] += 1;
    if (properties.incremental_duration_bucket) incrementalDurationBuckets[properties.incremental_duration_bucket] += 1;
  }

  return {
    lifecycleEvents,
    eligibleSessions,
    ineligibleSessions,
    reviewRequests,
    reviewsDisplayed,
    reviewDisplayRate: eligibleSessions > 0 && reviewsDisplayed <= eligibleSessions
      ? Math.round((reviewsDisplayed / eligibleSessions) * 100)
      : null,
    acceptedOutcomes: outcomes.accepted_all + outcomes.accepted_selected,
    dismissedOutcomes: outcomes.dismissed,
    failClosedOutcomes: outcomes.fail_closed,
    supersededOutcomes: outcomes.superseded,
    outcomes,
    failClosedReasons,
    scanDurationBuckets,
    incrementalDurationBuckets,
  };
}
