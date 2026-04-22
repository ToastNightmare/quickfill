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
const SCAN_WIDTH = 800;
const SCAN_HEIGHT = 350;

// Line detection parameters
const MIN_LINE_LENGTH_H = 25; // minimum horizontal line length in pixels
const MIN_LINE_LENGTH_V = 10; // minimum vertical line length in pixels
const GAP_TOLERANCE = 8; // allow small gaps in lines (dotted/dashed borders)

// Box validation
const MIN_BOX_HEIGHT = 8;
const MAX_BOX_HEIGHT = 200; // raised to catch tall cells in any form
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
  // Use relaxed clustering for vertical lines (accept single dividers)
  // when we have strong horizontal structure (3+ row lines)
  const vMinMembers = hClusters.length >= 3 ? 1 : 2;
  const vClusters = clusterByValue(vLines.map((l) => l.x), 4, vMinMembers);

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
function clusterByValue(values: number[], tolerance: number, minMembers = 2): number[] {
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

  return clusters
    .filter((c) => c.length >= minMembers)
    .map((c) => Math.round(c.reduce((a, b) => a + b, 0) / c.length));
}

/**
 * Segment large boxes that contain internal vertical dividers into sub-cells.
 * If a box spans multiple columns (has vertical lines running through it),
 * split into individual cell-sized regions and prefer those over the parent.
 */
function segmentByInternalDividers(
  boxes: SnapResult[],
  vLines: VLine[],
): SnapResult[] {
  const result: SnapResult[] = [];

  for (const box of boxes) {
    // Find vertical lines that run inside this box (not at its edges)
    const interiorVLines: number[] = [];
    const edgeTolerance = 8;

    for (const vl of vLines) {
      // Line must be interior (not at the left/right edge)
      if (vl.x <= box.x + edgeTolerance) continue;
      if (vl.x >= box.x + box.width - edgeTolerance) continue;
      // Line must span most of the box height
      if (vl.y1 > box.y + box.height * 0.3) continue;
      if (vl.y2 < box.y + box.height * 0.7) continue;
      interiorVLines.push(vl.x);
    }

    if (interiorVLines.length === 0) {
      // No interior dividers, keep original
      result.push(box);
      continue;
    }

    // Deduplicate nearby interior lines
    const dividers = deduplicateValues(interiorVLines, 6);
    dividers.sort((a, b) => a - b);

    // Build sub-cells from left edge through dividers to right edge
    const edges = [box.x, ...dividers, box.x + box.width];
    let addedCells = false;

    for (let i = 0; i < edges.length - 1; i++) {
      const cellX = edges[i];
      const cellW = edges[i + 1] - edges[i];
      if (cellW < MIN_BOX_WIDTH) continue;
      result.push({ x: cellX, y: box.y, width: cellW, height: box.height });
      addedCells = true;
    }

    // If segmentation produced no valid cells, keep original
    if (!addedCells) {
      result.push(box);
    }
  }

  return result;
}

/**
 * Segment tall boxes that contain internal horizontal dividers into sub-rows.
 * Mirror of segmentByInternalDividers but for horizontal lines.
 */
function segmentByInternalHorizontalDividers(
  boxes: SnapResult[],
  hLines: HLine[],
): SnapResult[] {
  const result: SnapResult[] = [];

  for (const box of boxes) {
    // Only try to split boxes taller than ~1.8x a typical row height
    if (box.height < MIN_BOX_HEIGHT * 3) {
      result.push(box);
      continue;
    }

    const interiorHLines: number[] = [];
    const edgeTolerance = 6;

    for (const hl of hLines) {
      // Line must be interior (not at top/bottom edge)
      if (hl.y <= box.y + edgeTolerance) continue;
      if (hl.y >= box.y + box.height - edgeTolerance) continue;
      // Line must span most of the box width
      if (hl.x1 > box.x + box.width * 0.3) continue;
      if (hl.x2 < box.x + box.width * 0.7) continue;
      interiorHLines.push(hl.y);
    }

    if (interiorHLines.length === 0) {
      result.push(box);
      continue;
    }

    const dividers = deduplicateValues(interiorHLines, 4);
    dividers.sort((a, b) => a - b);

    const edges = [box.y, ...dividers, box.y + box.height];
    let addedCells = false;

    for (let i = 0; i < edges.length - 1; i++) {
      const cellY = edges[i];
      const cellH = edges[i + 1] - edges[i];
      if (cellH < MIN_BOX_HEIGHT) continue;
      result.push({ x: box.x, y: cellY, width: box.width, height: cellH });
      addedCells = true;
    }

    if (!addedCells) result.push(box);
  }

  return result;
}

/** Deduplicate a sorted list of numeric values within a tolerance. */
function deduplicateValues(values: number[], tolerance: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const deduped: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - deduped[deduped.length - 1] > tolerance) {
      deduped.push(sorted[i]);
    }
  }
  return deduped;
}

/**
 * Check if a box has a white/near-white interior (i.e. it's an input field, not a label cell).
 * Samples a grid of pixels inside the box. Returns true if the interior is white enough.
 */
export function isWhiteInterior(
  data: Uint8ClampedArray,
  canvasWidth: number,
  box: SnapResult,
  offsetX = 0,
  offsetY = 0,
): boolean {
  const insetX = Math.max(2, box.width * 0.08);
  const insetY = Math.max(2, box.height * 0.15);
  const x1 = Math.floor(box.x - offsetX + insetX);
  const y1 = Math.floor(box.y - offsetY + insetY);
  const x2 = Math.floor(box.x - offsetX + box.width - insetX);
  const y2 = Math.floor(box.y - offsetY + box.height - insetY);

  if (x2 <= x1 || y2 <= y1) return true; // Too small to check, assume white

  let totalBrightness = 0;
  let samples = 0;
  const stepX = Math.max(1, Math.floor((x2 - x1) / 6));
  const stepY = Math.max(1, Math.floor((y2 - y1) / 4));

  for (let y = y1; y <= y2; y += stepY) {
    for (let x = x1; x <= x2; x += stepX) {
      const idx = (y * canvasWidth + x) * 4;
      if (idx < 0 || idx + 2 >= data.length) continue;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      totalBrightness += brightness;
      samples++;
    }
  }

  if (samples === 0) return true;
  const avgBrightness = totalBrightness / samples;
  // Input fields are white/near-white (>242). Light blue/grey label cells are darker.
  return avgBrightness > 242;
}

/**
 * Flood-fill based cell detection.
 * Scans outward from the click point along the exact centerlines until hitting
 * a dark border pixel. Works reliably for any border thickness including 1px.
 */
export function floodFillCell(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  startX: number,
  startY: number,
): SnapResult | null {
  // Pixel brightness at a point
  const brightness = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return 0;
    const idx = (y * canvasWidth + x) * 4;
    return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
  };

  // Find a light starting pixel near click (nudge up to 14px)
  let sx = startX;
  let sy = startY;
  if (brightness(sx, sy) < 210) {
    let found = false;
    for (let d = 1; d <= 14 && !found; d++) {
      for (const [dx, dy] of [[0,d],[0,-d],[d,0],[-d,0],[d,d],[-d,-d],[d,-d],[-d,d]]) {
        if (brightness(sx+dx, sy+dy) > 210) {
          sx += dx; sy += dy; found = true; break;
        }
      }
    }
    if (!found) return null;
  }

  // Push start point 4px away from any nearby border to avoid edge instability
  // This prevents the scan from starting on anti-aliased border pixels
  const PUSH = 4;
  if (brightness(sx - PUSH, sy) > 210) sx = sx; // already fine
  // Find a stable interior point by moving toward the center of the white region
  for (let attempt = 0; attempt < 3; attempt++) {
    const bL = brightness(sx - 2, sy);
    const bR = brightness(sx + 2, sy);
    const bT = brightness(sx, sy - 2);
    const bB = brightness(sx, sy + 2);
    if (bL < 180 && bR > 210) { sx += 3; continue; }
    if (bR < 180 && bL > 210) { sx -= 3; continue; }
    if (bT < 180 && bB > 210) { sy += 3; continue; }
    if (bB < 180 && bT > 210) { sy -= 3; continue; }
    break;
  }

  // Reject shaded/coloured cells (label cells, headers)
  // Sample a 5x5 area to get reliable brightness reading
  let avgBr = 0;
  let brSamples = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const b = brightness(sx + dx, sy + dy);
      if (b > 0) { avgBr += b; brSamples++; }
    }
  }
  if (brSamples > 0 && avgBr / brSamples < 234) return null;

  // Border threshold — catches both solid and anti-aliased lines
  const BORDER = 175;

  // Scan a single line from a point outward until hitting a dark pixel.
  // Returns the number of steps taken (distance to border).
  const scanLine = (
    fromX: number, fromY: number,
    dx: number, dy: number,
    maxSteps: number
  ): number => {
    for (let i = 1; i <= maxSteps; i++) {
      const x = fromX + dx * i;
      const y = fromY + dy * i;
      if (brightness(x, y) < BORDER) return i - 1;
    }
    return maxSteps;
  };

  const maxHoriz = 1200;
  const maxVert  = 400;

  // Step 1: Find vertical bounds using center column + ±3px neighbours
  // This gives us the actual row height before we scan horizontally
  let minTop    = maxVert;
  let minBottom = maxVert;
  for (const xOff of [-3, 0, 3]) {
    const scanX = sx + xOff;
    if (scanX >= 0 && scanX < canvasWidth) {
      minTop    = Math.min(minTop,    scanLine(scanX, sy, 0, -1, maxVert));
      minBottom = Math.min(minBottom, scanLine(scanX, sy, 0,  1, maxVert));
    }
  }

  // Step 2: Calculate proportional offsets WITHIN the detected row
  // This ensures horizontal scans never cross into adjacent rows
  const rowTop    = sy - minTop;
  const rowBottom = sy + minBottom;
  const rowHeight = rowBottom - rowTop;

  // Use 5 scanlines at 15%, 30%, 50%, 70%, 85% of row height
  const yOffsets = rowHeight > 4
    ? [
        rowTop + Math.round(rowHeight * 0.15) - sy,
        rowTop + Math.round(rowHeight * 0.30) - sy,
        0,
        rowTop + Math.round(rowHeight * 0.70) - sy,
        rowTop + Math.round(rowHeight * 0.85) - sy,
      ]
    : [0];

  // Step 3: Scan horizontally at each Y offset within the row
  // Collect all measurements then use majority vote to pick boundary
  const leftMeasures:  number[] = [];
  const rightMeasures: number[] = [];
  for (const yOff of yOffsets) {
    const scanY = sy + yOff;
    if (scanY >= 0 && scanY < canvasHeight) {
      leftMeasures.push(scanLine(sx, scanY, -1, 0, maxHoriz));
      rightMeasures.push(scanLine(sx, scanY,  1, 0, maxHoriz));
    }
  }

  // Sort measurements and pick the MEDIAN value.
  // Median is robust — phantom lines that stop a minority of scans early
  // get outvoted by the majority that reach the real border.
  const median = (arr: number[]) => {
    if (arr.length === 0) return maxHoriz;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
  };

  const medLeft  = median(leftMeasures);
  const medRight = median(rightMeasures);

  // Also check: if the boundary at median has low row-coverage (phantom line),
  // use the maximum instead of median
  const checkBoundaryX = (boundaryDist: number, direction: 1 | -1): number => {
    const boundX = sx + direction * boundaryDist;
    if (boundX < 1 || boundX >= canvasWidth - 1) return boundaryDist;
    let darkInRow = 0;
    const checkStep = Math.max(1, Math.round(rowHeight / 8));
    let checked = 0;
    for (let y = rowTop + 1; y < rowBottom; y += checkStep) {
      if (brightness(boundX, y) < BORDER) darkInRow++;
      checked++;
    }
    const darkFraction = checked > 0 ? darkInRow / checked : 1;
    if (darkFraction < 0.4) {
      // Phantom line — use the maximum boundary (widest scan)
      const maxMeasure = direction === 1
        ? Math.max(...rightMeasures)
        : Math.max(...leftMeasures);
      return maxMeasure;
    }
    return boundaryDist;
  };

  const finalLeft  = checkBoundaryX(medLeft,  -1);
  const finalRight = checkBoundaryX(medRight,  1);

  const left   = sx - finalLeft;
  const right  = sx + finalRight;
  const top    = rowTop;
  const bottom = rowBottom;

  const w = right - left;
  const h = bottom - top;

  if (w < MIN_BOX_WIDTH || h < MIN_BOX_HEIGHT) return null;
  if (h > MAX_BOX_HEIGHT) return null;

  // Reject abnormally wide boxes that likely span multiple columns
  // Single cells can be wide (Name, Address) but not beyond 6:1 ratio
  const aspectRatio = w / Math.max(h, 1);
  if (aspectRatio > 6) return null;

  return { x: left, y: top, width: w, height: h };
}

/**
 * Score how "credible" a box is as an individual form field.
 * Lower score = more credible. Strongly prefers smallest containing box.
 * Wide row-spanning boxes get heavily penalised.
 */
export { fieldCredibilityScore as snapCredibilityScore };
function fieldCredibilityScore(box: SnapResult): number {
  const area = box.width * box.height;
  const aspectRatio = box.width / Math.max(box.height, 1);

  let score = area; // base: smaller area = better

  // Strong exponential penalty for wide boxes (row-spanning detected as one box)
  if (box.width > 300) {
    const excess = box.width - 300;
    score += Math.pow(excess, 2) * 8;
  }
  // Hard penalty for very wide boxes
  if (box.width > 450) score += (box.width - 450) * 3000;

  // Penalize extreme aspect ratios more aggressively (very wide and short = full row span)
  if (aspectRatio > 5) score += Math.pow(aspectRatio - 5, 2) * 3500;

  // Reward boxes in typical input field range (single cell)
  if (box.width >= 30 && box.width <= 300 && box.height >= 10 && box.height <= 80) {
    score *= 0.25; // strong reward for well-sized single cells
  }

  return score;
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

  // --- Strategy 0: Flood-fill cell detection (primary, most accurate) ---
  // Directly finds the white region around the click point
  const floodResult = floodFillCell(data, sw, sh, relClickX, relClickY);
  if (floodResult) {
    return offsetResult(floodResult, sx, sy);
  }

  // --- Fallback: Line-based detection (for underline fields and AcroForms) ---
  // Try with primary (dark) threshold first, then medium threshold
  for (const darkFn of [isDark, isMedium]) {
    const hLinesRaw = findHorizontalLines(data, sw, sh, darkFn);
    const vLinesRaw = findVerticalLines(data, sw, sh, darkFn);

    const hLines = mergeHLines(hLinesRaw);
    const vLines = mergeVLines(vLinesRaw);

    hLines.sort((a, b) => a.y - b.y);
    vLines.sort((a, b) => a.x - b.x);

    // Helper: filter boxes to only white-interior (input) cells
    const whiteOnly = (boxes: SnapResult[]) =>
      boxes.filter((b) => isWhiteInterior(data, sw, b, 0, 0));

    // Helper: full segmentation — vertical then horizontal
    const segment = (boxes: SnapResult[]) =>
      segmentByInternalHorizontalDividers(
        segmentByInternalDividers(boxes, vLines),
        hLines,
      );

    // --- Strategy 1: Full rectangle detection (with segmentation) ---
    const fullBoxesRaw = findFullRectangles(hLines, vLines, relClickX, relClickY);
    const fullBoxesAll = segment(fullBoxesRaw);
    const fullBoxes = whiteOnly(fullBoxesAll);
    if (fullBoxes.length > 0) {
      const candidates = fullBoxes.filter((box) =>
        relClickX >= box.x - 10 &&
        relClickX <= box.x + box.width + 10 &&
        relClickY >= box.y - 10 &&
        relClickY <= box.y + box.height + 10
      );
      if (candidates.length > 0) {
        candidates.sort((a, b) => fieldCredibilityScore(a) - fieldCredibilityScore(b));
        return offsetResult(candidates[0], sx, sy);
      }
      fullBoxes.sort((a, b) => fieldCredibilityScore(a) - fieldCredibilityScore(b));
      return offsetResult(fullBoxes[0], sx, sy);
    }

    // --- Strategy 2: 3-sided box detection (with segmentation) ---
    const threeBoxesRaw = findThreeSidedBoxes(hLines, vLines, relClickX, relClickY);
    const threeBoxesAll = segment(threeBoxesRaw);
    const threeBoxes = whiteOnly(threeBoxesAll);
    if (threeBoxes.length > 0) {
      const candidates = threeBoxes.filter((box) =>
        relClickX >= box.x - 10 &&
        relClickX <= box.x + box.width + 10 &&
        relClickY >= box.y - 10 &&
        relClickY <= box.y + box.height + 10
      );
      if (candidates.length > 0) {
        candidates.sort((a, b) => fieldCredibilityScore(a) - fieldCredibilityScore(b));
        return offsetResult(candidates[0], sx, sy);
      }
    }

    // --- Strategy 3: Table cell detection ---
    const allCells = findTableCells(hLines, vLines);
    const cells = whiteOnly(allCells);
    if (cells.length > 0) {
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

    // Helper: only keep white-interior boxes (input fields, not label cells)
    const whiteOnly = (boxes: SnapResult[]) =>
      boxes.filter((b) => isWhiteInterior(data, w, b, 0, 0));

    // Helper: full segmentation — vertical then horizontal
    const segment = (boxes: SnapResult[]) =>
      segmentByInternalHorizontalDividers(
        segmentByInternalDividers(boxes, vLines),
        hLines,
      );

    // Full rectangles (no click constraint)
    const fullBoxes = findFullRectangles(hLines, vLines);
    const segmented = whiteOnly(segment(fullBoxes));
    allBoxes.push(...segmented);

    // 3-sided boxes (also segment these)
    const threeBoxes = findThreeSidedBoxes(hLines, vLines);
    const segmented3 = whiteOnly(segment(threeBoxes));
    allBoxes.push(...segmented3);

    // Table cells (already cell-sized, no segmentation needed)
    const cells = whiteOnly(findTableCells(hLines, vLines));
    allBoxes.push(...cells);

    // If dark threshold found boxes, skip medium pass
    if (allBoxes.length > 0) break;
  }

  // Deduplicate overlapping boxes (prefer smaller, more precise children)
  return deduplicateBoxes(allBoxes);
}

/**
 * Remove boxes that are dominated by smaller, more precise boxes.
 *
 * Two removal strategies:
 * 1. Near-duplicate: if a smaller box already covers >70% of this box, skip it
 * 2. Parent container: if a large box is mostly covered by the union of smaller
 *    boxes inside it (>60% coverage), remove it in favor of its children
 */
function deduplicateBoxes(boxes: SnapResult[]): SnapResult[] {
  if (boxes.length <= 1) return boxes;

  // Sort by area ascending (smallest first)
  const sorted = [...boxes].sort((a, b) => a.width * a.height - b.width * b.height);
  const kept: SnapResult[] = [];

  for (const box of sorted) {
    const boxArea = box.width * box.height;

    // Strategy 1: skip if a smaller existing box already covers most of this box
    const nearDuplicate = kept.some((existing) => {
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
      return existingArea > 0 && overlapArea / existingArea > 0.7;
    });

    if (nearDuplicate) continue;

    // Strategy 2: check if children (smaller kept boxes inside this one) cover it
    const children = kept.filter((child) => {
      return (
        child.x >= box.x - 4 &&
        child.y >= box.y - 4 &&
        child.x + child.width <= box.x + box.width + 4 &&
        child.y + child.height <= box.y + box.height + 4
      );
    });

    if (children.length >= 2) {
      // Approximate union coverage of children within this box
      const childAreaSum = children.reduce((s, c) => s + c.width * c.height, 0);
      if (childAreaSum / boxArea > 0.6) {
        // Children cover most of this parent box, skip it
        continue;
      }
    }

    kept.push(box);
  }

  return kept;
}

/**
 * Detect comb cell spacing from a region of the PDF.
 * Scans for a row of equally-spaced vertical dividers and returns:
 * - cellWidth: the average width of each cell
 * - cellCount: the number of cells detected
 * - x, y, width, height: the bounding box of the detected comb row
 * - firstCellX: the X position of the first cell's left edge (for precise alignment)
 * - cellBoundaries: array of X positions for each cell's left edge
 * - cellCenters: array of X positions for each cell's center (for character placement)
 * - cellWidths: array of individual cell widths (for non-uniform spacing like TFN)
 * 
 * Returns null if no comb pattern is detected.
 */
export interface CombDetectResult {
  cellWidth: number;
  cellCount: number;
  x: number;
  y: number;
  width: number;
  height: number;
  firstCellX: number; // X position of first cell's left edge in canvas coordinates
  cellBoundaries: number[]; // X positions of each cell's left edge
  cellCenters: number[]; // X positions of each cell's center for character placement
  cellWidths: number[]; // Width of each individual cell (handles gaps)
}

export function detectCombCells(
  canvas: HTMLCanvasElement,
  regionX: number,
  regionY: number,
  regionWidth: number,
  regionHeight: number,
): CombDetectResult | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Clamp region to canvas bounds
  const x1 = Math.max(0, Math.floor(regionX));
  const y1 = Math.max(0, Math.floor(regionY));
  const x2 = Math.min(canvas.width, Math.ceil(regionX + regionWidth));
  const y2 = Math.min(canvas.height, Math.ceil(regionY + regionHeight));
  const w = x2 - x1;
  const h = y2 - y1;

  if (w < 30 || h < 10) return null;

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(x1, y1, w, h);
  } catch {
    return null;
  }

  const { data } = imageData;

  // NEW: Scan vertical columns to find potential cell dividers
  // This catches short dividers, "/" separators, or any dark pixels that indicate cell boundaries
  const columnDarkness: number[] = new Array(w).fill(0);
  const columnDarkCount: number[] = new Array(w).fill(0);
  
  for (let x = 0; x < w; x++) {
    let darkPixels = 0;
    let totalPixels = 0;
    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < 180) { // Dark pixel threshold
        darkPixels++;
      }
      totalPixels++;
    }
    columnDarkness[x] = darkPixels / totalPixels;
    columnDarkCount[x] = darkPixels;
  }
  
  // Find vertical dividers by looking for columns with significant dark pixels
  // A divider should have dark pixels spanning a reasonable portion of the height
  const potentialDividers: number[] = [];
  const dividerMinHeight = h * 0.25; // At least 25% of height
  let inDivider = false;
  let dividerStart = 0;
  
  for (let x = 0; x < w; x++) {
    if (columnDarkCount[x] >= dividerMinHeight && columnDarkness[x] > 0.3) {
      if (!inDivider) {
        inDivider = true;
        dividerStart = x;
      }
    } else if (inDivider) {
      // End of divider - record the center
      const dividerEnd = x;
      const dividerCenter = Math.floor((dividerStart + dividerEnd) / 2);
      potentialDividers.push(dividerCenter);
      inDivider = false;
    }
  }
  // Handle divider at the end
  if (inDivider) {
    const dividerCenter = Math.floor((dividerStart + w) / 2);
    potentialDividers.push(dividerCenter);
  }
  
  // Also find vertical lines using the standard method
  const vLines = findVerticalLines(data, w, h, isDark);
  let dividerLines: VLine[];
  
  if (vLines.length >= 2) {
    // Use standard vertical lines if we found enough
    const merged = mergeVLines(vLines);
    merged.sort((a, b) => a.x - b.x);
    
    // Filter to lines that span at least 25% of the region height
    const minSpan = h * 0.25;
    dividerLines = merged.filter((v) => v.y2 - v.y1 >= minSpan);
  } else {
    // Fall back to column-based dividers
    dividerLines = potentialDividers.map(x => ({
      x,
      y1: Math.floor(h * 0.2),
      y2: Math.floor(h * 0.8),
    }));
  }
  
  if (dividerLines.length < 2) {
    // Not enough dividers to detect cells
    return null;
  }

  // Calculate gaps between consecutive vertical lines
  const gaps: number[] = [];
  for (let i = 1; i < dividerLines.length; i++) {
    gaps.push(dividerLines[i].x - dividerLines[i - 1].x);
  }

  if (gaps.length === 0) return null;

  // Find the most common gap (cell width) - allow 3px tolerance
  const gapCounts = new Map<number, number>();
  for (const gap of gaps) {
    // Round to nearest 2px for grouping
    const rounded = Math.round(gap / 2) * 2;
    gapCounts.set(rounded, (gapCounts.get(rounded) || 0) + 1);
  }

  let bestGap = 0;
  let bestCount = 0;
  for (const [gap, count] of gapCounts) {
    if (count > bestCount && gap >= 10 && gap <= 60) {
      bestGap = gap;
      bestCount = count;
    }
  }

  if (bestGap === 0 || bestCount < 2) {
    // No consistent cell width found - might be irregular spacing
    // Fall back to using average gap
    bestGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    bestCount = dividerLines.length - 1;
  }

  // Count cells with this gap width (tolerance of 4px)
  let cellCount = 1;
  let firstX = dividerLines[0].x;
  let lastX = dividerLines[0].x;

  for (let i = 1; i < dividerLines.length; i++) {
    const gap = dividerLines[i].x - dividerLines[i - 1].x;
    if (Math.abs(gap - bestGap) <= 4) {
      cellCount++;
      lastX = dividerLines[i].x;
    }
  }

  // Find the vertical extent of the cells
  let minY = h;
  let maxY = 0;
  for (const line of dividerLines) {
    minY = Math.min(minY, line.y1);
    maxY = Math.max(maxY, line.y2);
  }

  // Build arrays of cell boundaries, centers, and widths
  // This handles non-uniform spacing (like TFN fields with gaps between groups)
  
  // First pass: collect all potential cells
  const allCells: { left: number; center: number; width: number }[] = [];
  for (let i = 0; i < dividerLines.length - 1; i++) {
    const leftEdge = x1 + dividerLines[i].x;
    const rightEdge = x1 + dividerLines[i + 1].x;
    const width = rightEdge - leftEdge;
    
    if (width >= 8 && width <= 80) {
      allCells.push({ left: leftEdge, center: leftEdge + width / 2, width });
    }
  }
  
  if (allCells.length === 0) {
    // Fall back to uniform spacing
    const cellBoundaries: number[] = [];
    const cellCenters: number[] = [];
    const cellWidths: number[] = [];
    return {
      cellWidth: bestGap,
      cellCount: cellCount,
      x: x1 + firstX,
      y: y1 + minY,
      width: lastX - firstX,
      height: maxY - minY,
      firstCellX: x1 + firstX,
      cellBoundaries,
      cellCenters,
      cellWidths,
    };
  }
  
  // Second pass: filter out gaps between groups
  // A gap is empty space WITHOUT box boundary lines (just whitespace or slash separators)
  // A cell group contains actual box lines even if narrow (like MM with 2 cells)
  // 
  // The original width-ratio filtering was too aggressive and incorrectly classified
  // narrow cell groups (like 2-cell MM) as gaps. Instead, we check if the region
  // has internal vertical box lines to determine if it is a cell group or a gap.
  
  const cellBoundaries: number[] = [];
  const cellCenters: number[] = [];
  const cellWidths: number[] = [];

  for (const cell of allCells) {
    // Check if this region contains internal box lines (dividers between cells)
    // by scanning for vertical dividers within the region boundaries
    let hasInternalDivider = false;
    for (const line of dividerLines) {
      const lineX = x1 + line.x;
      // Check for any divider strictly inside this region (not at the edges)
      if (lineX > cell.left + 2 && lineX < cell.left + cell.width - 2) {
        hasInternalDivider = true;
        break;
      }
    }
    
    // If region has internal dividers, it is definitely a cell group - keep it
    if (hasInternalDivider) {
      cellBoundaries.push(cell.left);
      cellCenters.push(cell.center);
      cellWidths.push(cell.width);
      continue;
    }
    
    // No internal divider found - this could be:
    // 1. A single cell (normal case)
    // 2. A gap between groups (empty space or slash separator area)
    //
    // To distinguish: check if the region width is consistent with typical cell widths
    // Gaps tend to be either very narrow (<10px) or unusually wide compared to cells
    // We use a more conservative threshold: only filter if width > 2x the median
    // This prevents filtering out valid cell groups while still catching large gaps
    
    const widths = allCells.map(c => c.width);
    widths.sort((a, b) => a - b);
    const medianWidth = widths[Math.floor(widths.length / 2)];
    
    // Only filter out regions that are clearly gaps (more than 2x typical cell width)
    // This is much more conservative than the original 1.35x threshold
    if (cell.width > medianWidth * 2.0) {
      continue; // Skip this gap
    }
    
    // Keep this region as a cell
    cellBoundaries.push(cell.left);
    cellCenters.push(cell.center);
    cellWidths.push(cell.width);
  }
  
  // If we found individual cells, use those; otherwise fall back to uniform detection
  const finalCellCount = cellBoundaries.length > 0 ? cellBoundaries.length : cellCount;
  const avgCellWidth = cellWidths.length > 0 
    ? cellWidths.reduce((a, b) => a + b, 0) / cellWidths.length 
    : bestGap;

  return {
    cellWidth: avgCellWidth,
    cellCount: finalCellCount,
    x: x1 + firstX,
    y: y1 + minY,
    width: lastX - firstX,
    height: maxY - minY,
    firstCellX: cellBoundaries.length > 0 ? cellBoundaries[0] : x1 + firstX,
    cellBoundaries: cellBoundaries,
    cellCenters: cellCenters,
    cellWidths: cellWidths,
  };
}
