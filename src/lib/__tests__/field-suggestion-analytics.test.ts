import { trackPrivacySafeEvent } from "../analytics";
import {
  FIELD_SUGGESTION_ANALYTICS_EVENT,
  buildFieldSuggestionLifecycleProperties,
  createFieldSuggestionAnalyticsSession,
  fieldSuggestionCountBucket,
  fieldSuggestionDurationBucket,
  summarizeFieldSuggestionAnalytics,
  trackFieldSuggestionLifecycle,
  validateFieldSuggestionLifecycleProperties,
} from "../field-suggestion-analytics";

jest.mock("../analytics", () => ({
  trackPrivacySafeEvent: jest.fn(),
}));

const mockedTrackPrivacySafeEvent = jest.mocked(trackPrivacySafeEvent);

describe("field suggestion analytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("produces zero telemetry while disabled", () => {
    const session = createFieldSuggestionAnalyticsSession(false);

    expect(session.record({ stage: "eligibility", eligibility: "eligible" })).toBe(false);
    expect(session.record({ stage: "review_requested" })).toBe(false);
    expect(session.complete("dismissed")).toBe(false);
    expect(mockedTrackPrivacySafeEvent).not.toHaveBeenCalled();
  });

  it("emits only the allowlisted event name and rebuilt dimensions", () => {
    expect(trackFieldSuggestionLifecycle(true, {
      stage: "snapshot_ready",
      count: 8,
      scanDurationMs: 12,
      incrementalDurationMs: 4,
      filename: "private-form.pdf",
      documentUrl: "https://example.test/private-form.pdf",
      documentText: "Jane Smith",
      coordinates: { x: 1, y: 2 },
      userId: "user_private",
      errorMessage: "arbitrary private error",
    } as never)).toBe(true);

    expect(mockedTrackPrivacySafeEvent).toHaveBeenCalledWith(
      FIELD_SUGGESTION_ANALYTICS_EVENT,
      {
        stage: "snapshot_ready",
        count_bucket: "6_to_10",
        scan_duration_bucket: "10_to_25_ms",
        incremental_duration_bucket: "1_to_5_ms",
      },
    );
    const serialized = JSON.stringify(mockedTrackPrivacySafeEvent.mock.calls[0]);
    for (const forbidden of [
      "private-form.pdf",
      "example.test",
      "Jane Smith",
      "coordinates",
      "user_private",
      "arbitrary private error",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("normalizes unknown failure reasons to a generic value", () => {
    expect(buildFieldSuggestionLifecycleProperties({
      stage: "fail_closed",
      reason: "the whole arbitrary exception",
    })).toEqual({ stage: "fail_closed", reason: "unknown" });
    expect(buildFieldSuggestionLifecycleProperties({
      stage: "fail_closed",
      reason: "missing-canvas-context",
    })).toEqual({ stage: "fail_closed", reason: "missing_canvas_context" });
  });

  it("strictly validates only an already rebuilt wire payload", () => {
    expect(validateFieldSuggestionLifecycleProperties({
      stage: "snapshot_ready",
      count_bucket: "2_to_5",
      scan_duration_bucket: "5_to_10_ms",
      incremental_duration_bucket: "1_to_5_ms",
    })).toEqual({
      stage: "snapshot_ready",
      count_bucket: "2_to_5",
      scan_duration_bucket: "5_to_10_ms",
      incremental_duration_bucket: "1_to_5_ms",
    });
    expect(validateFieldSuggestionLifecycleProperties({
      stage: "snapshot_ready",
      count: 3,
    })).toBeNull();
    expect(validateFieldSuggestionLifecycleProperties({
      stage: "fail_closed",
      reason: "private parser exception",
    })).toBeNull();
    expect(validateFieldSuggestionLifecycleProperties({
      stage: "review_requested",
      filename: "private.pdf",
    })).toBeNull();
  });

  it("bounds counts and timings into fixed buckets", () => {
    expect(fieldSuggestionCountBucket(-1)).toBe("unknown");
    expect(fieldSuggestionCountBucket(0)).toBe("0");
    expect(fieldSuggestionCountBucket(100)).toBe("51_to_100");
    expect(fieldSuggestionCountBucket(101)).toBe("over_100");
    expect(fieldSuggestionDurationBucket(Number.POSITIVE_INFINITY)).toBe("unknown");
    expect(fieldSuggestionDurationBucket(0.5)).toBe("under_1_ms");
    expect(fieldSuggestionDurationBucket(50)).toBe("25_to_50_ms");
    expect(fieldSuggestionDurationBucket(51)).toBe("over_50_ms");
  });

  it("deduplicates lifecycle milestones across rerenders and Retry", () => {
    const emit = jest.fn();
    const session = createFieldSuggestionAnalyticsSession(true, emit);

    expect(session.record({ stage: "eligibility", eligibility: "eligible" })).toBe(true);
    expect(session.record({ stage: "eligibility", eligibility: "eligible" })).toBe(false);
    expect(session.record({ stage: "snapshot_ready", count: 2, scanDurationMs: 5 })).toBe(true);
    expect(session.record({ stage: "snapshot_ready", count: 2, scanDurationMs: 5 })).toBe(false);
    expect(session.record({ stage: "review_displayed", count: 2 })).toBe(true);
    expect(session.record({ stage: "retry" })).toBe(true);
    expect(session.record({ stage: "review_displayed", count: 2 })).toBe(false);
    expect(session.complete("accepted_selected", { count: 1 })).toBe(true);
    expect(session.complete("accepted_selected", { count: 1 })).toBe(false);
    expect(session.record({ stage: "retry" })).toBe(false);

    expect(emit.mock.calls.map(([, properties]) => properties.stage)).toEqual([
      "eligibility",
      "snapshot_ready",
      "review_displayed",
      "retry",
      "completed",
    ]);
  });

  it("is fail-open when analytics emission throws", () => {
    const session = createFieldSuggestionAnalyticsSession(true, () => {
      throw new Error("analytics unavailable");
    });

    expect(() => session.record({ stage: "review_requested" })).not.toThrow();
    expect(() => session.complete("fail_closed")).not.toThrow();
    expect(session.isComplete()).toBe(true);
  });

  it("summarizes only aggregate allowlisted lifecycle data", () => {
    const summary = summarizeFieldSuggestionAnalytics([
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "eligibility", eligibility: "eligible", filename: "private.pdf" } },
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "review_requested" } },
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "review_displayed", count: 4 } },
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "fail_closed", reason: "render-failed", scanDurationMs: 7 } },
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "completed", outcome: "accepted_selected", count: 1 } },
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "completed", outcome: "dismissed" } },
      { name: "download_success", properties: { stage: "completed", outcome: "accepted_all" } },
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "made_up", userId: "private" } },
    ]);

    expect(summary).toMatchObject({
      lifecycleEvents: 6,
      eligibleSessions: 1,
      reviewRequests: 1,
      reviewsDisplayed: 1,
      reviewDisplayRate: 100,
      acceptedOutcomes: 1,
      dismissedOutcomes: 1,
    });
    expect(summary.failClosedReasons.render_failed).toBe(1);
    expect(JSON.stringify(summary)).not.toContain("private.pdf");
  });

  it("does not turn a visibly split rolling window into a display rate", () => {
    const summary = summarizeFieldSuggestionAnalytics([
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "eligibility", eligibility: "eligible" } },
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "review_displayed" } },
      { name: FIELD_SUGGESTION_ANALYTICS_EVENT, properties: { stage: "review_displayed" } },
    ]);

    expect(summary.reviewDisplayRate).toBeNull();
  });
});
