import {
  clampCleanupOptions,
  cleanupAlpha,
  hasCleanupAdjustments,
  SIGNATURE_CLEANUP_DEFAULTS,
} from "@/lib/signature-image";

const SAMPLE_STRENGTHS = [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1];

/** Historical alpha mapping used before cleanup options existed. */
function legacyAlpha(strength: number) {
  const clamped = Math.max(0, Math.min(1, strength));
  return Math.round(Math.pow(clamped, 0.72) * 255);
}

describe("clampCleanupOptions", () => {
  it("returns defaults for undefined/null/empty", () => {
    expect(clampCleanupOptions()).toEqual(SIGNATURE_CLEANUP_DEFAULTS);
    expect(clampCleanupOptions(null)).toEqual(SIGNATURE_CLEANUP_DEFAULTS);
    expect(clampCleanupOptions({})).toEqual(SIGNATURE_CLEANUP_DEFAULTS);
  });

  it("clamps out-of-range values into 0..1", () => {
    expect(clampCleanupOptions({ backgroundRemoval: -1, inkStrength: 2 })).toEqual({
      backgroundRemoval: 0,
      inkStrength: 1,
    });
    expect(clampCleanupOptions({ backgroundRemoval: 1.5 }).backgroundRemoval).toBe(1);
  });

  it("replaces NaN/Infinity/non-numbers with defaults", () => {
    expect(clampCleanupOptions({ backgroundRemoval: NaN, inkStrength: Infinity })).toEqual(
      SIGNATURE_CLEANUP_DEFAULTS,
    );
    expect(
      clampCleanupOptions({
        backgroundRemoval: "high" as unknown as number,
      }).backgroundRemoval,
    ).toBe(SIGNATURE_CLEANUP_DEFAULTS.backgroundRemoval);
  });

  it("passes through valid in-range values", () => {
    expect(clampCleanupOptions({ backgroundRemoval: 0.4, inkStrength: 0.7 })).toEqual({
      backgroundRemoval: 0.4,
      inkStrength: 0.7,
    });
  });
});

describe("hasCleanupAdjustments", () => {
  it("is false for defaults and invalid values", () => {
    expect(hasCleanupAdjustments()).toBe(false);
    expect(hasCleanupAdjustments(SIGNATURE_CLEANUP_DEFAULTS)).toBe(false);
    expect(hasCleanupAdjustments({ backgroundRemoval: NaN })).toBe(false);
  });

  it("is true when either option moves off default", () => {
    expect(hasCleanupAdjustments({ backgroundRemoval: 0.3 })).toBe(true);
    expect(hasCleanupAdjustments({ inkStrength: 0.3 })).toBe(true);
  });
});

describe("cleanupAlpha", () => {
  it("locks default behaviour to the historical mapping", () => {
    for (const strength of SAMPLE_STRENGTHS) {
      expect(cleanupAlpha(strength)).toBe(legacyAlpha(strength));
      expect(cleanupAlpha(strength, SIGNATURE_CLEANUP_DEFAULTS)).toBe(legacyAlpha(strength));
      expect(cleanupAlpha(strength, {})).toBe(legacyAlpha(strength));
    }
  });

  it("clamps strength outside 0..1", () => {
    expect(cleanupAlpha(-0.5)).toBe(0);
    expect(cleanupAlpha(1.5)).toBe(255);
  });

  it("is monotonic non-decreasing in strength for any options", () => {
    const optionSets = [
      undefined,
      { backgroundRemoval: 0.5 },
      { inkStrength: 0.5 },
      { backgroundRemoval: 1, inkStrength: 1 },
      { backgroundRemoval: 0.25, inkStrength: 0.75 },
    ];
    for (const options of optionSets) {
      let previous = -1;
      for (let s = 0; s <= 1.0001; s += 0.01) {
        const alpha = cleanupAlpha(s, options);
        expect(alpha).toBeGreaterThanOrEqual(previous);
        previous = alpha;
      }
    }
  });

  it("background removal makes weak haze fully transparent", () => {
    const haze = 0.15;
    expect(cleanupAlpha(haze)).toBeGreaterThan(0);
    expect(cleanupAlpha(haze, { backgroundRemoval: 1 })).toBe(0);
  });

  it("raising background removal raises the cutoff", () => {
    // A pixel that survives mild removal dies under aggressive removal.
    const strength = 0.3;
    expect(cleanupAlpha(strength, { backgroundRemoval: 0.3 })).toBeGreaterThan(0);
    expect(cleanupAlpha(strength, { backgroundRemoval: 1 })).toBe(0);
    // And alphas never increase as removal grows.
    for (const s of SAMPLE_STRENGTHS) {
      expect(cleanupAlpha(s, { backgroundRemoval: 0.6 })).toBeLessThanOrEqual(
        cleanupAlpha(s, { backgroundRemoval: 0.2 }),
      );
    }
  });

  it("ink strength increases alpha for real ink", () => {
    for (const strength of [0.3, 0.5, 0.7]) {
      expect(cleanupAlpha(strength, { inkStrength: 1 })).toBeGreaterThan(
        cleanupAlpha(strength, { inkStrength: 0 }),
      );
    }
    // Already-saturated ink stays capped at 255.
    expect(cleanupAlpha(1, { inkStrength: 1 })).toBe(255);
  });

  it("ink strength never resurrects below-cutoff background", () => {
    const belowCutoff = 0.2; // cutoff at backgroundRemoval=1 is 0.45
    expect(cleanupAlpha(belowCutoff, { backgroundRemoval: 1 })).toBe(0);
    expect(cleanupAlpha(belowCutoff, { backgroundRemoval: 1, inkStrength: 1 })).toBe(0);
  });

  it("strong ink stays strong under aggressive background removal", () => {
    const strongInk = 0.85;
    const alpha = cleanupAlpha(strongInk, { backgroundRemoval: 1, inkStrength: 1 });
    expect(alpha).toBeGreaterThan(200);
  });
});
