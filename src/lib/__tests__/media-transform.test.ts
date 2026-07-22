/**
 * @jest-environment node
 */

import {
  AFFINE_IDENTITY_MATRIX,
  MEDIA_CORNER_ORDER,
  applyAffineMatrix,
  assertValidAffineMatrix,
  invertAffineMatrix,
  multiplyAffineMatrices,
  normalizeMediaRotation,
  resolveMediaTransform,
} from "@/lib/media-transform";
import type {
  AffineMatrix,
  AffinePoint,
  LocalMediaAssetId,
  MediaAssetDescriptor,
  MediaPlacement,
  MediaTransform,
} from "@/lib/media-types";

const placement: MediaPlacement = {
  pageIndex: 0,
  xPts: 100,
  yPts: 200,
  widthPts: 40,
  heightPts: 20,
};

const untransformed: MediaTransform = {
  rotationDeg: 0,
  flipX: false,
  flipY: false,
};

function expectPointClose(
  actual: Readonly<AffinePoint>,
  expected: Readonly<AffinePoint>,
): void {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
}

describe("media contracts", () => {
  it("keep asset descriptors JSON-safe without carrying binary data", () => {
    const descriptor: MediaAssetDescriptor = Object.freeze({
      id: "asset-local-1" as LocalMediaAssetId,
      kind: "image",
      fileName: "photo.png",
      mimeType: "image/png",
      intrinsicWidthPx: 800,
      intrinsicHeightPx: 600,
    });

    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
    expect(Object.isFrozen(descriptor)).toBe(true);
  });
});

describe("normalizeMediaRotation", () => {
  it.each([
    [0, 0],
    [-0, 0],
    [90, 90],
    [180, -180],
    [-180, -180],
    [181, -179],
    [-181, 179],
    [360, 0],
    [-360, 0],
    [540, -180],
    [721.5, 1.5],
  ])("normalizes %p to %p", (input, expected) => {
    const normalized = normalizeMediaRotation(input);
    expect(normalized).toBe(expected);
    expect(Object.is(normalized, -0)).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects %p",
    (rotation) => {
      expect(() => normalizeMediaRotation(rotation)).toThrow(RangeError);
    },
  );
});

describe("placement validation", () => {
  it.each([
    ["zero width", { widthPts: 0 }],
    ["negative width", { widthPts: -1 }],
    ["NaN width", { widthPts: Number.NaN }],
    ["infinite width", { widthPts: Number.POSITIVE_INFINITY }],
    ["zero height", { heightPts: 0 }],
    ["negative height", { heightPts: -1 }],
    ["NaN height", { heightPts: Number.NaN }],
    ["infinite height", { heightPts: Number.NEGATIVE_INFINITY }],
    ["NaN x", { xPts: Number.NaN }],
    ["infinite y", { yPts: Number.POSITIVE_INFINITY }],
    ["negative page", { pageIndex: -1 }],
    ["fractional page", { pageIndex: 0.5 }],
    ["unsafe page", { pageIndex: Number.MAX_SAFE_INTEGER + 1 }],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      resolveMediaTransform({ ...placement, ...override }, untransformed),
    ).toThrow();
  });

  it("allows finite negative positions while preserving positive dimensions", () => {
    const resolved = resolveMediaTransform(
      { ...placement, xPts: -5, yPts: -10 },
      untransformed,
    );

    expect(resolved.placement).toMatchObject({
      xPts: -5,
      yPts: -10,
      widthPts: 40,
      heightPts: 20,
    });
  });

  it("rejects invalid transform members", () => {
    expect(() =>
      resolveMediaTransform(placement, { ...untransformed, rotationDeg: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      resolveMediaTransform(placement, { ...untransformed, flipX: 1 } as unknown as MediaTransform),
    ).toThrow(TypeError);
  });
});

describe("media transform resolution", () => {
  it("uses the documented deterministic corner order", () => {
    expect(MEDIA_CORNER_ORDER).toEqual([
      "top-left",
      "top-right",
      "bottom-right",
      "bottom-left",
    ]);
  });

  it.each([
    [
      0,
      [
        { x: 100, y: 200 },
        { x: 140, y: 200 },
        { x: 140, y: 220 },
        { x: 100, y: 220 },
      ],
    ],
    [
      90,
      [
        { x: 130, y: 190 },
        { x: 130, y: 230 },
        { x: 110, y: 230 },
        { x: 110, y: 190 },
      ],
    ],
    [
      -90,
      [
        { x: 110, y: 230 },
        { x: 110, y: 190 },
        { x: 130, y: 190 },
        { x: 130, y: 230 },
      ],
    ],
    [
      180,
      [
        { x: 140, y: 220 },
        { x: 100, y: 220 },
        { x: 100, y: 200 },
        { x: 140, y: 200 },
      ],
    ],
  ] as const)("resolves exact semantic corners at %p degrees", (rotationDeg, expected) => {
    const resolved = resolveMediaTransform(placement, {
      ...untransformed,
      rotationDeg,
    });
    expect(resolved.pageCorners).toEqual(expected);
  });

  it("keeps the centre invariant for arbitrary rotations and every flip combination", () => {
    for (const rotationDeg of [-179, -123.25, -45, 0, 21.5, 90, 179.75]) {
      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          const resolved = resolveMediaTransform(placement, {
            rotationDeg,
            flipX,
            flipY,
          });
          const transformedCenter = applyAffineMatrix(resolved.localToPage, {
            x: placement.widthPts / 2,
            y: placement.heightPts / 2,
          });
          expectPointClose(transformedCenter, { x: 120, y: 210 });
        }
      }
    }
  });

  it("applies local flips before clockwise rotation", () => {
    const resolved = resolveMediaTransform(placement, {
      rotationDeg: 90,
      flipX: true,
      flipY: false,
    });

    expect(resolved.pageCorners[0]).toEqual({ x: 130, y: 230 });
  });

  it("round-trips local and page points through forward and inverse transforms", () => {
    const resolved = resolveMediaTransform(placement, {
      rotationDeg: 37.5,
      flipX: true,
      flipY: true,
    });

    for (const point of [
      { x: 0, y: 0 },
      { x: 40, y: 20 },
      { x: 11.25, y: 7.75 },
    ]) {
      const pagePoint = applyAffineMatrix(resolved.localToPage, point);
      expectPointClose(applyAffineMatrix(resolved.pageToLocal, pagePoint), point);
    }
  });

  it("composes and inverts a supplied PDF.js-style viewport matrix", () => {
    const pageToViewport: AffineMatrix = [2, 0, 0, -2, 10, 1_600];
    const resolved = resolveMediaTransform(
      placement,
      { rotationDeg: -31, flipX: false, flipY: true },
      pageToViewport,
    );
    const localPoint = { x: 13, y: 6 };
    const pagePoint = applyAffineMatrix(resolved.localToPage, localPoint);
    const expectedViewportPoint = applyAffineMatrix(pageToViewport, pagePoint);

    expect(resolved.localToViewport).not.toBeNull();
    expect(resolved.viewportToLocal).not.toBeNull();
    expectPointClose(
      applyAffineMatrix(resolved.localToViewport!, localPoint),
      expectedViewportPoint,
    );
    expectPointClose(
      applyAffineMatrix(resolved.viewportToLocal!, expectedViewportPoint),
      localPoint,
    );
  });

  it("resolves repeatedly to the same frozen positive-dimension value", () => {
    const transform = { rotationDeg: 450, flipX: true, flipY: false };
    const first = resolveMediaTransform(placement, transform);
    const second = resolveMediaTransform(placement, transform);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.placement.widthPts).toBeGreaterThan(0);
    expect(first.placement.heightPts).toBeGreaterThan(0);
    expect(first.transform.rotationDeg).toBe(90);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.placement)).toBe(true);
    expect(Object.isFrozen(first.transform)).toBe(true);
    expect(Object.isFrozen(first.pageCorners)).toBe(true);
  });
});

describe("affine helpers", () => {
  it("applies right then left when multiplying matrices", () => {
    const translate: AffineMatrix = [1, 0, 0, 1, 10, 20];
    const scale: AffineMatrix = [2, 0, 0, 3, 0, 0];
    const point = { x: 1, y: 2 };

    expect(applyAffineMatrix(multiplyAffineMatrices(translate, scale), point)).toEqual({
      x: 12,
      y: 26,
    });
    expect(applyAffineMatrix(multiplyAffineMatrices(scale, translate), point)).toEqual({
      x: 22,
      y: 66,
    });
  });

  it("round-trips a general affine transform through its inverse", () => {
    const matrix: AffineMatrix = [1.2, 0.35, -0.4, 0.9, 45, -17];
    const inverse = invertAffineMatrix(matrix);
    const point = { x: 12.5, y: -8.25 };

    expectPointClose(applyAffineMatrix(inverse, applyAffineMatrix(matrix, point)), point);
    expectPointClose(
      applyAffineMatrix(multiplyAffineMatrices(matrix, inverse), point),
      applyAffineMatrix(AFFINE_IDENTITY_MATRIX, point),
    );
  });

  it.each([
    [[1, 2, 2, 4, 0, 0]],
    [[1, 1, 1, 1 + 1e-13, 0, 0]],
    [[0, 0, 0, 0, 0, 0]],
  ] as const)("rejects singular or near-singular matrix %p", (matrix) => {
    expect(() => assertValidAffineMatrix(matrix)).toThrow(RangeError);
    expect(() => invertAffineMatrix(matrix)).toThrow(RangeError);
  });

  it("rejects malformed and non-finite supplied matrices", () => {
    expect(() => assertValidAffineMatrix([1, 0, 0, 1, 0])).toThrow(TypeError);
    expect(() =>
      assertValidAffineMatrix([1, 0, 0, 1, , 0]),
    ).toThrow(RangeError);
    expect(() =>
      assertValidAffineMatrix([1, 0, Number.NaN, 1, 0, 0]),
    ).toThrow(RangeError);
    expect(() =>
      resolveMediaTransform(placement, untransformed, [
        1,
        0,
        0,
        1,
        Number.POSITIVE_INFINITY,
        0,
      ]),
    ).toThrow(RangeError);
  });
});
