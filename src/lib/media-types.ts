declare const localMediaAssetIdBrand: unique symbol;

/** A local-only identifier. ID generation belongs to a later intake layer. */
export type LocalMediaAssetId = string & {
  readonly [localMediaAssetIdBrand]: "LocalMediaAssetId";
};

/** Serializable metadata only; binary media remains outside this contract. */
export interface MediaAssetDescriptor {
  readonly id: LocalMediaAssetId;
  readonly kind: "image";
  readonly fileName: string;
  readonly mimeType: string;
  readonly intrinsicWidthPx: number;
  readonly intrinsicHeightPx: number;
}

/**
 * Geometry in QuickFill's scale-1 PDF-page point space: top-left origin,
 * positive X to the right, and positive Y down the page.
 */
export interface MediaPlacement {
  readonly pageIndex: number;
  readonly xPts: number;
  readonly yPts: number;
  readonly widthPts: number;
  readonly heightPts: number;
}

/** Flips are applied in local media axes before clockwise page-space rotation. */
export interface MediaTransform {
  readonly rotationDeg: number;
  /** Reflect the local X coordinate (a horizontal mirror). */
  readonly flipX: boolean;
  /** Reflect the local Y coordinate (a vertical mirror). */
  readonly flipY: boolean;
}

/** Serializable state for one placed overlay; no binary asset data is stored. */
export interface MediaOverlayState {
  readonly assetId: LocalMediaAssetId;
  readonly placement: Readonly<MediaPlacement>;
  readonly transform: Readonly<MediaTransform>;
}

/**
 * PDF.js-compatible affine tuple [a, b, c, d, e, f], applied as:
 * x' = a*x + c*y + e; y' = b*x + d*y + f.
 */
export type AffineMatrix = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

export interface AffinePoint {
  readonly x: number;
  readonly y: number;
}

export type MediaCornerName =
  | "top-left"
  | "top-right"
  | "bottom-right"
  | "bottom-left";

/** Corners retain their local semantic identity, including after flips. */
export type MediaCorners = readonly [
  topLeft: Readonly<AffinePoint>,
  topRight: Readonly<AffinePoint>,
  bottomRight: Readonly<AffinePoint>,
  bottomLeft: Readonly<AffinePoint>,
];

export interface ResolvedMediaTransform {
  readonly placement: Readonly<MediaPlacement>;
  readonly transform: Readonly<MediaTransform>;
  readonly centerPagePts: Readonly<AffinePoint>;
  readonly localToPage: AffineMatrix;
  readonly pageToLocal: AffineMatrix;
  readonly pageCorners: MediaCorners;
  readonly localToViewport: AffineMatrix | null;
  readonly viewportToLocal: AffineMatrix | null;
  readonly viewportCorners: MediaCorners | null;
}
