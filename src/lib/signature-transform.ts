// Shared signature adjustment math (editor preview + PDF export).
//
// A placed signature field can carry optional adjustments: opacity, rotation
// (lean), and horizontal flip. The editor rotates the fitted image about its
// visual centre with Konva; the export must land the image in exactly the
// same place with pdf-lib, which rotates about the draw origin instead. This
// module owns that conversion so both sides always agree.

export const SIGNATURE_OPACITY_MIN = 0.2;
export const SIGNATURE_OPACITY_MAX = 1;
export const SIGNATURE_ROTATION_MIN = -180;
export const SIGNATURE_ROTATION_MAX = 180;

export const SIGNATURE_ADJUSTMENT_DEFAULTS = {
  opacity: 1,
  rotation: 0,
  flipH: false,
} as const;

export function clampSignatureOpacity(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return SIGNATURE_ADJUSTMENT_DEFAULTS.opacity;
  return Math.min(SIGNATURE_OPACITY_MAX, Math.max(SIGNATURE_OPACITY_MIN, value));
}

export function clampSignatureRotation(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return SIGNATURE_ADJUSTMENT_DEFAULTS.rotation;
  return Math.min(SIGNATURE_ROTATION_MAX, Math.max(SIGNATURE_ROTATION_MIN, value));
}

export interface SignatureAdjustments {
  opacity?: number;
  rotation?: number;
  flipH?: boolean;
}

/** True when a signature carries any non-default adjustment. */
export function hasSignatureAdjustments(field: SignatureAdjustments): boolean {
  return (
    clampSignatureOpacity(field.opacity) !== SIGNATURE_ADJUSTMENT_DEFAULTS.opacity ||
    clampSignatureRotation(field.rotation) !== SIGNATURE_ADJUSTMENT_DEFAULTS.rotation ||
    Boolean(field.flipH)
  );
}

export interface SignaturePdfDrawInput {
  /** Centre of the fitted signature image in PDF points (y-up). */
  centerX: number;
  centerY: number;
  /** Fitted image draw size in PDF points (always positive). */
  drawWidth: number;
  drawHeight: number;
  /** Editor rotation in degrees, clockwise positive (Konva convention). */
  rotationDeg: number;
  flipH: boolean;
}

export interface SignaturePdfDrawTransform {
  /** pdf-lib drawImage x/y anchor (local image origin after transforms). */
  x: number;
  y: number;
  /** Signed width: negative mirrors the image horizontally. */
  width: number;
  height: number;
  /** pdf-lib rotation in degrees (counter-clockwise positive). */
  rotateDeg: number;
}

/**
 * Convert a centre-anchored, screen-clockwise rotation (what the editor
 * shows) into pdf-lib drawImage options.
 *
 * pdf-lib rotates counter-clockwise about the (x, y) anchor, which is the
 * local origin of the drawn image. We solve for the anchor position that
 * keeps the image centre fixed. A negative width mirrors the image about
 * its local origin, which combined with the recomputed anchor produces a
 * horizontal flip about the image centre.
 */
export function signaturePdfDrawTransform(input: SignaturePdfDrawInput): SignaturePdfDrawTransform {
  const { centerX, centerY, drawWidth, drawHeight, flipH } = input;
  const rotationDeg = clampSignatureRotation(input.rotationDeg);

  // Screen-clockwise degrees become negative (clockwise) in PDF's y-up space.
  const rotateDeg = -rotationDeg;
  const phi = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  // Local offset from the image centre to the drawImage anchor point.
  // Unflipped: anchor is the bottom-left corner, offset (-w/2, -h/2).
  // Flipped (negative width): the image extends towards -x from the anchor,
  // so the anchor sits at the bottom-right corner, offset (+w/2, -h/2).
  const offsetX = flipH ? drawWidth / 2 : -drawWidth / 2;
  const offsetY = -drawHeight / 2;

  return {
    x: centerX + offsetX * cos - offsetY * sin,
    y: centerY + offsetX * sin + offsetY * cos,
    width: flipH ? -drawWidth : drawWidth,
    height: drawHeight,
    rotateDeg,
  };
}
