/**
 * Pixel-based form field boundary detection.
 * Scans a region of the PDF canvas around a click point to find
 * rectangular form boxes (input fields, lines, table cells) and returns snap coordinates.
 *
 * Supports:
 * - Full rectangles (4-sided boxes)
 * - 3-sided boxes (common in forms with open tops or shared borders)
 * - Underline-only form fields
 * - Table cells and grid patterns
 * - Full-page batch detection for pre-computed snap targets
 */

export interface SnapResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

// --- Tunable parameters ---

// Pixel is "dark" if average RGB < this. Raised from 100 to catch lighter
// gray borders common in government and scanned forms.
const DARK_THRESHOLD = 145;

// Also detect medium-gray lines (threshold for secondary pass)
const MEDIUM_THRESHOLD = 170;

// Scan window for click-time detection (wider + taller for better coverage)
const SCAN_WIDTH = 500;
const SCAN_HEIGHT = 180;

// Line detection parameters
const MIN_LINE_LENGTH_H = 25; // minimum horizontal line length in pixels
const MIN_LINE_LENGTH_V = 10; // minimum vertical line length in pixels
const GAP_TOLERANCE = 8; // allow small gaps in lines (dotted/dashed borders)

// Box validation
const MIN_BOX_HEIGHT = 8;
const MAX_BOX_HEIGHT = 120; // raised from 80 to catch taller fields
const MIN_BOX_WIDTH = 18;

// Underline defaults
const UNDERLINE_DEFAULT_HEIGHT = 28;
const UNDERLINE_MIN_LENGTH = 40; // lowered from 50

// Endpoint alignment tolerance for matching lines into boxes
const ENDPOINT_TOLERANCE = 14; // raised from 8 for looser matching

// Vertical line proximity tolerance for 3-sided box detection
const VLINE_PROXIMITY = 20;

function isDark(data: Uint8ClampedArray, index: number): boolean {
  return (data[index] + data[index + 1] + data[index + 2]) / 3 < DARK_THRESHOLD;
}

function isMedium(data: Uint8ClampedArray, index: number): boolean {
  return (data[index] + data[index + 1] + data[index + 2]) / 3 < MEDIUM_THRESHOLD;
}

interface HLine { y: number; x1: number; x2: number }
interface VLine { x: number; y1: number; y2: number }

/** Find continuous dark runs along a row, allowing small gaps. */
function findHorizontalLines(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  darkFn: (data: Uint8ClampedArray, index: number) => boolean = isDark,
): HLine[] {
  const lines: HLine[] = [];

  for (let row = 0; row < height; row++) {
    let runStart = -1;
    let gapCount = 0;

    for (let col = 0; col < width; col++) {
      const idx = (row * width + col) * 4;
      if (darkFn(data, idx)) {
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
  darkFn: (data: Uint8ClampedArray, index: number) => boolean = isDark,
): VLine[] {
  const lines: VLine[] = [];

  for (let col = 0; col < width; col++) {
    let runStart = -1;
    let gapCount = 0;

    for (let row = 0; row < height; row++) {
      const idx = (row * width + col) * 4;
      if (darkFn(data, idx)) {
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
 * Merge nearby horizontal lines on the same row into single lines.
 * Many forms have double-pixel or slightly offset border lines.
 */
function mergeHLines(lines: HLine[], yTolerance = 3): HLine[] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x1 - b.x1);
  const merged: HLine[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    // Same row band and overlapping/adjacent x range
    if (
      Math.abs(cur.y - prev.y) <= yTolerance &&
      cur.x1 <= prev.x2 + GAP_TOLERANCE + 2
    ) {
      prev.x2 = Math.max(prev.x2, cur.x2);
      prev.y = Math.round((prev.y + cur.y) / 2);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/** Merge nearby vertical lines on the same column. */
function mergeVLines(lines: VLine[], xTolerance = 3): VLine[] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort((a, b) => a.x - b.x || a.y1 - b.y1);
  const merged: VLine[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (
      Math.abs(cur.x - prev.x) <= xTolerance &&
      cur.y1 <= prev.y2 + GAP_TOLERANCE + 2
    ) {
      prev.y2 = Math.max(prev.y2, cur.y2);
      prev.x = Math.round((prev.x + cur.x) / 2);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/**
 * Try to find 4-sided rectangular boxes from horizontal and vertical lines.
 * Returns boxes sorted by area (smallest first = most precise).
 */
function findFullRectangles(
  hLines: HLine[],
  vLines: VLine[],
  relClickX?: number,
  relClickY?: number,
): SnapResult[] {
  const boxes: (SnapResult & { area: number })[] = [];

  if (hLines.length < 2 || vLines.length < 2) return [];

  for (let ti = 0; ti < hLines.length - 1; ti++) {
    const top = hLines[ti];
    if (relClickY !== undefined && top.y > relClickY + 5) break;

    for (let bi = ti + 1; bi < hLines.length; bi++) {
      const bottom = hLines[bi];
      if (relClickY !== undefined && bottom.y < relClickY - 5) continue;

      const boxHeight = bottom.y - top.y;
      if (boxHeight < MIN_BOX_HEIGHT || boxHeight > MAX_BOX_HEIGHT) continue;

      const overlapX1 = Math.max(top.x1, bottom.x1);
      const overlapX2 = Math.min(top.x2, bottom.x2);
      if (overlapX2 - overlapX1 < MIN_LINE_LENGTH_H) continue;

      for (let li = 0; li < vLines.length; li++) {
        const left = vLines[li];
        if (relClickX !== undefined && left.x > relClickX + 5) break;
        if (left.x < overlapX1 - ENDPOINT_TOLERANCE || left.x > overlapX1 + ENDPOINT_TOLERANCE) continue;
        if (left.y1 > top.y + 8 || left.y2 < bottom.y - 8) continue;

        for (let ri = li + 1; ri < vLines.length; ri++) {
          const right = vLines[ri];
          if (relClickX !== undefined && right.x < relClickX - 5) continue;
          if (right.x < overlapX2 - ENDPOINT_TOLERANCE || right.x > overlapX2 + ENDPOINT_TOLERANCE) continue;
          if (right.y1 > top.y + 8 || right.y2 < bottom.y - 8) continue;

          const boxWidth = right.x - left.x;
          if (boxWidth < MIN_BOX_WIDTH) continue;

          const area = boxWidth * boxHeight;
          boxes.push({
            x: left.x,
            y: top.y,
            width: boxWidth,
            height: boxHeight,
            area,
          });
        }
      }
    }
  }

  boxes.sort((a, b) => a.area - b.area);
  return boxes;
}

/**
 * Detect 3-sided boxes (top + bottom + one side, or top + bottom with inferred width).
 * Many PDF forms have shared vertical borders or open-ended field areas.
 */
function findThreeSidedBoxes(
  hLines: HLine[],
  vLines: VLine[],
  relClickX?: number,
  relClickY?: number,
): SnapResult[] {
  const boxes: (SnapResult & { area: number })[] = [];

  if (hLines.length < 2) return [];

  for (let ti = 0; ti < hLines.length - 1; ti++) {
    const top = hLines[ti];
    if (relClickY !== undefined && top.y > relClickY + 5) break;

    for (let bi = ti + 1; bi < hLines.length; bi++) {
      const bottom = hLines[bi];
      if (relClickY !== undefined && bottom.y < relClickY - 5) continue;

      const boxHeight = bottom.y - top.y;
      if (boxHeight < MIN_BOX_HEIGHT || boxHeight > MAX_BOX_HEIGHT) continue;

      // Find X overlap between top and bottom lines
      const overlapX1 = Math.max(top.x1, bottom.x1);
      const overlapX2 = Math.min(top.x2, bottom.x2);
      if (overlapX2 - overlapX1 < MIN_BOX_WIDTH) continue;

      // Check if click X is within overlap range
      if (relClickX !== undefined && (relClickX < overlapX1 - 10 || relClickX > overlapX2 + 10)) continue;

      // Find any vertical line near the left edge
      const hasLeft = vLines.some(
        (v) =>
          Math.abs(v.x - overlapX1) < VLINE_PROXIMITY &&
          v.y1 <= top.y + 8 &&
          v.y2 >= bottom.y - 8,
      );

      // Find any vertical line near the right edge
      const hasRight = vLines.some(
        (v) =>
          Math.abs(v.x - overlapX2) < VLINE_PROXIMITY &&
          v.y1 <= top.y + 8 &&
          v.y2 >= bottom.y - 8,
      );

      // Need at least one vertical side (or both top+bottom matching closely)
      if (!hasLeft && !hasRight) {
        // Still allow if top and bottom lines align very closely (within 5px on both ends)
        if (Math.abs(top.x1 - bottom.x1) > 5 || Math.abs(top.x2 - bottom.x2) > 5) {
          continue;
        }
      }

      const boxWidth = overlapX2 - overlapX1;
      if (boxWidth < MIN_BOX_WIDTH) continue;

      const area = boxWidth * boxHeight;
      boxes.push({
        x: overlapX1,
        y: top.y,
        width: boxWidth,
        height: boxHeight,
        area,
      });
    }
  }

  boxes.sort((a, b) => a.area - b.area);
  return boxes;
}

/**
 * Detect table cells from a grid of aligned horizontal and vertical lines.
 * Returns individual cell rectangles.
 */
function findTableCells(
  hLines: HLine[],
  vLines: VLine[],
): SnapResult[] {
  // Find clusters of horizontal lines at similar Y positions
  const hClusters = clusterByValue(hLines.map((l) => l.y), 4);
  const vClusters = clusterByValue(vLines.map((l) => l.x), 4);

  // Need at least 2 horizontal and 2 vertical line clusters for a grid
  if (hClusters.length < 2 || vClusters.length < 2) return [];

  const cells: SnapResult[] = [];

  for (let hi = 0; hi < hClusters.length - 1; hi++) {
    for (let vi = 0; vi < vClusters.length - 1; vi++) {
      const top = hClusters[hi];
      const bottom = hClusters[hi + 1];
      const left = vClusters[vi];
      const right = vClusters[vi + 1];

      const height = bottom - top;
      const width = right - left;

      if (height < MIN_BOX_HEIGHT || height > MAX_BOX_HEIGHT) continue;
      if (width < MIN_BOX_WIDTH) continue;

      // Verify lines actually exist in these positions
      const hasTop = hLines.some(
        (l) => Math.abs(l.y - top) <= 4 && l.x1 <= left + 10 && l.x2 >= right - 10,
      );
      const hasBottom = hLines.some(
        (l) => Math.abs(l.y - bottom) <= 4 && l.x1 <= left + 10 && l.x2 >= right - 10,
      );
      const hasLeft = vLines.some(
        (l) => Math.abs(l.x - left) <= 4 && l.y1 <= top + 5 && l.y2 >= bottom - 5,
      );
      const hasRight = vLines.some(
        (l) => Math.abs(l.x - right) <= 4 && l.y1 <= top + 5 && l.y2 >= bottom - 5,
      );

      // Need at least 3 sides for a valid cell
      const sides = [hasTop, hasBottom, hasLeft, hasRight].filter(Boolean).length;
      if (sides >= 3) {
        cells.push({ x: left, y: top, width, height });
      }
    }
  }

  return cells;
}

/** Cluster numeric values within a tolerance, returning the average of each cluster. */
function clusterByValue(values: number[], tolerance: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    if (sorted[i] - last[last.length - 1] <= tolerance) {
      last.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }

  // Return average of each cluster, but only clusters with 2+ members (real grid lines repeat)
  return clusters
    .filter((c) => c.length >= 2)
    .map((c) => Math.round(c.reduce((a, b) => a + b, 0) / c.length));
}

/**
 * Try to detect a rectangular form box around the click point.
 * Returns snap coordinates (in canvas pixel space) or null if no box found.
 *
 * Detection strategies (in order):
 * 1. Full rectangles (4-sided boxes)
 * 2. 3-sided boxes (top + bottom + at least one side)
 * 3. Table cells (grid intersection)
 * 4. Underline-only form fields
 *
 * If primary dark threshold finds nothing, retries with a lighter threshold
 * to catch medium-gray borders.
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
  const relClickX = clickX - sx;
  const relClickY = clickY - sy;

  // Try with primary (dark) threshold first, then medium threshold
  for (const darkFn of [isDark, isMedium]) {
    const hLinesRaw = findHorizontalLines(data, sw, sh, darkFn);
    const vLinesRaw = findVerticalLines(data, sw, sh, darkFn);

    const hLines = mergeHLines(hLinesRaw);
    const vLines = mergeVLines(vLinesRaw);

    hLines.sort((a, b) => a.y - b.y);
    vLines.sort((a, b) => a.x - b.x);

    // --- Strategy 1: Full rectangle detection ---
    const fullBoxes = findFullRectangles(hLines, vLines, relClickX, relClickY);
    if (fullBoxes.length > 0) {
      // Pick the smallest box that contains or is near the click
      for (const box of fullBoxes) {
        if (
          relClickX >= box.x - 10 &&
          relClickX <= box.x + box.width + 10 &&
          relClickY >= box.y - 10 &&
          relClickY <= box.y + box.height + 10
        ) {
          return offsetResult(box, sx, sy);
        }
      }
      // If no box contains click, return the smallest anyway
      return offsetResult(fullBoxes[0], sx, sy);
    }

    // --- Strategy 2: 3-sided box detection ---
    const threeBoxes = findThreeSidedBoxes(hLines, vLines, relClickX, relClickY);
    if (threeBoxes.length > 0) {
      for (const box of threeBoxes) {
        if (
          relClickX >= box.x - 10 &&
          relClickX <= box.x + box.width + 10 &&
          relClickY >= box.y - 10 &&
          relClickY <= box.y + box.height + 10
        ) {
          return offsetResult(box, sx, sy);
        }
      }
    }

    // --- Strategy 3: Table cell detection ---
    const cells = findTableCells(hLines, vLines);
    if (cells.length > 0) {
      // Find the cell containing the click
      for (const cell of cells) {
        if (
          relClickX >= cell.x - 5 &&
          relClickX <= cell.x + cell.width + 5 &&
          relClickY >= cell.y - 5 &&
          relClickY <= cell.y + cell.height + 5
        ) {
          return offsetResult(cell, sx, sy);
        }
      }
    }

    // --- Strategy 4: Underline-only detection ---
    if (hLines.length > 0) {
      let bestUnderline: SnapResult | null = null;
      let bestDist = Infinity;

      for (const line of hLines) {
        const lineLen = line.x2 - line.x1;
        if (lineLen < UNDERLINE_MIN_LENGTH) continue;

        // Line should be at or below the click point (within tolerance)
        const dist = line.y - relClickY;
        if (dist < -10 || dist > 50) continue;

        // Click X should be within the line's span
        if (relClickX < line.x1 - 15 || relClickX > line.x2 + 15) continue;

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

    // If dark threshold found nothing, try medium threshold on next iteration
    if (darkFn === isDark) continue;
  }

  return null;
}

/** Offset a result from scan-window-local coordinates to canvas coordinates. */
function offsetResult(box: SnapResult, sx: number, sy: number): SnapResult {
  return { x: sx + box.x, y: sy + box.y, width: box.width, height: box.height };
}

/**
 * Batch-detect all form-like boxes on the entire visible canvas.
 * Returns an array of SnapResult in canvas pixel coordinates.
 *
 * This runs a full-page scan and is more expensive than per-click detection,
 * but provides pre-computed snap targets for hover previews and faster placement.
 *
 * Intended to be called once after PDF page render, not on every interaction.
 */
export function detectAllBoxes(canvas: HTMLCanvasElement): SnapResult[] {
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const w = canvas.width;
  const h = canvas.height;
  if (w < 20 || h < 20) return [];

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return [];
  }

  const { data } = imageData;
  const allBoxes: SnapResult[] = [];

  // Try both dark and medium thresholds
  for (const darkFn of [isDark, isMedium]) {
    const hLinesRaw = findHorizontalLines(data, w, h, darkFn);
    const vLinesRaw = findVerticalLines(data, w, h, darkFn);

    const hLines = mergeHLines(hLinesRaw);
    const vLines = mergeVLines(vLinesRaw);

    hLines.sort((a, b) => a.y - b.y);
    vLines.sort((a, b) => a.x - b.x);

    // Full rectangles (no click constraint)
    const fullBoxes = findFullRectangles(hLines, vLines);
    allBoxes.push(...fullBoxes);

    // 3-sided boxes
    const threeBoxes = findThreeSidedBoxes(hLines, vLines);
    allBoxes.push(...threeBoxes);

    // Table cells
    const cells = findTableCells(hLines, vLines);
    allBoxes.push(...cells);

    // If dark threshold found boxes, skip medium pass
    if (allBoxes.length > 0) break;
  }

  // Deduplicate overlapping boxes (keep the smaller/more precise one)
  return deduplicateBoxes(allBoxes);
}

/** Remove boxes that significantly overlap with a smaller box. */
function deduplicateBoxes(boxes: SnapResult[]): SnapResult[] {
  if (boxes.length <= 1) return boxes;

  // Sort by area ascending
  const sorted = [...boxes].sort((a, b) => a.width * a.height - b.width * b.height);
  const kept: SnapResult[] = [];

  for (const box of sorted) {
    const dominated = kept.some((existing) => {
      const overlapX = Math.max(
        0,
        Math.min(box.x + box.width, existing.x + existing.width) - Math.max(box.x, existing.x),
      );
      const overlapY = Math.max(
        0,
        Math.min(box.y + box.height, existing.y + existing.height) - Math.max(box.y, existing.y),
      );
      const overlapArea = overlapX * overlapY;
      const existingArea = existing.width * existing.height;
      // If >70% of the existing box overlaps with this one, skip it
      return existingArea > 0 && overlapArea / existingArea > 0.7;
    });

    if (!dominated) {
      kept.push(box);
    }
  }

  return kept;
}
