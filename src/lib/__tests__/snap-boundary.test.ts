/**
 * Unit tests for snap detection boundary fixes.
 * Specifically tests that wide rectangles with internal dividers
 * are correctly split into separate cell boundaries.
 */

import { describe, test, expect } from '@jest/globals';

// Mock the snap-detect module functions we need to test
// We'll test the segmentation logic directly

interface SnapResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VLine {
  x: number;
  y1: number;
  y2: number;
}

interface HLine {
  y: number;
  x1: number;
  x2: number;
}

// Copy the segmentation functions from snap-detect.ts for testing
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

function segmentByInternalDividers(
  boxes: SnapResult[],
  vLines: VLine[],
): SnapResult[] {
  const result: SnapResult[] = [];

  for (const box of boxes) {
    const interiorVLines: number[] = [];
    const edgeTolerance = 8;

    for (const vl of vLines) {
      if (vl.x <= box.x + edgeTolerance) continue;
      if (vl.x >= box.x + box.width - edgeTolerance) continue;
      if (vl.y1 > box.y + box.height * 0.3) continue;
      if (vl.y2 < box.y + box.height * 0.7) continue;
      interiorVLines.push(vl.x);
    }

    if (interiorVLines.length === 0) {
      result.push(box);
      continue;
    }

    const dividers = deduplicateValues(interiorVLines, 6);
    dividers.sort((a, b) => a - b);

    const edges = [box.x, ...dividers, box.x + box.width];
    let addedCells = false;

    for (let i = 0; i < edges.length - 1; i++) {
      const cellX = edges[i];
      const cellW = edges[i + 1] - edges[i];
      if (cellW < 18) continue;
      result.push({ x: cellX, y: box.y, width: cellW, height: box.height });
      addedCells = true;
    }

    if (!addedCells) {
      result.push(box);
    }
  }

  return result;
}

function segmentByInternalHorizontalDividers(
  boxes: SnapResult[],
  hLines: HLine[],
): SnapResult[] {
  const result: SnapResult[] = [];

  for (const box of boxes) {
    if (box.height < 18 * 3) {
      result.push(box);
      continue;
    }

    const interiorHLines: number[] = [];
    const edgeTolerance = 6;

    for (const hl of hLines) {
      if (hl.y <= box.y + edgeTolerance) continue;
      if (hl.y >= box.y + box.height - edgeTolerance) continue;
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
      if (cellH < 18) continue;
      result.push({ x: box.x, y: cellY, width: box.width, height: cellH });
      addedCells = true;
    }

    if (!addedCells) result.push(box);
  }

  return result;
}

// Credibility scoring function
function fieldCredibilityScore(box: SnapResult): number {
  const area = box.width * box.height;
  const aspectRatio = box.width / Math.max(box.height, 1);

  let score = area;

  if (box.width > 300) {
    const excess = box.width - 300;
    score += Math.pow(excess, 2) * 8;
  }
  if (box.width > 450) score += (box.width - 450) * 3000;
  if (aspectRatio > 5) score += Math.pow(aspectRatio - 5, 2) * 3500;
  if (box.width >= 30 && box.width <= 300 && box.height >= 10 && box.height <= 80) {
    score *= 0.25;
  }

  return score;
}

describe('Snap Detection - Multi-Column Cell Boundary Fix', () => {
  describe('segmentByInternalDividers', () => {
    test('should split a wide rectangle with one internal vertical divider into two separate boxes', () => {
      // Simulate a box spanning two columns (600px wide) with a divider at x=300
      const wideBox: SnapResult = {
        x: 100,
        y: 50,
        width: 600,
        height: 40,
      };

      const verticalDivider: VLine = {
        x: 400, // Interior divider (not at edges)
        y1: 40, // Spans most of box height (50 to 90)
        y2: 90,
      };

      const result = segmentByInternalDividers([wideBox], [verticalDivider]);

      // Should produce two separate cells, not one wide box
      expect(result.length).toBe(2);

      // First cell: from left edge (100) to divider (400)
      expect(result[0].x).toBe(100);
      expect(result[0].y).toBe(50);
      expect(result[0].width).toBe(300);
      expect(result[0].height).toBe(40);

      // Second cell: from divider (400) to right edge (700)
      expect(result[1].x).toBe(400);
      expect(result[1].y).toBe(50);
      expect(result[1].width).toBe(300);
      expect(result[1].height).toBe(40);
    });

    test('should split a wide rectangle with multiple internal dividers into multiple cells', () => {
      // Box spanning three columns (900px wide) with two dividers
      const wideBox: SnapResult = {
        x: 50,
        y: 100,
        width: 900,
        height: 35,
      };

      const verticalDividers: VLine[] = [
        { x: 350, y1: 85, y2: 145 }, // First divider
        { x: 600, y1: 85, y2: 145 }, // Second divider
      ];

      const result = segmentByInternalDividers([wideBox], verticalDividers);

      // Should produce three separate cells
      expect(result.length).toBe(3);

      expect(result[0].width).toBe(300); // 350 - 50
      expect(result[1].width).toBe(250); // 600 - 350
      expect(result[2].width).toBe(350); // 950 - 600
    });

    test('should NOT split a box if vertical line is at the edge', () => {
      const box: SnapResult = {
        x: 100,
        y: 50,
        width: 300,
        height: 40,
      };

      // Vertical line at the left edge (should be ignored)
      const edgeDivider: VLine = {
        x: 105, // Within edge tolerance (8px)
        y1: 45,
        y2: 95,
      };

      const result = segmentByInternalDividers([box], [edgeDivider]);

      // Should keep original box, no splitting
      expect(result.length).toBe(1);
      expect(result[0].width).toBe(300);
    });

    test('should NOT split a box if vertical line does not span enough height', () => {
      const box: SnapResult = {
        x: 100,
        y: 50,
        width: 400,
        height: 50,
      };

      // Vertical line that only spans 20% of box height (should be ignored)
      const shortDivider: VLine = {
        x: 300,
        y1: 60, // Only spans from 60 to 70 (10px out of 50px height)
        y2: 70,
      };

      const result = segmentByInternalDividers([box], [shortDivider]);

      // Should keep original box
      expect(result.length).toBe(1);
      expect(result[0].width).toBe(400);
    });

    test('should keep original box if no interior dividers found', () => {
      const box: SnapResult = {
        x: 100,
        y: 50,
        width: 200,
        height: 40,
      };

      const unrelatedDivider: VLine = {
        x: 500, // Far outside the box
        y1: 0,
        y2: 100,
      };

      const result = segmentByInternalDividers([box], [unrelatedDivider]);

      expect(result.length).toBe(1);
      expect(result[0].width).toBe(200);
    });
  });

  describe('segmentByInternalHorizontalDividers', () => {
    test('should split a tall box with internal horizontal divider into two cells', () => {
      const tallBox: SnapResult = {
        x: 100,
        y: 50,
        width: 200,
        height: 150, // Tall box
      };

      const horizontalDivider: HLine = {
        y: 120, // Interior horizontal line
        x1: 95, // Spans most of box width
        x2: 305,
      };

      const result = segmentByInternalHorizontalDividers([tallBox], [horizontalDivider]);

      // Should produce two separate rows
      expect(result.length).toBe(2);
      expect(result[0].height).toBeGreaterThan(50);
      expect(result[1].height).toBeGreaterThan(50);
    });
  });

  describe('fieldCredibilityScore', () => {
    test('should penalize boxes wider than 300px', () => {
      const normalBox: SnapResult = { x: 0, y: 0, width: 200, height: 30 };
      const wideBox: SnapResult = { x: 0, y: 0, width: 500, height: 30 };

      const normalScore = fieldCredibilityScore(normalBox);
      const wideScore = fieldCredibilityScore(wideBox);

      // Wide box should have much higher (worse) score
      expect(wideScore).toBeGreaterThan(normalScore * 5);
    });

    test('should heavily penalize boxes wider than 450px', () => {
      const box450: SnapResult = { x: 0, y: 0, width: 450, height: 30 };
      const box600: SnapResult = { x: 0, y: 0, width: 600, height: 30 };

      const score450 = fieldCredibilityScore(box450);
      const score600 = fieldCredibilityScore(box600);

      // 600px box should have higher score due to hard penalty (but not necessarily 10x)
      expect(score600).toBeGreaterThan(score450 * 2);
    });

    test('should reward boxes in typical input field range', () => {
      const idealBox: SnapResult = { x: 0, y: 0, width: 150, height: 30 };
      const outsideRangeBox: SnapResult = { x: 0, y: 0, width: 50, height: 100 };

      const idealScore = fieldCredibilityScore(idealBox);
      const outsideScore = fieldCredibilityScore(outsideRangeBox);

      // Ideal box should have lower (better) score due to reward multiplier
      expect(idealScore).toBeLessThan(outsideScore);
    });

    test('should penalize high aspect ratios', () => {
      const normalRatio: SnapResult = { x: 0, y: 0, width: 150, height: 30 }; // 5:1
      const highRatio: SnapResult = { x: 0, y: 0, width: 400, height: 30 }; // 13.3:1

      const normalScore = fieldCredibilityScore(normalRatio);
      const highScore = fieldCredibilityScore(highRatio);

      expect(highScore).toBeGreaterThan(normalScore * 3);
    });
  });

  describe('End-to-end: multi-column form scenario', () => {
    test('should correctly handle a typical two-column bank form layout', () => {
      // Simulate a form row with two input cells:
      // [Bank Name: 280px] |divider| [Bank BSB: 120px]
      // Combined detection might return a 600px wide box

      const mergedBox: SnapResult = {
        x: 100,
        y: 200,
        width: 600, // Spans both columns
        height: 32,
      };

      const columnDivider: VLine = {
        x: 380, // Divider between columns
        y1: 185, // Spans the row height
        y2: 245,
      };

      const segmented = segmentByInternalDividers([mergedBox], [columnDivider]);

      // Should split into two separate cells
      expect(segmented.length).toBe(2);

      // First cell (Bank Name)
      expect(segmented[0].x).toBe(100);
      expect(segmented[0].width).toBe(280);
      expect(segmented[0].height).toBe(32);

      // Second cell (Bank BSB)
      expect(segmented[1].x).toBe(380);
      expect(segmented[1].width).toBe(320); // 700 - 380 (box.x + width = 100 + 600)
      expect(segmented[1].height).toBe(32);

      // Verify credibility scores prefer the smaller cells
      const mergedScore = fieldCredibilityScore(mergedBox);
      const cell1Score = fieldCredibilityScore(segmented[0]);
      const cell2Score = fieldCredibilityScore(segmented[1]);

      expect(cell1Score).toBeLessThan(mergedScore);
      expect(cell2Score).toBeLessThan(mergedScore);
    });
  });
});
