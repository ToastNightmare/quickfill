import {
  createDocumentRevision,
  createFieldSuggestionId,
  fieldSuggestionsToEditorFields,
  parseFieldSuggestion,
  validateFieldSuggestions,
  withSuggestionType,
  type FieldSuggestion,
  type FieldSuggestionBounds,
} from "../field-suggestions";
import {
  LOCAL_FIELD_SUGGESTION_MAX_BOXES,
  LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS,
  LOCAL_FIELD_SUGGESTION_MAX_MAPPING_MS,
  LOCAL_FIELD_SUGGESTION_MAX_PIXELS,
  LOCAL_FIELD_SUGGESTION_MAX_SCAN_MS,
  localFieldDetectionSnapshotKeysEqual,
  mapLocalFieldSuggestions,
  prepareLocalFieldDetectionSnapshot,
  reduceLocalFieldDetectionLifecycle,
  renderedCanvasBoxToPageBounds,
  type LocalFieldDetectionLifecycleEvent,
  type LocalFieldDetectionSnapshot,
  type LocalFieldDetectionSnapshotKey,
} from "../local-field-suggestion-provider";
import {
  FIELD_SUGGESTION_INTENT_KEY,
  clearFieldSuggestionIntent,
  consumeFieldSuggestionIntent,
  fieldSuggestionRolloutModeFromFlag,
  isFieldSuggestionReviewEnabled,
  storeFieldSuggestionIntent,
} from "../field-suggestion-rollout";
const DOCUMENT_REVISION = `qf-document-v1-${"a".repeat(64)}`;
const OTHER_DOCUMENT_REVISION = `qf-document-v1-${"b".repeat(64)}`;
const DETERMINISTIC_NOW = () => 0;

function suggestion(overrides: Partial<FieldSuggestion> = {}): FieldSuggestion {
  const boundingBox: FieldSuggestionBounds = overrides.boundingBox ?? {
    x: 10,
    y: 20,
    width: 60,
    height: 18,
  };
  const documentRevision = overrides.documentRevision ?? DOCUMENT_REVISION;
  const pageIndex = overrides.pageIndex ?? 0;
  return {
    schemaVersion: 1,
    id: createFieldSuggestionId({ documentRevision, pageIndex, boundingBox }),
    documentRevision,
    type: "text",
    pageIndex,
    boundingBox,
    coordinateSpace: {
      unit: "pdf-point",
      origin: "top-left",
      pageWidth: 100,
      pageHeight: 120,
    },
    confidence: 0.75,
    metadata: { category: "visual-box", reasoning: "rectangular-entry-boundary" },
    ...overrides,
  };
}

const VALIDATION_CONTEXT = {
  documentRevision: DOCUMENT_REVISION,
  pageIndex: 0,
  pageWidth: 100,
  pageHeight: 120,
};

describe("field suggestion schema", () => {
  it("accepts a strictly valid, document-bound suggestion", () => {
    const value = suggestion();
    expect(parseFieldSuggestion(value, VALIDATION_CONTEXT)).toEqual(value);
  });

  it.each([
    ["NaN x", { x: Number.NaN, y: 20, width: 60, height: 18 }],
    ["negative x", { x: -1, y: 20, width: 60, height: 18 }],
    ["zero width", { x: 10, y: 20, width: 0, height: 18 }],
    ["negative height", { x: 10, y: 20, width: 60, height: -1 }],
    ["right overflow", { x: 50, y: 20, width: 60, height: 18 }],
    ["bottom overflow", { x: 10, y: 110, width: 60, height: 18 }],
  ])("rejects %s", (_name, boundingBox) => {
    expect(parseFieldSuggestion(suggestion({ boundingBox }), VALIDATION_CONTEXT)).toBeNull();
  });

  it("rejects unsupported types, non-finite confidence, and mismatched coordinate dimensions", () => {
    expect(parseFieldSuggestion({ ...suggestion(), type: "date" }, VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion({ ...suggestion(), confidence: Number.POSITIVE_INFINITY }, VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion({
      ...suggestion(),
      coordinateSpace: { ...suggestion().coordinateSpace, pageWidth: 101 },
    }, VALIDATION_CONTEXT)).toBeNull();
  });

  it("rejects a stale document, wrong page, and non-QuickFill or recomputed ID", () => {
    expect(parseFieldSuggestion(suggestion({ documentRevision: OTHER_DOCUMENT_REVISION }), VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion(suggestion({ pageIndex: 1 }), VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion({ ...suggestion(), id: "provider-field-1" }, VALIDATION_CONTEXT)).toBeNull();
    expect(parseFieldSuggestion({
      ...suggestion(),
      boundingBox: { ...suggestion().boundingBox, x: 11 },
    }, VALIDATION_CONTEXT)).toBeNull();
  });

  it("deduplicates stable IDs and keeps the last validated version", () => {
    const first = suggestion();
    const changedType = withSuggestionType(first, "checkbox");
    expect(changedType.id).toBe(first.id);
    expect(validateFieldSuggestions([first, changedType], VALIDATION_CONTEXT)).toEqual([changedType]);
  });

  it("creates deterministic revisions without exposing the document bytes", async () => {
    const first = await createDocumentRevision(Uint8Array.from([1, 2, 3]).buffer);
    const same = await createDocumentRevision(Uint8Array.from([1, 2, 3]).buffer);
    const different = await createDocumentRevision(Uint8Array.from([1, 2, 4]).buffer);

    expect(first).toBe(same);
    expect(first).not.toBe(different);
    expect(first).toMatch(/^qf-document-v1-[a-f0-9]{16,64}$/);
    expect(first).not.toContain("1,2,3");
  });

  it("creates empty text and unchecked checkbox editor fields with unique IDs", () => {
    const text = suggestion();
    const checkbox = withSuggestionType(suggestion({
      boundingBox: { x: 75, y: 20, width: 18, height: 18 },
      id: createFieldSuggestionId({
        documentRevision: DOCUMENT_REVISION,
        pageIndex: 0,
        boundingBox: { x: 75, y: 20, width: 18, height: 18 },
      }),
    }), "checkbox");
    const fields = fieldSuggestionsToEditorFields([text, checkbox], [{ id: "suggested-text-existing" }]);

    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({ type: "text", value: "", page: 0 });
    expect(fields[1]).toMatchObject({ type: "checkbox", checked: false, page: 0 });
    expect(new Set(fields.map((field) => field.id)).size).toBe(2);
    expect(fields.some((field) => field.id === "suggested-text-existing")).toBe(false);
  });
});

function snapshotKey(overrides: Partial<LocalFieldDetectionSnapshotKey> = {}): LocalFieldDetectionSnapshotKey {
  return {
    documentRevision: 1,
    viewerInstanceId: 1,
    renderGeneration: 1,
    pageIndex: 0,
    rotation: 0,
    viewportTransform: [2, 0, 0, -2, 0, 1200],
    canvasWidth: 1000,
    canvasHeight: 1200,
    viewportWidth: 500,
    viewportHeight: 600,
    renderedViewportWidth: 1000,
    renderedViewportHeight: 1200,
    ...overrides,
  };
}

function detectionSnapshot(overrides: {
  key?: Partial<LocalFieldDetectionSnapshotKey>;
  scanDurationMs?: number;
  boxes?: LocalFieldDetectionSnapshot["boxes"];
} = {}): LocalFieldDetectionSnapshot {
  return {
    key: snapshotKey(overrides.key),
    scanDurationMs: overrides.scanDurationMs ?? 12,
    boxes: overrides.boxes ?? [
      { x: 20, y: 20, width: 30, height: 30 },
      { x: 100, y: 80, width: 240, height: 40 },
    ],
  };
}

function mapSnapshot(
  snapshot: LocalFieldDetectionSnapshot,
  now: () => number = DETERMINISTIC_NOW,
  incrementalDurationMs = 0,
) {
  return mapLocalFieldSuggestions({
    snapshot,
    documentRevision: DOCUMENT_REVISION,
    expectedDocumentRevision: snapshot.key.documentRevision,
    incrementalDurationMs,
    now,
  });
}

describe("local field suggestion snapshot provider", () => {
  it.each([
    {
      canvas: { width: 1200, height: 1600 },
      viewport: { width: 600, height: 800 },
      box: { x: 200, y: 400, width: 400, height: 60 },
    },
    {
      canvas: { width: 1800, height: 1600 },
      viewport: { width: 600, height: 800 },
      box: { x: 300, y: 400, width: 600, height: 60 },
    },
    {
      canvas: { width: 900, height: 1200 },
      viewport: { width: 600, height: 800 },
      box: { x: 150, y: 300, width: 300, height: 45 },
    },
  ])("uses independent rendered-canvas X/Y scales for %#", ({ canvas, viewport, box }) => {
    expect(renderedCanvasBoxToPageBounds(box, canvas, viewport)).toEqual({
      x: 100,
      y: 200,
      width: 200,
      height: 30,
    });
  });

  it("keeps landscape scale-1 geometry and IDs stable across independent backing-canvas scales", () => {
    const first = mapSnapshot(detectionSnapshot({
      key: {
        canvasWidth: 792,
        canvasHeight: 612,
        viewportWidth: 396,
        viewportHeight: 306,
        renderedViewportWidth: 792,
        renderedViewportHeight: 612,
      },
      boxes: [{ x: 198, y: 306, width: 396, height: 102 }],
    }));
    const second = mapSnapshot(detectionSnapshot({
      key: {
        renderGeneration: 2,
        canvasWidth: 1188,
        canvasHeight: 918,
        viewportWidth: 396,
        viewportHeight: 306,
        renderedViewportWidth: 1188,
        renderedViewportHeight: 918,
      },
      boxes: [{ x: 297, y: 459, width: 594, height: 153 }],
    }));

    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    if (first.status !== "ready" || second.status !== "ready") throw new Error("Expected eligible snapshots");
    expect(first.suggestions[0].boundingBox).toEqual(second.suggestions[0].boundingBox);
    expect(first.suggestions[0].id).toBe(second.suggestions[0].id);
  });

  it.each([
    { x: 0, y: 0, width: 0, height: 10 },
    { x: 0, y: 0, width: Number.NaN, height: 10 },
    { x: -1, y: 0, width: 10, height: 10 },
    { x: 95, y: 0, width: 10, height: 10 },
  ])("rejects unusable rendered box %#", (box) => {
    expect(renderedCanvasBoxToPageBounds(
      box,
      { width: 100, height: 100 },
      { width: 50, height: 50 },
    )).toBeNull();
  });

  it("maps only validated text and checkbox suggestions without canvas or network access", () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = jest.fn();
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, configurable: true, writable: true });
    const result = mapSnapshot(detectionSnapshot());

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected eligible snapshot");
    expect(result.suggestions.map((item) => item.type)).toEqual(["checkbox", "text"]);
    expect(result.suggestions.every((item) => item.documentRevision === DOCUMENT_REVISION && item.pageIndex === 0)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    if (originalFetch) globalThis.fetch = originalFetch;
    else Reflect.deleteProperty(globalThis, "fetch");
  });

  it.each([
    [LOCAL_FIELD_SUGGESTION_MAX_PIXELS, true],
    [LOCAL_FIELD_SUGGESTION_MAX_PIXELS + 1, false],
  ])("applies the exact pixel boundary %i", (pixelCount, eligible) => {
    const result = mapSnapshot(detectionSnapshot({
      key: {
        canvasWidth: 1,
        canvasHeight: pixelCount,
        viewportWidth: 1,
        viewportHeight: pixelCount,
        renderedViewportWidth: 1,
        renderedViewportHeight: pixelCount,
      },
      boxes: [{ x: 0, y: 0, width: 1, height: 1 }],
    }));
    expect(result.status === "ready").toBe(eligible);
  });

  it.each([
    [LOCAL_FIELD_SUGGESTION_MAX_SCAN_MS, true],
    [LOCAL_FIELD_SUGGESTION_MAX_SCAN_MS + 0.001, false],
  ])("applies the exact scan-duration boundary %f ms", (scanDurationMs, eligible) => {
    expect(mapSnapshot(detectionSnapshot({ scanDurationMs })).status === "ready").toBe(eligible);
  });

  it.each([
    [LOCAL_FIELD_SUGGESTION_MAX_BOXES, true],
    [LOCAL_FIELD_SUGGESTION_MAX_BOXES + 1, false],
  ])("applies the exact box-count boundary %i", (boxCount, eligible) => {
    const boxes = Array.from({ length: boxCount }, (_, index) => ({
      x: (index % 10) * 50,
      y: Math.floor(index / 10) * 50,
      width: 20,
      height: 20,
    }));
    expect(mapSnapshot(detectionSnapshot({ boxes })).status === "ready").toBe(eligible);
  });

  it.each([
    [LOCAL_FIELD_SUGGESTION_MAX_MAPPING_MS, true],
    [LOCAL_FIELD_SUGGESTION_MAX_MAPPING_MS + 0.001, false],
  ])("applies the exact mapping-duration boundary %f ms", (duration, eligible) => {
    const times = [0, duration];
    const result = mapSnapshot(detectionSnapshot(), () => times.shift() ?? duration);
    expect(result.status === "ready").toBe(eligible);
    expect(result.mappingDurationMs).toBe(duration);
  });

  it.each([
    [4, 6, true],
    [4, 6.001, false],
  ])("applies the cumulative incremental boundary (prior=%f, mapping=%f)", (prior, mapping, eligible) => {
    const times = [0, mapping];
    const result = mapSnapshot(detectionSnapshot(), () => times.shift() ?? mapping, prior);
    expect(result.status === "ready").toBe(eligible);
    expect(result.incrementalDurationMs).toBe(prior + mapping);
    if (!eligible) expect(result).toMatchObject({ reason: "incremental-budget-exceeded", suggestions: [] });
  });

  it.each([
    ["zero document revision", { key: { documentRevision: 0 } }],
    ["negative viewer id", { key: { viewerInstanceId: -1 } }],
    ["fractional generation", { key: { renderGeneration: 1.5 } }],
    ["wrong page", { key: { pageIndex: 1 } }],
    ["NaN rotation", { key: { rotation: Number.NaN } }],
    ["invalid transform", { key: { viewportTransform: [1, 0, Number.POSITIVE_INFINITY, 1, 0, 0] } }],
    ["fractional canvas dimension", { key: { canvasWidth: 999.5 } }],
    ["negative viewport", { key: { viewportWidth: -1 } }],
    ["NaN scan", { scanDurationMs: Number.NaN }],
    ["negative scan", { scanDurationMs: -1 }],
    ["zero boxes", { boxes: [] }],
  ])("rejects %s metadata without a partial list", (_name, overrides) => {
    const result = mapSnapshot(detectionSnapshot(overrides as Parameters<typeof detectionSnapshot>[0]));
    expect(result).toMatchObject({ status: "ineligible", suggestions: [] });
  });

  it("rejects the whole snapshot when any box is invalid or carries non-geometry data", () => {
    const invalidGeometry = mapSnapshot(detectionSnapshot({
      boxes: [
        { x: 20, y: 20, width: 30, height: 30 },
        { x: 999, y: 10, width: 2, height: 10 },
      ],
    }));
    const contentBearing = mapSnapshot(detectionSnapshot({
      boxes: [{ x: 20, y: 20, width: 30, height: 30, text: "private" } as never],
    }));
    expect(invalidGeometry).toMatchObject({ status: "ineligible", suggestions: [] });
    expect(contentBearing).toMatchObject({ status: "ineligible", suggestions: [] });
  });

  it("does not mutate an immutable snapshot and produces identical IDs on retry", () => {
    const immutable = Object.freeze({
      ...detectionSnapshot(),
      key: Object.freeze(snapshotKey()),
      boxes: Object.freeze(detectionSnapshot().boxes.map((box) => Object.freeze({ ...box }))),
    });
    const before = immutable.boxes.map((box) => ({ ...box }));
    const first = mapSnapshot(immutable);
    const second = mapSnapshot(immutable);
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    if (first.status !== "ready" || second.status !== "ready") throw new Error("Expected eligible snapshot");
    expect(first.suggestions.map((item) => item.id)).toEqual(second.suggestions.map((item) => item.id));
    expect(immutable.boxes).toEqual(before);
  });

  it.each([101, 390, 1_000, 10_000])(
    "rejects %i boxes before reading or copying any box",
    (count) => {
      const boxes = new Array(count) as LocalFieldDetectionSnapshot["boxes"];
      const firstBoxRead = jest.fn(() => {
        throw new Error("box data must remain unread");
      });
      Object.defineProperty(boxes, 0, { configurable: true, get: firstBoxRead });

      const result = prepareLocalFieldDetectionSnapshot({
        key: snapshotKey(),
        scanDurationMs: 1,
        boxes,
        now: DETERMINISTIC_NOW,
      });

      expect(result).toMatchObject({ status: "ineligible", reason: "invalid-snapshot" });
      expect(firstBoxRead).not.toHaveBeenCalled();
    },
  );

  it("prepares an all-or-nothing immutable numeric snapshot without mutating detector boxes", () => {
    const boxes = Array.from({ length: LOCAL_FIELD_SUGGESTION_MAX_BOXES }, (_, index) => ({
      x: (index % 10) * 50,
      y: Math.floor(index / 10) * 50,
      width: 20,
      height: 20,
      area: 400,
    }));
    const before = boxes.map((box) => ({ ...box }));
    const result = prepareLocalFieldDetectionSnapshot({
      key: snapshotKey(),
      scanDurationMs: 1,
      boxes,
      now: DETERMINISTIC_NOW,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected eligible snapshot");
    expect(result.snapshot.boxes).toEqual(before.map(({ x, y, width, height }) => ({ x, y, width, height })));
    expect(result.snapshot.boxes).not.toBe(boxes);
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.key)).toBe(true);
    expect(Object.isFrozen(result.snapshot.key.viewportTransform)).toBe(true);
    expect(result.snapshot.boxes.every(Object.isFrozen)).toBe(true);
    expect(boxes).toEqual(before);
    expect(Object.isFrozen(boxes)).toBe(false);
  });

  it("fails closed when an in-cap detector box throws while geometry is read", () => {
    const boxes = [{ x: 10, y: 10, width: 20, height: 20 }];
    Object.defineProperty(boxes[0], "width", {
      configurable: true,
      get: () => { throw new Error("malformed geometry getter"); },
    });

    expect(prepareLocalFieldDetectionSnapshot({
      key: snapshotKey(),
      scanDurationMs: 1,
      boxes,
      now: DETERMINISTIC_NOW,
    })).toMatchObject({ status: "ineligible", reason: "invalid-snapshot" });
  });

  it("rejects malformed in-cap input without returning a partial copy", () => {
    const result = prepareLocalFieldDetectionSnapshot({
      key: snapshotKey(),
      scanDurationMs: 1,
      boxes: [
        { x: 10, y: 10, width: 20, height: 20 },
        { x: 30, y: 30, width: Number.NaN, height: 20 },
        { x: 50, y: 50, width: 20, height: 20 },
      ],
      now: DETERMINISTIC_NOW,
    });

    expect(result).toEqual(expect.objectContaining({
      status: "ineligible",
      reason: "invalid-snapshot",
    }));
    expect("snapshot" in result).toBe(false);
  });

  it.each([
    [LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS, true],
    [LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS + 0.001, false],
  ])("applies the exact snapshot-preparation budget %f ms", (duration, eligible) => {
    const times = [0, duration];
    const result = prepareLocalFieldDetectionSnapshot({
      key: snapshotKey(),
      scanDurationMs: 1,
      boxes: [{ x: 10, y: 10, width: 20, height: 20 }],
      now: () => times.shift() ?? duration,
    });

    expect(result.status === "ready").toBe(eligible);
    expect(result.snapshotPreparationDurationMs).toBe(duration);
    if (!eligible) expect(result).toMatchObject({ reason: "incremental-budget-exceeded" });
  });
});

function lifecycleEvent(
  status: LocalFieldDetectionLifecycleEvent["status"],
  key: LocalFieldDetectionSnapshotKey,
): LocalFieldDetectionLifecycleEvent {
  if (status === "started") return { status, key, scanDurationMs: null };
  if (status === "cancelled") return { status, key, scanDurationMs: null };
  if (status === "failed") return { status, key, scanDurationMs: null, reason: "render-failed" };
  const snapshot = detectionSnapshot({ key });
  return {
    status,
    key,
    scanDurationMs: snapshot.scanDurationMs,
    snapshotPreparationDurationMs: 0,
    snapshot,
  };
}

describe("keyed local detection lifecycle", () => {
  it.each(["ready", "failed", "cancelled"] as const)("keeps B when A later reports %s", (lateStatus) => {
    const a = snapshotKey({ renderGeneration: 1 });
    const b = snapshotKey({ renderGeneration: 2 });
    let state: LocalFieldDetectionLifecycleEvent | null = null;
    state = reduceLocalFieldDetectionLifecycle(state, lifecycleEvent("started", a), 1);
    state = reduceLocalFieldDetectionLifecycle(state, lifecycleEvent("started", b), 1);
    state = reduceLocalFieldDetectionLifecycle(state, lifecycleEvent("ready", b), 1);
    state = reduceLocalFieldDetectionLifecycle(state, lifecycleEvent(lateStatus, a), 1);
    expect(state?.status).toBe("ready");
    expect(state?.key).toBe(b);
  });

  it("orders same-sized replacement, A-B-A, pages, rotation, viewport, and viewer instances by full identity", () => {
    const identities = [
      snapshotKey({ documentRevision: 1, viewerInstanceId: 1, renderGeneration: 1 }),
      snapshotKey({ documentRevision: 2, viewerInstanceId: 1, renderGeneration: 1 }),
      snapshotKey({ documentRevision: 3, viewerInstanceId: 1, renderGeneration: 1 }),
      snapshotKey({ documentRevision: 3, viewerInstanceId: 1, renderGeneration: 2, pageIndex: 1 }),
      snapshotKey({ documentRevision: 3, viewerInstanceId: 1, renderGeneration: 3, pageIndex: 0 }),
      snapshotKey({ documentRevision: 3, viewerInstanceId: 1, renderGeneration: 4, rotation: 90 }),
      snapshotKey({ documentRevision: 3, viewerInstanceId: 1, renderGeneration: 5, renderedViewportWidth: 900 }),
      snapshotKey({ documentRevision: 3, viewerInstanceId: 2, renderGeneration: 1 }),
    ];
    let state: LocalFieldDetectionLifecycleEvent | null = null;
    for (const identity of identities) {
      state = reduceLocalFieldDetectionLifecycle(state, lifecycleEvent("started", identity), identity.documentRevision);
    }
    expect(state?.key).toBe(identities.at(-1));
    expect(localFieldDetectionSnapshotKeysEqual(identities[0], identities[1])).toBe(false);
    expect(localFieldDetectionSnapshotKeysEqual(identities[3], identities[4])).toBe(false);
    expect(localFieldDetectionSnapshotKeysEqual(identities[5], identities[6])).toBe(false);
  });

  it("ignores a late start for a settled key and lets same-key cancellation release ready data", () => {
    const key = snapshotKey();
    const ready = lifecycleEvent("ready", key);
    expect(reduceLocalFieldDetectionLifecycle(ready, lifecycleEvent("started", key), 1)).toBe(ready);
    expect(reduceLocalFieldDetectionLifecycle(ready, lifecycleEvent("cancelled", key), 1)?.status).toBe("cancelled");
  });
});

describe("field suggestion rollout and one-shot intent", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("defaults off and enables only the exact source-backed mode", () => {
    expect(fieldSuggestionRolloutModeFromFlag(undefined)).toBe("off");
    expect(fieldSuggestionRolloutModeFromFlag("true")).toBe("off");
    expect(fieldSuggestionRolloutModeFromFlag("local-review")).toBe("local-review");
    expect(isFieldSuggestionReviewEnabled(undefined)).toBe(false);
    expect(isFieldSuggestionReviewEnabled("local-review")).toBe(true);
  });

  it("stores no content, uses session storage only, and consumes a matching intent once", () => {
    expect(storeFieldSuggestionIntent(DOCUMENT_REVISION)).toBe(true);
    const raw = sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY);
    expect(raw).toContain(DOCUMENT_REVISION);
    expect(raw).not.toContain("image");
    expect(raw).not.toContain("documentBytes");
    expect(localStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();

    expect(consumeFieldSuggestionIntent(DOCUMENT_REVISION)).toMatchObject({
      version: 1,
      documentRevision: DOCUMENT_REVISION,
      pageIndex: 0,
    });
    expect(consumeFieldSuggestionIntent(DOCUMENT_REVISION)).toBeNull();
  });

  it("rejects and clears a stale intent", () => {
    storeFieldSuggestionIntent(DOCUMENT_REVISION);
    expect(consumeFieldSuggestionIntent(OTHER_DOCUMENT_REVISION)).toBeNull();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
    clearFieldSuggestionIntent();
  });
});
