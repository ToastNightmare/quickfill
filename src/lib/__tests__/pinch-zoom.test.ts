import {
  GESTURE_PLACEMENT_SUPPRESS_MS,
  GESTURE_ZOOM_MAX,
  GESTURE_ZOOM_MIN,
  anchoredScrollPosition,
  clampGestureZoom,
  commitGestureZoom,
  gestureZoom,
  shouldSuppressTouchPlacement,
  touchDistance,
  touchMidpoint,
} from "../pinch-zoom";

// PR #94: pinch zoom + two-finger pan gesture math.

describe("touchDistance", () => {
  it("measures the distance between two touch points", () => {
    expect(touchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("is symmetric and zero for identical points", () => {
    const a = { x: 12, y: 40 };
    const b = { x: 90, y: 7 };
    expect(touchDistance(a, b)).toBeCloseTo(touchDistance(b, a));
    expect(touchDistance(a, a)).toBe(0);
  });
});

describe("touchMidpoint", () => {
  it("returns the point halfway between two touches", () => {
    expect(touchMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it("handles negative coordinates", () => {
    expect(touchMidpoint({ x: -10, y: 6 }, { x: 10, y: -6 })).toEqual({ x: 0, y: 0 });
  });
});

describe("clampGestureZoom", () => {
  it("clamps below the minimum", () => {
    expect(clampGestureZoom(10)).toBe(GESTURE_ZOOM_MIN);
  });

  it("clamps above the maximum", () => {
    expect(clampGestureZoom(900)).toBe(GESTURE_ZOOM_MAX);
  });

  it("passes through in-range values", () => {
    expect(clampGestureZoom(137)).toBe(137);
  });

  it("falls back to the minimum for non-finite input", () => {
    expect(clampGestureZoom(Number.NaN)).toBe(GESTURE_ZOOM_MIN);
    expect(clampGestureZoom(Number.POSITIVE_INFINITY)).toBe(GESTURE_ZOOM_MAX);
    expect(clampGestureZoom(Number.NEGATIVE_INFINITY)).toBe(GESTURE_ZOOM_MIN);
  });
});

describe("gestureZoom", () => {
  it("scales zoom by the pinch distance ratio", () => {
    // Fingers spread to double the distance: 100% -> 200%
    expect(gestureZoom(100, 100, 200)).toBe(200);
    // Fingers close to half the distance: 100% -> 50%
    expect(gestureZoom(100, 100, 50)).toBe(50);
  });

  it("clamps to the 50-200 range", () => {
    expect(gestureZoom(100, 100, 500)).toBe(GESTURE_ZOOM_MAX);
    expect(gestureZoom(100, 100, 10)).toBe(GESTURE_ZOOM_MIN);
    expect(gestureZoom(150, 100, 200)).toBe(GESTURE_ZOOM_MAX);
  });

  it("returns the clamped start zoom for degenerate distances", () => {
    expect(gestureZoom(100, 0, 150)).toBe(100);
    expect(gestureZoom(100, 150, 0)).toBe(100);
    expect(gestureZoom(300, 0, 0)).toBe(GESTURE_ZOOM_MAX);
  });

  it("supports non-preset continuous values", () => {
    expect(gestureZoom(100, 100, 137)).toBeCloseTo(137);
    expect(gestureZoom(75, 120, 160)).toBeCloseTo(100);
  });
});

describe("commitGestureZoom", () => {
  it("rounds the committed zoom to an integer", () => {
    expect(commitGestureZoom(100, 100, 133)).toBe(133);
    expect(commitGestureZoom(100, 300, 400)).toBe(133);
    expect(Number.isInteger(commitGestureZoom(87, 113, 197))).toBe(true);
  });

  it("clamps the committed zoom", () => {
    expect(commitGestureZoom(100, 50, 500)).toBe(GESTURE_ZOOM_MAX);
    expect(commitGestureZoom(100, 500, 50)).toBe(GESTURE_ZOOM_MIN);
  });
});

describe("shouldSuppressTouchPlacement", () => {
  const base = {
    gestureActive: false,
    remainingTouches: 0,
    changedTouches: 1,
    now: 10_000,
    lastGestureEndAt: 0,
  };

  it("allows a normal single-finger tap", () => {
    expect(shouldSuppressTouchPlacement(base)).toBe(false);
  });

  it("suppresses while a two-finger gesture is active", () => {
    expect(shouldSuppressTouchPlacement({ ...base, gestureActive: true })).toBe(true);
  });

  it("suppresses when other fingers are still on screen", () => {
    expect(shouldSuppressTouchPlacement({ ...base, remainingTouches: 1 })).toBe(true);
  });

  it("suppresses multi-touch touchend events", () => {
    expect(shouldSuppressTouchPlacement({ ...base, changedTouches: 2 })).toBe(true);
  });

  it("suppresses taps inside the post-gesture window", () => {
    expect(
      shouldSuppressTouchPlacement({
        ...base,
        lastGestureEndAt: base.now - (GESTURE_PLACEMENT_SUPPRESS_MS - 1),
      })
    ).toBe(true);
  });

  it("allows taps after the post-gesture window", () => {
    expect(
      shouldSuppressTouchPlacement({
        ...base,
        lastGestureEndAt: base.now - GESTURE_PLACEMENT_SUPPRESS_MS,
      })
    ).toBe(false);
  });
});

describe("anchoredScrollPosition", () => {
  it("keeps the content under the midpoint fixed when zooming in", () => {
    // Page starts at offset 16 (p-4), anchor 200px into the page, midpoint
    // 100px from the viewport left edge, zoom 100 -> 200.
    const next = anchoredScrollPosition({
      pageOffsetLeft: 16,
      pageOffsetTop: 16,
      pageLocalX: 200,
      pageLocalY: 300,
      ratio: 2,
      midX: 100,
      midY: 150,
    });
    // New content position of the anchor: 16 + 200*2 = 416. Keep it under
    // midX=100 -> scrollLeft = 316. Same maths vertically.
    expect(next.scrollLeft).toBe(316);
    expect(next.scrollTop).toBe(466);
  });

  it("is a no-op when the ratio is 1 and the anchor already lines up", () => {
    const next = anchoredScrollPosition({
      pageOffsetLeft: 16,
      pageOffsetTop: 16,
      pageLocalX: 84,
      pageLocalY: 184,
      ratio: 1,
      midX: 100,
      midY: 200,
    });
    expect(next.scrollLeft).toBe(0);
    expect(next.scrollTop).toBe(0);
  });

  it("never returns negative scroll positions when zooming out", () => {
    const next = anchoredScrollPosition({
      pageOffsetLeft: 16,
      pageOffsetTop: 16,
      pageLocalX: 50,
      pageLocalY: 60,
      ratio: 0.5,
      midX: 300,
      midY: 400,
    });
    expect(next.scrollLeft).toBe(0);
    expect(next.scrollTop).toBe(0);
  });

  it("anchors correctly across several zoom levels", () => {
    for (const ratio of [0.5, 0.75, 1.37, 1.5, 2]) {
      const next = anchoredScrollPosition({
        pageOffsetLeft: 16,
        pageOffsetTop: 16,
        pageLocalX: 400,
        pageLocalY: 500,
        ratio,
        midX: 160,
        midY: 240,
      });
      expect(next.scrollLeft).toBeCloseTo(Math.max(0, 16 + 400 * ratio - 160));
      expect(next.scrollTop).toBeCloseTo(Math.max(0, 16 + 500 * ratio - 240));
    }
  });
});
