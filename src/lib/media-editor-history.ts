import type {
  LocalMediaAssetId,
  MediaOverlayState,
  MediaPlacement,
  MediaTransform,
} from "./media-types";
import {
  assertValidMediaPlacement,
  assertValidMediaTransform,
  normalizeMediaRotation,
} from "./media-transform";

export const MEDIA_EDITOR_MAX_HISTORY = 50;

export interface MediaEditorHistoryState {
  readonly past: readonly (readonly Readonly<MediaOverlayState>[])[];
  readonly present: readonly Readonly<MediaOverlayState>[];
  readonly future: readonly (readonly Readonly<MediaOverlayState>[])[];
  readonly selectedAssetId: LocalMediaAssetId | null;
}

export type MediaEditorHistoryAction =
  | { readonly type: "ADD"; readonly overlay: Readonly<MediaOverlayState> }
  | { readonly type: "COMMIT"; readonly overlay: Readonly<MediaOverlayState> }
  | { readonly type: "DELETE"; readonly assetId: LocalMediaAssetId }
  | { readonly type: "SELECT"; readonly assetId: LocalMediaAssetId | null }
  | { readonly type: "UNDO" }
  | { readonly type: "REDO" }
  | { readonly type: "RESET" };

function freezePlacement(value: Readonly<MediaPlacement>): Readonly<MediaPlacement> {
  assertValidMediaPlacement(value);
  return Object.freeze({
    pageIndex: value.pageIndex,
    xPts: value.xPts === 0 ? 0 : value.xPts,
    yPts: value.yPts === 0 ? 0 : value.yPts,
    widthPts: value.widthPts,
    heightPts: value.heightPts,
  });
}

function freezeTransform(value: Readonly<MediaTransform>): Readonly<MediaTransform> {
  assertValidMediaTransform(value);
  return Object.freeze({
    rotationDeg: normalizeMediaRotation(value.rotationDeg),
    flipX: value.flipX,
    flipY: value.flipY,
  });
}

export function freezeMediaOverlay(
  value: Readonly<MediaOverlayState>,
): Readonly<MediaOverlayState> {
  if (!value || typeof value !== "object" || typeof value.assetId !== "string") {
    throw new TypeError("media overlay is invalid");
  }
  return Object.freeze({
    assetId: value.assetId,
    placement: freezePlacement(value.placement),
    transform: freezeTransform(value.transform),
  });
}

function freezeSnapshot(
  overlays: readonly Readonly<MediaOverlayState>[],
): readonly Readonly<MediaOverlayState>[] {
  const seen = new Set<LocalMediaAssetId>();
  const snapshot = overlays.map((overlay) => {
    const frozen = freezeMediaOverlay(overlay);
    if (seen.has(frozen.assetId)) {
      throw new Error("media overlay asset ids must be unique");
    }
    seen.add(frozen.assetId);
    return frozen;
  });
  return Object.freeze(snapshot);
}

export function createMediaEditorHistoryState(): MediaEditorHistoryState {
  return Object.freeze({
    past: Object.freeze([]),
    present: Object.freeze([]),
    future: Object.freeze([]),
    selectedAssetId: null,
  });
}

function overlayEqual(
  left: Readonly<MediaOverlayState>,
  right: Readonly<MediaOverlayState>,
): boolean {
  return (
    left.assetId === right.assetId &&
    left.placement.pageIndex === right.placement.pageIndex &&
    left.placement.xPts === right.placement.xPts &&
    left.placement.yPts === right.placement.yPts &&
    left.placement.widthPts === right.placement.widthPts &&
    left.placement.heightPts === right.placement.heightPts &&
    left.transform.rotationDeg === right.transform.rotationDeg &&
    left.transform.flipX === right.transform.flipX &&
    left.transform.flipY === right.transform.flipY
  );
}

function snapshotsEqual(
  left: readonly Readonly<MediaOverlayState>[],
  right: readonly Readonly<MediaOverlayState>[],
): boolean {
  return (
    left.length === right.length &&
    left.every((overlay, index) => overlayEqual(overlay, right[index]))
  );
}

function snapshotHas(
  snapshot: readonly Readonly<MediaOverlayState>[],
  assetId: LocalMediaAssetId | null,
): assetId is LocalMediaAssetId {
  return Boolean(assetId && snapshot.some((overlay) => overlay.assetId === assetId));
}

function appendToSnapshot(
  snapshot: readonly Readonly<MediaOverlayState>[],
  overlay: Readonly<MediaOverlayState>,
): readonly Readonly<MediaOverlayState>[] {
  if (snapshot.some((candidate) => candidate.assetId === overlay.assetId)) {
    throw new Error("media overlay asset id already exists");
  }
  return freezeSnapshot([...snapshot, overlay]);
}

function removeFromSnapshot(
  snapshot: readonly Readonly<MediaOverlayState>[],
  assetId: LocalMediaAssetId,
): readonly Readonly<MediaOverlayState>[] {
  return freezeSnapshot(snapshot.filter((overlay) => overlay.assetId !== assetId));
}

function boundedPast(
  past: readonly (readonly Readonly<MediaOverlayState>[])[],
  snapshot: readonly Readonly<MediaOverlayState>[],
): readonly (readonly Readonly<MediaOverlayState>[])[] {
  const next = [...past, snapshot];
  return Object.freeze(
    next.length > MEDIA_EDITOR_MAX_HISTORY
      ? next.slice(next.length - MEDIA_EDITOR_MAX_HISTORY)
      : next,
  );
}

function compactPast(
  past: readonly (readonly Readonly<MediaOverlayState>[])[],
  present: readonly Readonly<MediaOverlayState>[],
): readonly (readonly Readonly<MediaOverlayState>[])[] {
  const compacted: (readonly Readonly<MediaOverlayState>[])[] = [];
  for (const snapshot of past) {
    if (
      compacted.length === 0 ||
      !snapshotsEqual(compacted[compacted.length - 1], snapshot)
    ) {
      compacted.push(snapshot);
    }
  }
  while (
    compacted.length > 0 &&
    snapshotsEqual(compacted[compacted.length - 1], present)
  ) {
    compacted.pop();
  }
  return Object.freeze(compacted);
}

function compactFuture(
  future: readonly (readonly Readonly<MediaOverlayState>[])[],
  present: readonly Readonly<MediaOverlayState>[],
): readonly (readonly Readonly<MediaOverlayState>[])[] {
  const chronological: (readonly Readonly<MediaOverlayState>[])[] = [];
  let previous = present;
  for (let index = future.length - 1; index >= 0; index -= 1) {
    const snapshot = future[index];
    if (!snapshotsEqual(previous, snapshot)) {
      chronological.push(snapshot);
      previous = snapshot;
    }
  }
  return Object.freeze(chronological.reverse());
}

export function mediaEditorHistoryReducer(
  state: MediaEditorHistoryState,
  action: MediaEditorHistoryAction,
): MediaEditorHistoryState {
  switch (action.type) {
    case "ADD": {
      const overlay = freezeMediaOverlay(action.overlay);
      return Object.freeze({
        past: Object.freeze(state.past.map((snapshot) => appendToSnapshot(snapshot, overlay))),
        present: appendToSnapshot(state.present, overlay),
        future: Object.freeze([]),
        selectedAssetId: overlay.assetId,
      });
    }
    case "COMMIT": {
      const overlay = freezeMediaOverlay(action.overlay);
      const index = state.present.findIndex(
        (candidate) => candidate.assetId === overlay.assetId,
      );
      if (index < 0) return state;
      if (overlayEqual(state.present[index], overlay)) {
        return state.selectedAssetId === overlay.assetId
          ? state
          : Object.freeze({ ...state, selectedAssetId: overlay.assetId });
      }
      const next = [...state.present];
      next[index] = overlay;
      return Object.freeze({
        past: boundedPast(state.past, state.present),
        present: freezeSnapshot(next),
        future: Object.freeze([]),
        selectedAssetId: overlay.assetId,
      });
    }
    case "DELETE": {
      if (!state.present.some((overlay) => overlay.assetId === action.assetId)) {
        return state;
      }
      // Deletion is terminal for the asset so its Blob/object URL can be
      // released immediately. Remove it from every reachable history frame
      // and compact frames that became identical so Undo/Redo remains visible.
      const present = removeFromSnapshot(state.present, action.assetId);
      const past = state.past.map((snapshot) =>
        removeFromSnapshot(snapshot, action.assetId),
      );
      const future = state.future.map((snapshot) =>
        removeFromSnapshot(snapshot, action.assetId),
      );
      return Object.freeze({
        past: compactPast(past, present),
        present,
        future: compactFuture(future, present),
        selectedAssetId:
          state.selectedAssetId === action.assetId ? null : state.selectedAssetId,
      });
    }
    case "SELECT":
      if (action.assetId !== null && !snapshotHas(state.present, action.assetId)) {
        return state;
      }
      return state.selectedAssetId === action.assetId
        ? state
        : Object.freeze({ ...state, selectedAssetId: action.assetId });
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return Object.freeze({
        past: Object.freeze(state.past.slice(0, -1)),
        present: previous,
        future: Object.freeze([...state.future, state.present]),
        selectedAssetId: snapshotHas(previous, state.selectedAssetId)
          ? state.selectedAssetId
          : null,
      });
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[state.future.length - 1];
      return Object.freeze({
        past: boundedPast(state.past, state.present),
        present: next,
        future: Object.freeze(state.future.slice(0, -1)),
        selectedAssetId: snapshotHas(next, state.selectedAssetId)
          ? state.selectedAssetId
          : null,
      });
    }
    case "RESET":
      return createMediaEditorHistoryState();
  }
}
