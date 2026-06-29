import type { MaskRect } from "@/lib/types";

export function maskToPdfRect(mask: MaskRect, pageHeightPts: number): { x: number; y: number; width: number; height: number } {
  return {
    x: mask.x,
    y: pageHeightPts - (mask.y + mask.height),
    width: mask.width,
    height: mask.height,
  };
}
