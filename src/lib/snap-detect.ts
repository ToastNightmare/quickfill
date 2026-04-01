/**
 * Pixel-based form field boundary detection.
 * Scans a region of the PDF canvas around a click point to find
 * rectangular form boxes (input fields, lines) and returns snap coordinates.
 *
 * Supports full rectangles and underline-only form fields.
 */

interface SnapResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DARK_THRESHOLD = 100; // pixel is "dark" if average RGB < this (raised for lighter borders)
const SCAN_WIDTH = 360; // wider scan to catch larger form fields
const SCAN_HEIGHT = 120; // taller scan for better vertical coverage
const MIN_LINE_LENGTH_H = 30; // minimum horizontal line length in pixels
const MIN_LINE_LENGTH_V = 12; // minimum vertical line length in pixels
const GAP_TOLERANCE = 6; // allow small gaps in lines (raised for dotted/dashed borders)
const UNDERLINE_DEFAULT_HEIGHT = 28; // default height for underline-only fields

function isDark(data: Uint8ClampedArray, index: number): boolean {
  return (data[index] + data[index + 1] + data[index + 2]) / 3 < DARK_THRESHOLD;
}

/** Find continuous dark runs along a row, allowing small gaps. */
function findHorizontalLines(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { y: number; x1: number; x2: number }[] {
  const lines: { y: number; x1: number; x2: number }[] = [];

  for (let row = 0; row < height; row++) {
    let runStart = -1;
    let gapCount = 0;

    for (let col = 0; col < width; col++) {
      const idx = (row * width + col) * 4;
      if (isDark(data, idx)) {
        if (runStart === -1) runStart = col;
        gapCount = 0;
      } else if (runStart !== -1) {
        gapCount++;
        if (gapCount > GAP_TOLERANCE) {
          const runEnd = col - gapCount;
          if (runEnd - runStart >= MIN_LINE_LENGTH_H) {
            lines.push({ y: row, x1: runStart, x2: runEnd });
          }
          runStart = -1;
          gapCount = 0;
        }
      }
    }
    // End of row
    if (runStart !== -1) {
      const runEnd = width - 1 - gapCount;
      if (runEnd - runStart >= MIN_LINE_LENGTH_H) {
        lines.push({ y: row, x1: runStart, x2: runEnd });
      }
    }
  }

  return lines;
}

/** Find continuous dark runs along a column, allowing small gaps. */
function findVerticalLines(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y1: number; y2: number }[] {
  const lines: { x: number; y1: number; y2: number }[] = [];

  for (let col = 0; col < width; col++) {
    let runStart = -1;
    let gapCount = 0;

    for (let row = 0; row < height; row++) {
      const idx = (row * width + col) * 4;
      if (isDark(data, idx)) {
        if (runStart === -1) runStart = row;
        gapCount = 0;
      } else if (runStart !== -1) {
        gapCount++;
        if (gapCount > GAP_TOLERANCE) {
          const runEnd = row - gapCount;
          if (runEnd - runStart >= MIN_LINE_LENGTH_V) {
            lines.push({ x: col, y1: runStart, y2: runEnd });
          }
          runStart = -1;
          gapCount = 0;
        }
      }
    }
    if (runStart !== -1) {
      const runEnd = height - 1 - gapCount;
      if (runEnd - runStart >= MIN_LINE_LENGTH_V) {
        lines.push({ x: col, y1: runStart, y2: runEnd });
      }
    }
  }

  return lines;
}

/**
 * Try to detect a rectangular form box around the click point.
 * Returns snap coordinates (in canvas pixel space) or null if no box found.
 *
 * Supports:
 * - Full rectangles (4-sided boxes)
 * - Underline-only form fields (single horizontal line near/below click)
 *
 * @param canvas - The PDF.js rendered canvas element
 * @param clickX - Click X in canvas pixel coordinates
 * @param clickY - Click Y in canvas pixel coordinates
 */
export function detectSnapBox(
  canvas: HTMLCanvasElement,
  clickX: number,
  clickY: number,
): SnapResult | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Define scan window centered on click, clamped to canvas bounds
  const sx = Math.max(0, Math.floor(clickX - SCAN_WIDTH / 2));
  const sy = Math.max(0, Math.floor(clickY - SCAN_HEIGHT / 2));
  const sw = Math.min(SCAN_WIDTH, canvas.width - sx);
  const sh = Math.min(SCAN_HEIGHT, canvas.height - sy);

  if (sw < 20 || sh < 10) return null;

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(sx, sy, sw, sh);
  } catch {
    return null;
  }

  const { data } = imageData;

  const hLines = findHorizontalLines(data, sw, sh);
  const vLines = findVerticalLines(data, sw, sh);

  // Sort horizontal lines by Y, vertical by X
  hLines.sort((a, b) => a.y - b.y);
  vLines.sort((a, b) => a.x - b.x);

  // Click position relative to scan window
  const relClickX = clickX - sx;
  const relClickY = clickY - sy;

  // --- Strategy 1: Full rectangle detection ---
  let bestBox: SnapResult | null = null;
  let bestArea = Infinity;

  if (hLines.length >= 2 && vLines.length >= 2) {
    for (let ti = 0; ti < hLines.length - 1; ti++) {
      const top = hLines[ti];
      if (top.y > relClickY) break;

      for (let bi = ti + 1; bi < hLines.length; bi++) {
        const bottom = hLines[bi];
        if (bottom.y < relClickY) continue;

        const boxHeight = bottom.y - top.y;
        if (boxHeight < 10 || boxHeight > 80) continue;

        const overlapX1 = Math.max(top.x1, bottom.x1);
        const overlapX2 = Math.min(top.x2, bottom.x2);
        if (overlapX2 - overlapX1 < MIN_LINE_LENGTH_H) continue;

        for (let li = 0; li < vLines.length; li++) {
          const left = vLines[li];
          if (left.x > relClickX) break;
          if (left.x < overlapX1 - 8 || left.x > overlapX1 + 8) continue;
          if (left.y1 > top.y + 5 || left.y2 < bottom.y - 5) continue;

          for (let ri = li + 1; ri < vLines.length; ri++) {
            const right = vLines[ri];
            if (right.x < relClickX) continue;
            if (right.x < overlapX2 - 8 || right.x > overlapX2 + 8) continue;
            if (right.y1 > top.y + 5 || right.y2 < bottom.y - 5) continue;

            const boxWidth = right.x - left.x;
            if (boxWidth < 20) continue;

            const area = boxWidth * boxHeight;
            if (area < bestArea) {
              bestArea = area;
              bestBox = {
                x: sx + left.x,
                y: sy + top.y,
                width: boxWidth,
                height: boxHeight,
              };
            }
          }
        }
      }
    }
  }

  if (bestBox) return bestBox;

  // --- Strategy 2: Underline-only detection ---
  // Many PDF forms use just a horizontal line as a text entry marker.
  // Find the nearest horizontal line below or at the click Y, build a field above it.
  if (hLines.length > 0) {
    let bestUnderline: SnapResult | null = null;
    let bestDist = Infinity;

    for (const line of hLines) {
      const lineLen = line.x2 - line.x1;
      if (lineLen < 50) continue; // skip very short lines

      // Line should be at or below the click point (within tolerance)
      const dist = line.y - relClickY;
      if (dist < -10 || dist > 40) continue; // line must be near/below click

      // Click X should be within the line's span
      if (relClickX < line.x1 - 10 || relClickX > line.x2 + 10) continue;

      const absDist = Math.abs(dist);
      if (absDist < bestDist) {
        bestDist = absDist;
        bestUnderline = {
          x: sx + line.x1,
          y: sy + line.y - UNDERLINE_DEFAULT_HEIGHT,
          width: lineLen,
          height: UNDERLINE_DEFAULT_HEIGHT,
        };
      }
    }

    if (bestUnderline) return bestUnderline;
  }

  return null;
}
