import {
  FIELD_SUGGESTION_SCHEMA_VERSION,
  createFieldSuggestionId,
  validateFieldSuggestions,
  type FieldSuggestion,
  type FieldSuggestionBounds,
  type SuggestedFieldType,
} from "./field-suggestions";

export const LOCAL_FIELD_SUGGESTION_MAX_PIXELS = 1_200_000;
export const LOCAL_FIELD_SUGGESTION_MAX_SCAN_MS = 50;
export const LOCAL_FIELD_SUGGESTION_MAX_BOXES = 100;
export const LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS = 10;
export const LOCAL_FIELD_SUGGESTION_MAX_MAPPING_MS = LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS;

interface Dimensions {
  width: number;
  height: number;
}

export interface LocalFieldDetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocalFieldDetectionSnapshotKey {
  documentRevision: number;
  viewerInstanceId: number;
  renderGeneration: number;
  pageIndex: number;
  rotation: number;
  viewportTransform: readonly [number, number, number, number, number, number];
  canvasWidth: number;
  canvasHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  renderedViewportWidth: number;
  renderedViewportHeight: number;
}

export interface LocalFieldDetectionSnapshot {
  key: Readonly<LocalFieldDetectionSnapshotKey>;
  scanDurationMs: number;
  boxes: readonly Readonly<LocalFieldDetectionBox>[];
}

export type LocalFieldDetectionFailureReason =
  | "render-failed"
  | "missing-canvas"
  | "missing-canvas-context"
  | "detector-failed"
  | "ineligible-metadata";

export type LocalFieldDetectionLifecycleEvent =
  | {
      status: "started";
      key: Readonly<LocalFieldDetectionSnapshotKey>;
      scanDurationMs: null;
    }
  | {
      status: "ready";
      key: Readonly<LocalFieldDetectionSnapshotKey>;
      scanDurationMs: number;
      snapshotPreparationDurationMs: number;
      snapshot: Readonly<LocalFieldDetectionSnapshot>;
    }
  | {
      status: "failed";
      key: Readonly<LocalFieldDetectionSnapshotKey>;
      scanDurationMs: number | null;
      reason: LocalFieldDetectionFailureReason;
    }
  | {
      status: "cancelled";
      key: Readonly<LocalFieldDetectionSnapshotKey>;
      scanDurationMs: number | null;
    };

export interface LocalFieldSuggestionRequest {
  snapshot: Readonly<LocalFieldDetectionSnapshot>;
  documentRevision: string;
  expectedDocumentRevision: number;
  incrementalDurationMs: number;
  now?: () => number;
}

export type LocalFieldSuggestionIneligibleReason =
  | "invalid-snapshot"
  | "incremental-budget-exceeded";

export type LocalFieldSuggestionResult =
  | {
      status: "ready";
      suggestions: FieldSuggestion[];
      mappingDurationMs: number;
      incrementalDurationMs: number;
    }
  | {
      status: "ineligible";
      suggestions: [];
      mappingDurationMs: number;
      incrementalDurationMs: number;
      reason: LocalFieldSuggestionIneligibleReason;
    };

export type LocalFieldDetectionSnapshotPreparationResult =
  | {
      status: "ready";
      snapshot: Readonly<LocalFieldDetectionSnapshot>;
      snapshotPreparationDurationMs: number;
    }
  | {
      status: "ineligible";
      snapshotPreparationDurationMs: number;
      reason: LocalFieldSuggestionIneligibleReason;
    };

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasFiniteGeometry(box: Readonly<LocalFieldDetectionBox>): boolean {
  if (!box || typeof box !== "object") return false;
  return [box.x, box.y, box.width, box.height].every(Number.isFinite);
}

function hasOnlyNumericGeometry(box: Readonly<LocalFieldDetectionBox>): boolean {
  if (!hasFiniteGeometry(box)) return false;
  const keys = Object.keys(box).sort();
  if (keys.length !== 4 || keys.join(",") !== "height,width,x,y") return false;
  return true;
}

function hasValidSnapshotKey(key: Readonly<LocalFieldDetectionSnapshotKey>): boolean {
  return Boolean(
    key &&
    typeof key === "object" &&
    isPositiveInteger(key.documentRevision) &&
    isPositiveInteger(key.viewerInstanceId) &&
    isPositiveInteger(key.renderGeneration) &&
    isNonNegativeInteger(key.pageIndex) &&
    key.pageIndex === 0 &&
    Number.isSafeInteger(key.rotation) &&
    Array.isArray(key.viewportTransform) &&
    key.viewportTransform.length === 6 &&
    key.viewportTransform.every(Number.isFinite) &&
    isPositiveInteger(key.canvasWidth) &&
    isPositiveInteger(key.canvasHeight) &&
    isPositiveFinite(key.viewportWidth) &&
    isPositiveFinite(key.viewportHeight) &&
    isPositiveFinite(key.renderedViewportWidth) &&
    isPositiveFinite(key.renderedViewportHeight)
  );
}

function isUsableBox(
  box: Readonly<LocalFieldDetectionBox>,
  canvas: Dimensions,
  requireOnlyGeometry = true,
): boolean {
  return (
    (requireOnlyGeometry ? hasOnlyNumericGeometry(box) : hasFiniteGeometry(box)) &&
    isPositiveFinite(box.width) &&
    isPositiveFinite(box.height) &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= canvas.width &&
    box.y + box.height <= canvas.height
  );
}

export function renderedCanvasBoxToPageBounds(
  box: Readonly<LocalFieldDetectionBox>,
  canvas: Dimensions,
  viewport: Dimensions,
): FieldSuggestionBounds | null {
  if (![canvas.width, canvas.height, viewport.width, viewport.height].every(isPositiveFinite)) return null;
  if (!isUsableBox(box, canvas)) return null;

  const scaleX = canvas.width / viewport.width;
  const scaleY = canvas.height / viewport.height;
  if (!isPositiveFinite(scaleX) || !isPositiveFinite(scaleY)) return null;

  return {
    x: box.x / scaleX,
    y: box.y / scaleY,
    width: box.width / scaleX,
    height: box.height / scaleY,
  };
}

function suggestedType(bounds: FieldSuggestionBounds): SuggestedFieldType {
  const aspectRatio = bounds.width / bounds.height;
  const largestSide = Math.max(bounds.width, bounds.height);
  return aspectRatio >= 0.75 && aspectRatio <= 1.33 && largestSide <= 36 ? "checkbox" : "text";
}

export function localFieldDetectionSnapshotKeysEqual(
  first: Readonly<LocalFieldDetectionSnapshotKey> | null | undefined,
  second: Readonly<LocalFieldDetectionSnapshotKey> | null | undefined,
): boolean {
  if (!first || !second) return false;
  return (
    first.documentRevision === second.documentRevision &&
    first.viewerInstanceId === second.viewerInstanceId &&
    first.renderGeneration === second.renderGeneration &&
    first.pageIndex === second.pageIndex &&
    first.rotation === second.rotation &&
    first.canvasWidth === second.canvasWidth &&
    first.canvasHeight === second.canvasHeight &&
    first.viewportWidth === second.viewportWidth &&
    first.viewportHeight === second.viewportHeight &&
    first.renderedViewportWidth === second.renderedViewportWidth &&
    first.renderedViewportHeight === second.renderedViewportHeight &&
    first.viewportTransform.length === second.viewportTransform.length &&
    first.viewportTransform.every((value, index) => value === second.viewportTransform[index])
  );
}

function compareSnapshotKeys(
  first: Readonly<LocalFieldDetectionSnapshotKey>,
  second: Readonly<LocalFieldDetectionSnapshotKey>,
): number {
  const orderedFields: Array<keyof Pick<
    LocalFieldDetectionSnapshotKey,
    "documentRevision" | "viewerInstanceId" | "renderGeneration"
  >> = ["documentRevision", "viewerInstanceId", "renderGeneration"];
  for (const field of orderedFields) {
    if (first[field] !== second[field]) return first[field] - second[field];
  }
  return 0;
}

function lifecycleRank(status: LocalFieldDetectionLifecycleEvent["status"]): number {
  if (status === "started") return 0;
  if (status === "cancelled") return 2;
  return 1;
}

export function reduceLocalFieldDetectionLifecycle(
  current: LocalFieldDetectionLifecycleEvent | null,
  incoming: LocalFieldDetectionLifecycleEvent,
  activeDocumentRevision: number | null,
): LocalFieldDetectionLifecycleEvent | null {
  if (activeDocumentRevision === null || incoming.key.documentRevision !== activeDocumentRevision) {
    return current;
  }
  if (!current) return incoming;

  const keyOrder = compareSnapshotKeys(incoming.key, current.key);
  if (keyOrder < 0) return current;
  if (keyOrder > 0) return incoming;
  if (!localFieldDetectionSnapshotKeysEqual(incoming.key, current.key)) return current;
  return lifecycleRank(incoming.status) > lifecycleRank(current.status) ? incoming : current;
}

function hasValidSnapshotMetadata(
  snapshot: Readonly<LocalFieldDetectionSnapshot>,
  expectedDocumentRevision: number,
): boolean {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.key || !Array.isArray(snapshot.boxes)) return false;
  const { key } = snapshot;
  if (
    !isPositiveInteger(expectedDocumentRevision) ||
    key.documentRevision !== expectedDocumentRevision ||
    !hasValidSnapshotKey(key)
  ) {
    return false;
  }

  const pixelCount = key.canvasWidth * key.canvasHeight;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > LOCAL_FIELD_SUGGESTION_MAX_PIXELS) return false;
  if (!Number.isFinite(snapshot.scanDurationMs) || snapshot.scanDurationMs < 0 || snapshot.scanDurationMs > LOCAL_FIELD_SUGGESTION_MAX_SCAN_MS) {
    return false;
  }
  if (!isPositiveInteger(snapshot.boxes.length) || snapshot.boxes.length > LOCAL_FIELD_SUGGESTION_MAX_BOXES) return false;
  return snapshot.boxes.every((box) => hasOnlyNumericGeometry(box));
}

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function prepareLocalFieldDetectionSnapshot(input: {
  key: Readonly<LocalFieldDetectionSnapshotKey>;
  scanDurationMs: number;
  boxes: readonly Readonly<LocalFieldDetectionBox>[];
  now?: () => number;
}): LocalFieldDetectionSnapshotPreparationResult {
  const now = input.now ?? monotonicNow;
  const startedAt = now();
  const finishIneligible = (
    reason: LocalFieldSuggestionIneligibleReason,
  ): LocalFieldDetectionSnapshotPreparationResult => {
    const duration = now() - startedAt;
    return {
      status: "ineligible",
      snapshotPreparationDurationMs:
        Number.isFinite(duration) && duration >= 0 ? duration : Number.POSITIVE_INFINITY,
      reason,
    };
  };

  // Count is deliberately checked before any per-box validation or copying.
  if (
    !Array.isArray(input.boxes) ||
    !isPositiveInteger(input.boxes.length) ||
    input.boxes.length > LOCAL_FIELD_SUGGESTION_MAX_BOXES
  ) {
    return finishIneligible("invalid-snapshot");
  }
  if (!hasValidSnapshotKey(input.key)) return finishIneligible("invalid-snapshot");

  const pixelCount = input.key.canvasWidth * input.key.canvasHeight;
  if (
    !Number.isSafeInteger(pixelCount) ||
    pixelCount > LOCAL_FIELD_SUGGESTION_MAX_PIXELS ||
    !Number.isFinite(input.scanDurationMs) ||
    input.scanDurationMs < 0 ||
    input.scanDurationMs > LOCAL_FIELD_SUGGESTION_MAX_SCAN_MS
  ) {
    return finishIneligible("invalid-snapshot");
  }

  const canvas = { width: input.key.canvasWidth, height: input.key.canvasHeight };
  const copiedBoxes: Readonly<LocalFieldDetectionBox>[] = [];
  try {
    for (const box of input.boxes) {
      if (!isUsableBox(box, canvas, false)) return finishIneligible("invalid-snapshot");
      copiedBoxes.push(Object.freeze({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }));
    }
  } catch {
    return finishIneligible("invalid-snapshot");
  }

  const copiedKey = Object.freeze({
    ...input.key,
    viewportTransform: Object.freeze([...input.key.viewportTransform]) as Readonly<[
      number,
      number,
      number,
      number,
      number,
      number,
    ]>,
  });
  const snapshot = Object.freeze({
    key: copiedKey,
    scanDurationMs: input.scanDurationMs,
    boxes: Object.freeze(copiedBoxes),
  });
  const snapshotPreparationDurationMs = now() - startedAt;
  if (
    !Number.isFinite(snapshotPreparationDurationMs) ||
    snapshotPreparationDurationMs < 0 ||
    snapshotPreparationDurationMs > LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS
  ) {
    return {
      status: "ineligible",
      snapshotPreparationDurationMs:
        Number.isFinite(snapshotPreparationDurationMs) && snapshotPreparationDurationMs >= 0
          ? snapshotPreparationDurationMs
          : Number.POSITIVE_INFINITY,
      reason: "incremental-budget-exceeded",
    };
  }

  return { status: "ready", snapshot, snapshotPreparationDurationMs };
}

export function mapLocalFieldSuggestions(request: LocalFieldSuggestionRequest): LocalFieldSuggestionResult {
  const now = request.now ?? monotonicNow;
  const startedAt = now();
  const finishIneligible = (reason: LocalFieldSuggestionIneligibleReason): LocalFieldSuggestionResult => {
    const mappingDurationMs = now() - startedAt;
    const incrementalDurationMs = request.incrementalDurationMs + mappingDurationMs;
    return {
      status: "ineligible",
      suggestions: [],
      mappingDurationMs:
        Number.isFinite(mappingDurationMs) && mappingDurationMs >= 0
          ? mappingDurationMs
          : Number.POSITIVE_INFINITY,
      incrementalDurationMs:
        Number.isFinite(incrementalDurationMs) && incrementalDurationMs >= 0
          ? incrementalDurationMs
          : Number.POSITIVE_INFINITY,
      reason,
    };
  };

  if (!Number.isFinite(request.incrementalDurationMs) || request.incrementalDurationMs < 0) {
    return finishIneligible("invalid-snapshot");
  }
  if (request.incrementalDurationMs > LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS) {
    return finishIneligible("incremental-budget-exceeded");
  }
  if (!hasValidSnapshotMetadata(request.snapshot, request.expectedDocumentRevision)) {
    return finishIneligible("invalid-snapshot");
  }

  const { key, boxes } = request.snapshot;
  const canvas = { width: key.canvasWidth, height: key.canvasHeight };
  const viewport = { width: key.viewportWidth, height: key.viewportHeight };
  const rawSuggestions: FieldSuggestion[] = [];

  for (const box of boxes) {
    const boundingBox = renderedCanvasBoxToPageBounds(box, canvas, viewport);
    if (!boundingBox) return finishIneligible("invalid-snapshot");
    const type = suggestedType(boundingBox);
    rawSuggestions.push({
      schemaVersion: FIELD_SUGGESTION_SCHEMA_VERSION,
      id: createFieldSuggestionId({
        documentRevision: request.documentRevision,
        pageIndex: key.pageIndex,
        boundingBox,
      }),
      documentRevision: request.documentRevision,
      type,
      pageIndex: key.pageIndex,
      boundingBox,
      coordinateSpace: {
        unit: "pdf-point",
        origin: "top-left",
        pageWidth: key.viewportWidth,
        pageHeight: key.viewportHeight,
      },
      confidence: type === "checkbox" ? 0.72 : 0.58,
      metadata: {
        category: "visual-box",
        reasoning: type === "checkbox" ? "small-square-boundary" : "rectangular-entry-boundary",
      },
    });
  }

  const suggestions = validateFieldSuggestions(rawSuggestions, {
    documentRevision: request.documentRevision,
    pageIndex: key.pageIndex,
    pageWidth: key.viewportWidth,
    pageHeight: key.viewportHeight,
  });
  if (suggestions.length !== rawSuggestions.length) return finishIneligible("invalid-snapshot");

  const mappingDurationMs = now() - startedAt;
  const incrementalDurationMs = request.incrementalDurationMs + mappingDurationMs;
  if (
    !Number.isFinite(mappingDurationMs) ||
    mappingDurationMs < 0 ||
    !Number.isFinite(incrementalDurationMs) ||
    incrementalDurationMs < 0 ||
    incrementalDurationMs > LOCAL_FIELD_SUGGESTION_MAX_INCREMENTAL_MS
  ) {
    return {
      status: "ineligible",
      suggestions: [],
      mappingDurationMs: Number.isFinite(mappingDurationMs) && mappingDurationMs >= 0
        ? mappingDurationMs
        : Number.POSITIVE_INFINITY,
      incrementalDurationMs:
        Number.isFinite(incrementalDurationMs) && incrementalDurationMs >= 0
          ? incrementalDurationMs
          : Number.POSITIVE_INFINITY,
      reason: "incremental-budget-exceeded",
    };
  }

  return { status: "ready", suggestions, mappingDurationMs, incrementalDurationMs };
}
