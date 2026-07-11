/**
 * Pure gesture math for the mobile/tablet editor viewport (PR #94):
 * pinch zoom, two-finger pan, and post-commit scroll anchoring.
 *
 * Kept free of DOM/React so every branch is unit-testable.
 */

export interface GesturePoint {
  x: number;
  y: number;
}

/** Zoom bounds for gesture-driven zoom (percent). */
export const GESTURE_ZOOM_MIN = 50;
export const GESTURE_ZOOM_MAX = 200;

/**
 * How long after a two-finger gesture ends that single-finger taps are
 * ignored, so lifting the fingers never places a field.
 */
export const GESTURE_PLACEMENT_SUPPRESS_MS = 500;

export function touchDistance(a: GesturePoint, b: GesturePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function touchMidpoint(a: GesturePoint, b: GesturePoint): GesturePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clampGestureZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return GESTURE_ZOOM_MIN;
  return Math.min(GESTURE_ZOOM_MAX, Math.max(GESTURE_ZOOM_MIN, zoom));
}

/**
 * Continuous zoom value for an in-progress pinch (clamped, not rounded).
 * `startZoom` is the committed zoom when the gesture began.
 */
export function gestureZoom(
  startZoom: number,
  startDistance: number,
  currentDistance: number
): number {
  if (startDistance <= 0 || currentDistance <= 0) {
    return clampGestureZoom(startZoom);
  }
  return clampGestureZoom(startZoom * (currentDistance / startDistance));
}

/** Final zoom committed when the pinch ends (rounded and clamped). */
export function commitGestureZoom(
  startZoom: number,
  startDistance: number,
  endDistance: number
): number {
  return Math.round(gestureZoom(startZoom, startDistance, endDistance));
}

export interface TouchPlacementGuardArgs {
  /** True while a two-finger gesture is active. */
  gestureActive: boolean;
  /** `event.touches.length` at touchend (fingers still on screen). */
  remainingTouches: number;
  /** `event.changedTouches.length` at touchend. */
  changedTouches: number;
  /** Current timestamp (ms). */
  now: number;
  /** Timestamp (ms) when the last two-finger gesture ended. */
  lastGestureEndAt: number;
}

/**
 * Decides whether a touchend must NOT place/select a field.
 * Single-finger taps stay fully functional outside gestures.
 */
export function shouldSuppressTouchPlacement(args: TouchPlacementGuardArgs): boolean {
  if (args.gestureActive) return true;
  if (args.remainingTouches !== 0) return true;
  if (args.changedTouches !== 1) return true;
  return args.now - args.lastGestureEndAt < GESTURE_PLACEMENT_SUPPRESS_MS;
}

export interface AnchoredScrollArgs {
  /** Page wrapper offsets inside the scrollable content, AFTER the re-render. */
  pageOffsetLeft: number;
  pageOffsetTop: number;
  /** Anchor point in page-local pixels, measured BEFORE the zoom commit. */
  pageLocalX: number;
  pageLocalY: number;
  /** newZoom / oldZoom */
  ratio: number;
  /** Gesture midpoint relative to the scroll viewport client box. */
  midX: number;
  midY: number;
}

/**
 * Scroll position that keeps the content under the pinch midpoint in place
 * after the page re-renders at the committed zoom. Values are clamped to be
 * non-negative; the browser clamps the upper bound on assignment.
 */
export function anchoredScrollPosition(args: AnchoredScrollArgs): {
  scrollLeft: number;
  scrollTop: number;
} {
  return {
    scrollLeft: Math.max(0, args.pageOffsetLeft + args.pageLocalX * args.ratio - args.midX),
    scrollTop: Math.max(0, args.pageOffsetTop + args.pageLocalY * args.ratio - args.midY),
  };
}
