/**
 * @jest-environment node
 */

import {
  SIGNATURE_ADJUSTMENT_DEFAULTS,
  SIGNATURE_OPACITY_MAX,
  SIGNATURE_OPACITY_MIN,
  SIGNATURE_ROTATION_MAX,
  SIGNATURE_ROTATION_MIN,
  clampSignatureOpacity,
  clampSignatureRotation,
  hasSignatureAdjustments,
  signaturePdfDrawTransform,
} from "@/lib/signature-transform";
import type { SignatureField } from "@/lib/types";

describe("clampSignatureOpacity", () => {
  it("defaults to fully opaque for missing or invalid values", () => {
    expect(clampSignatureOpacity(undefined)).toBe(1);
    expect(clampSignatureOpacity(Number.NaN)).toBe(1);
  });

  it("clamps into the allowed range", () => {
    expect(clampSignatureOpacity(0)).toBe(SIGNATURE_OPACITY_MIN);
    expect(clampSignatureOpacity(0.05)).toBe(SIGNATURE_OPACITY_MIN);
    expect(clampSignatureOpacity(2)).toBe(SIGNATURE_OPACITY_MAX);
    expect(clampSignatureOpacity(0.65)).toBe(0.65);
  });
});

describe("clampSignatureRotation", () => {
  it("defaults to zero for missing or invalid values", () => {
    expect(clampSignatureRotation(undefined)).toBe(0);
    expect(clampSignatureRotation(Number.NaN)).toBe(0);
  });

  it("clamps into the allowed range", () => {
    expect(clampSignatureRotation(-500)).toBe(SIGNATURE_ROTATION_MIN);
    expect(clampSignatureRotation(500)).toBe(SIGNATURE_ROTATION_MAX);
    expect(clampSignatureRotation(-33)).toBe(-33);
  });
});

describe("hasSignatureAdjustments", () => {
  it("is false for defaults and undefined values", () => {
    expect(hasSignatureAdjustments({})).toBe(false);
    expect(hasSignatureAdjustments({ opacity: 1, rotation: 0, flipH: false })).toBe(false);
  });

  it("is true for any non-default adjustment", () => {
    expect(hasSignatureAdjustments({ opacity: 0.5 })).toBe(true);
    expect(hasSignatureAdjustments({ rotation: 3 })).toBe(true);
    expect(hasSignatureAdjustments({ flipH: true })).toBe(true);
  });
});

describe("signaturePdfDrawTransform", () => {
  const base = { centerX: 300, centerY: 400, drawWidth: 120, drawHeight: 40 };

  it("anchors an unrotated, unflipped image at its bottom-left corner", () => {
    const t = signaturePdfDrawTransform({ ...base, rotationDeg: 0, flipH: false });
    expect(t.x).toBeCloseTo(300 - 60);
    expect(t.y).toBeCloseTo(400 - 20);
    expect(t.width).toBe(120);
    expect(t.height).toBe(40);
    expect(t.rotateDeg).toBe(-0);
  });

  it("inverts screen-clockwise degrees for PDF space", () => {
    const t = signaturePdfDrawTransform({ ...base, rotationDeg: 15, flipH: false });
    expect(t.rotateDeg).toBe(-15);
  });

  it("keeps the image centre fixed for a 180 degree rotation", () => {
    const t = signaturePdfDrawTransform({ ...base, rotationDeg: 180, flipH: false });
    expect(t.x).toBeCloseTo(300 + 60);
    expect(t.y).toBeCloseTo(400 + 20);
  });

  it("mirrors via negative width when flipped", () => {
    const t = signaturePdfDrawTransform({ ...base, rotationDeg: 0, flipH: true });
    expect(t.width).toBe(-120);
    expect(t.height).toBe(40);
    // Anchor moves to the bottom-right corner so the centre stays fixed.
    expect(t.x).toBeCloseTo(300 + 60);
    expect(t.y).toBeCloseTo(400 - 20);
  });

  it("keeps the image centre invariant for arbitrary angles and flips", () => {
    for (const rotationDeg of [-170, -90, -37, -1, 0, 1, 22.5, 45, 90, 135, 179]) {
      for (const flipH of [false, true]) {
        const t = signaturePdfDrawTransform({ ...base, rotationDeg, flipH });
        const phi = (t.rotateDeg * Math.PI) / 180;
        const cos = Math.cos(phi);
        const sin = Math.sin(phi);
        // Local centre offset from the drawImage anchor, in signed-width space.
        const localCx = t.width / 2;
        const localCy = t.height / 2;
        const centerX = t.x + localCx * cos - localCy * sin;
        const centerY = t.y + localCx * sin + localCy * cos;
        expect(centerX).toBeCloseTo(base.centerX, 6);
        expect(centerY).toBeCloseTo(base.centerY, 6);
      }
    }
  });

  it("clamps out-of-range rotation before transforming", () => {
    const t = signaturePdfDrawTransform({ ...base, rotationDeg: 999, flipH: false });
    expect(t.rotateDeg).toBe(-SIGNATURE_ROTATION_MAX);
  });
});

describe("signature adjustment persistence", () => {
  it("survives a JSON round trip on the field object (autosave/restore shape)", () => {
    const field: SignatureField = {
      id: "sig-1",
      type: "signature",
      x: 10,
      y: 20,
      width: 180,
      height: 60,
      page: 0,
      value: "",
      fontSize: 16,
      signatureDataUrl: "data:image/png;base64,AAAA",
      opacity: 0.45,
      rotation: -12,
      flipH: true,
    };

    const restored = JSON.parse(JSON.stringify([field]))[0] as SignatureField;
    expect(restored.opacity).toBe(0.45);
    expect(restored.rotation).toBe(-12);
    expect(restored.flipH).toBe(true);
  });

  it("exposes stable defaults for reset controls", () => {
    expect(SIGNATURE_ADJUSTMENT_DEFAULTS).toEqual({ opacity: 1, rotation: 0, flipH: false });
  });
});
