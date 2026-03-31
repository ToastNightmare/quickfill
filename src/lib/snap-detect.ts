/**
 * Pixel-based form field boundary detection.
 * Scans a region of the PDF canvas around a click point to find
 * rectangular form boxes (input fields, lines) and returns snap coordinates.
 */

interface SnapResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DARK_THRESHOLD = 80; // pixel is "dark" if average RGB < this
const SCAN_WIDTH = 240;
const SCAN_HEIGHT = 80;
const MIN_LINE_LENGTH_H = 30; // minimum horizontal line length in pixels
const MIN_LINE_LENGTH_V = 15; // minimum vertical line length in pixels
const GAP_TOLERANCE = 4; // allow small gaps in lines
const PADDING = 4;

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

  if (hLines.length < 2 || vLines.length < 2) return null;

  // Sort horizontal lines by Y, vertical by X
  hLines.sort((a, b) => a.y - b.y);
  vLines.sort((a, b) => a.x - b.x);

  // Find the best rectangle: two horizontal lines (top/bottom) and two vertical lines (left/right)
  // that form a box containing the click point (relative to scan window)
  const relClickX = clickX - sx;
  const relClickY = clickY - sy;

  let bestBox: SnapResult | null = null;
  let bestArea = Infinity;

  for (let ti = 0; ti < hLines.length - 1; ti++) {
    const top = hLines[ti];
    if (top.y > relClickY) break; // top must be above click

    for (let bi = ti + 1; bi < hLines.length; bi++) {
      const bottom = hLines[bi];
      if (bottom.y < relClickY) continue; // bottom must be below click

      const boxHeight = bottom.y - top.y;
      if (boxHeight < 10 || boxHeight > 70) continue;

      // Check horizontal overlap
      const overlapX1 = Math.max(top.x1, bottom.x1);
      const overlapX2 = Math.min(top.x2, bottom.x2);
      if (overlapX2 - overlapX1 < MIN_LINE_LENGTH_H) continue;

      // Find left and right vertical lines within this horizontal range
      for (let li = 0; li < vLines.length; li++) {
        const left = vLines[li];
        if (left.x > relClickX) break;
        if (left.x < overlapX1 - 5 || left.x > overlapX1 + 5) continue;
        if (left.y1 > top.y + 3 || left.y2 < bottom.y - 3) continue;

        for (let ri = li + 1; ri < vLines.length; ri++) {
          const right = vLines[ri];
          if (right.x < relClickX) continue;
          if (right.x < overlapX2 - 5 || right.x > overlapX2 + 5) continue;
          if (right.y1 > top.y + 3 || right.y2 < bottom.y - 3) continue;

          const boxWidth = right.x - left.x;
          if (boxWidth < 20) continue;

          const area = boxWidth * boxHeight;
          if (area < bestArea) {
            bestArea = area;
            bestBox = {
              x: sx + left.x + PADDING,
              y: sy + top.y + PADDING,
              width: boxWidth - PADDING * 2,
              height: boxHeight - PADDING * 2,
            };
          }
        }
      }
    }
  }

  return bestBox;
}
