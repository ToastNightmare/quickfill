import type {
  AffineMatrix,
  AffinePoint,
  MediaCornerName,
  MediaCorners,
  MediaPlacement,
  MediaTransform,
  ResolvedMediaTransform,
} from "./media-types";

export const AFFINE_NEAR_SINGULAR_EPSILON = 1e-12;

export const AFFINE_IDENTITY_MATRIX: AffineMatrix = Object.freeze([
  1, 0, 0, 1, 0, 0,
]);

export const MEDIA_CORNER_ORDER: readonly MediaCornerName[] = Object.freeze([
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
]);

function canonicalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function frozenPoint(x: number, y: number): Readonly<AffinePoint> {
  return Object.freeze({ x: canonicalizeZero(x), y: canonicalizeZero(y) });
}

function frozenMatrix(values: readonly number[]): AffineMatrix {
  const matrix = Object.freeze(values.map(canonicalizeZero)) as AffineMatrix;
  assertValidAffineMatrix(matrix);
  return matrix;
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

export function assertValidMediaPlacement(
  value: unknown,
): asserts value is MediaPlacement {
  if (!value || typeof value !== "object") {
    throw new TypeError("placement must be an object");
  }

  const placement = value as Partial<MediaPlacement>;
  if (!Number.isSafeInteger(placement.pageIndex) || (placement.pageIndex ?? -1) < 0) {
    throw new RangeError("placement.pageIndex must be a non-negative safe integer");
  }
  assertFinite(placement.xPts, "placement.xPts");
  assertFinite(placement.yPts, "placement.yPts");
  assertFinite(placement.widthPts, "placement.widthPts");
  assertFinite(placement.heightPts, "placement.heightPts");
  if (placement.widthPts <= 0 || placement.heightPts <= 0) {
    throw new RangeError("placement dimensions must be strictly positive");
  }
}

export function assertValidMediaTransform(
  value: unknown,
): asserts value is MediaTransform {
  if (!value || typeof value !== "object") {
    throw new TypeError("transform must be an object");
  }

  const transform = value as Partial<MediaTransform>;
  assertFinite(transform.rotationDeg, "transform.rotationDeg");
  if (typeof transform.flipX !== "boolean" || typeof transform.flipY !== "boolean") {
    throw new TypeError("transform flips must be boolean");
  }
}

/** Normalize finite degrees to [-180, 180), with zero always stored as +0. */
export function normalizeMediaRotation(rotationDeg: number): number {
  assertFinite(rotationDeg, "rotationDeg");
  const remainder = rotationDeg % 360;
  const normalized =
    remainder >= 180 ? remainder - 360 : remainder < -180 ? remainder + 360 : remainder;
  return canonicalizeZero(normalized);
}

/**
 * Reject malformed and ill-conditioned affine transforms. The determinant
 * check is relative to the largest linear coefficient, so uniformly small
 * but well-conditioned matrices remain valid.
 */
export function assertValidAffineMatrix(
  value: unknown,
): asserts value is AffineMatrix {
  if (!Array.isArray(value) || value.length !== 6) {
    throw new TypeError("affine matrix must contain exactly six numbers");
  }
  for (let index = 0; index < 6; index += 1) {
    assertFinite(value[index], `matrix[${index}]`);
  }

  const [a, b, c, d] = value;
  const linearScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (linearScale === 0) {
    throw new RangeError("affine matrix is singular");
  }

  const normalizedDeterminant =
    (a / linearScale) * (d / linearScale) - (b / linearScale) * (c / linearScale);
  if (
    !Number.isFinite(normalizedDeterminant) ||
    Math.abs(normalizedDeterminant) <= AFFINE_NEAR_SINGULAR_EPSILON
  ) {
    throw new RangeError("affine matrix is singular or near-singular");
  }
}

export function applyAffineMatrix(
  matrix: AffineMatrix,
  point: Readonly<AffinePoint>,
): Readonly<AffinePoint> {
  assertValidAffineMatrix(matrix);
  if (!point || typeof point !== "object") {
    throw new TypeError("point must be an object");
  }
  assertFinite(point.x, "point.x");
  assertFinite(point.y, "point.y");

  const [a, b, c, d, e, f] = matrix;
  const x = a * point.x + c * point.y + e;
  const y = b * point.x + d * point.y + f;
  assertFinite(x, "transformed point.x");
  assertFinite(y, "transformed point.y");
  return frozenPoint(x, y);
}

/**
 * Return left ∘ right: points are transformed by `right` first, then
 * `left`. This matches PDF.js's [a, b, c, d, e, f] point convention.
 */
export function multiplyAffineMatrices(
  left: AffineMatrix,
  right: AffineMatrix,
): AffineMatrix {
  assertValidAffineMatrix(left);
  assertValidAffineMatrix(right);
  const [la, lb, lc, ld, le, lf] = left;
  const [ra, rb, rc, rd, re, rf] = right;

  return frozenMatrix([
    la * ra + lc * rb,
    lb * ra + ld * rb,
    la * rc + lc * rd,
    lb * rc + ld * rd,
    la * re + lc * rf + le,
    lb * re + ld * rf + lf,
  ]);
}

export function invertAffineMatrix(matrix: AffineMatrix): AffineMatrix {
  assertValidAffineMatrix(matrix);
  const [a, b, c, d, e, f] = matrix;
  const linearScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  const normalizedA = a / linearScale;
  const normalizedB = b / linearScale;
  const normalizedC = c / linearScale;
  const normalizedD = d / linearScale;
  const normalizedDeterminant =
    normalizedA * normalizedD - normalizedB * normalizedC;
  const inverseScale = 1 / linearScale;

  const inverseA = (normalizedD / normalizedDeterminant) * inverseScale;
  const inverseB = (-normalizedB / normalizedDeterminant) * inverseScale;
  const inverseC = (-normalizedC / normalizedDeterminant) * inverseScale;
  const inverseD = (normalizedA / normalizedDeterminant) * inverseScale;
  const inverseE = -(inverseA * e + inverseC * f);
  const inverseF = -(inverseB * e + inverseD * f);

  return frozenMatrix([
    inverseA,
    inverseB,
    inverseC,
    inverseD,
    inverseE,
    inverseF,
  ]);
}

function rotationComponents(rotationDeg: number): readonly [cos: number, sin: number] {
  switch (rotationDeg) {
    case -180:
      return [-1, 0];
    case -90:
      return [0, -1];
    case 0:
      return [1, 0];
    case 90:
      return [0, 1];
    default: {
      const radians = (rotationDeg * Math.PI) / 180;
      return [Math.cos(radians), Math.sin(radians)];
    }
  }
}

function localCorners(widthPts: number, heightPts: number): MediaCorners {
  return Object.freeze([
    frozenPoint(0, 0),
    frozenPoint(widthPts, 0),
    frozenPoint(widthPts, heightPts),
    frozenPoint(0, heightPts),
  ]) as MediaCorners;
}

function transformCorners(matrix: AffineMatrix, corners: MediaCorners): MediaCorners {
  return Object.freeze(corners.map((corner) => applyAffineMatrix(matrix, corner))) as MediaCorners;
}

/**
 * Resolve placement-local point coordinates into QuickFill page space.
 * Local (0, 0) is the unrotated box's top-left and local dimensions remain
 * positive. The optional viewport matrix is applied after the page transform.
 */
export function resolveMediaTransform(
  placementValue: Readonly<MediaPlacement>,
  transformValue: Readonly<MediaTransform>,
  pageToViewport: AffineMatrix | null = null,
): Readonly<ResolvedMediaTransform> {
  assertValidMediaPlacement(placementValue);
  assertValidMediaTransform(transformValue);
  if (pageToViewport !== null) assertValidAffineMatrix(pageToViewport);

  const placement = Object.freeze({
    pageIndex: placementValue.pageIndex,
    xPts: canonicalizeZero(placementValue.xPts),
    yPts: canonicalizeZero(placementValue.yPts),
    widthPts: placementValue.widthPts,
    heightPts: placementValue.heightPts,
  });
  const transform = Object.freeze({
    rotationDeg: normalizeMediaRotation(transformValue.rotationDeg),
    flipX: transformValue.flipX,
    flipY: transformValue.flipY,
  });

  const centerX = placement.xPts + placement.widthPts / 2;
  const centerY = placement.yPts + placement.heightPts / 2;
  const [cos, sin] = rotationComponents(transform.rotationDeg);
  const scaleX = transform.flipX ? -1 : 1;
  const scaleY = transform.flipY ? -1 : 1;

  // T(page centre) × R(clockwise in Y-down space) × Flip(local axes)
  // × T(-local centre). multiplyAffineMatrices uses the same right-first order.
  const a = cos * scaleX;
  const b = sin * scaleX;
  const c = -sin * scaleY;
  const d = cos * scaleY;
  const localToPage = frozenMatrix([
    a,
    b,
    c,
    d,
    centerX - a * placement.widthPts / 2 - c * placement.heightPts / 2,
    centerY - b * placement.widthPts / 2 - d * placement.heightPts / 2,
  ]);
  const pageToLocal = invertAffineMatrix(localToPage);
  const sourceCorners = localCorners(placement.widthPts, placement.heightPts);
  const pageCorners = transformCorners(localToPage, sourceCorners);

  const localToViewport = pageToViewport
    ? multiplyAffineMatrices(pageToViewport, localToPage)
    : null;
  const viewportToLocal = localToViewport ? invertAffineMatrix(localToViewport) : null;
  const viewportCorners = localToViewport
    ? transformCorners(localToViewport, sourceCorners)
    : null;

  return Object.freeze({
    placement,
    transform,
    centerPagePts: frozenPoint(centerX, centerY),
    localToPage,
    pageToLocal,
    pageCorners,
    localToViewport,
    viewportToLocal,
    viewportCorners,
  });
}
