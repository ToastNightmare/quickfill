/**
 * Unit tests for MIN_GAP enforcement in field placement
 * Tests the logic that prevents visual merging of adjacent fields
 */

import type { EditorField } from "../types";

// Extracted gap enforcement logic for testing
function applyMinGapEnforcement(
  fieldX: number,
  fieldY: number,
  fieldW: number,
  fieldH: number,
  pageFields: EditorField[]
): { x: number; y: number } {
  const MIN_GAP = 2;
  
  for (const existing of pageFields) {
    const existingRight = existing.x + existing.width;
    const existingBottom = existing.y + existing.height;
    
    // Check if new field would be adjacent to existing field
    const isAdjacentRight = Math.abs(fieldX - existingRight) < MIN_GAP && Math.abs((fieldY + fieldH / 2) - (existing.y + existing.height / 2)) < Math.max(fieldH, existing.height);
    const isAdjacentLeft = Math.abs((fieldX + fieldW) - existing.x) < MIN_GAP && Math.abs((fieldY + fieldH / 2) - (existing.y + existing.height / 2)) < Math.max(fieldH, existing.height);
    const isAdjacentBottom = Math.abs(fieldY - existingBottom) < MIN_GAP && Math.abs((fieldX + fieldW / 2) - (existing.x + existing.width / 2)) < Math.max(fieldW, existing.width);
    const isAdjacentTop = Math.abs((fieldY + fieldH) - existing.y) < MIN_GAP && Math.abs((fieldX + fieldW / 2) - (existing.x + existing.width / 2)) < Math.max(fieldW, existing.width);
    
    if (isAdjacentRight) {
      fieldX = existingRight + MIN_GAP;
    } else if (isAdjacentLeft) {
      fieldX = existing.x - fieldW - MIN_GAP;
    } else if (isAdjacentBottom) {
      fieldY = existingBottom + MIN_GAP;
    } else if (isAdjacentTop) {
      fieldY = existing.y - fieldH - MIN_GAP;
    }
  }
  
  return { x: fieldX, y: fieldY };
}

describe("MIN_GAP enforcement for drag-to-draw field placement", () => {
  const MIN_GAP = 2;
  
  const createField = (id: string, x: number, y: number, width: number, height: number): EditorField => ({
    id,
    x,
    y,
    width,
    height,
    page: 0,
    type: "text",
    value: "",
    fontSize: 14,
    snapped: false,
  });
  
  describe("adjacent field detection", () => {
    it("should detect fields placed too close on the right side", () => {
      const existingField = createField("field-1", 100, 100, 200, 30);
      const pageFields = [existingField];
      
      // Place a new field just 1px to the right (less than MIN_GAP)
      const result = applyMinGapEnforcement(301, 100, 100, 30, pageFields);
      
      // Should be nudged to be at least MIN_GAP away
      expect(result.x).toBeGreaterThanOrEqual(existingField.x + existingField.width + MIN_GAP);
    });
    
    it("should detect fields placed too close on the left side", () => {
      const existingField = createField("field-1", 300, 100, 200, 30);
      const pageFields = [existingField];
      
      // Place a new field just 1px to the left (less than MIN_GAP)
      const result = applyMinGapEnforcement(99, 100, 100, 30, pageFields);
      
      // Should be nudged to be at least MIN_GAP away on the left
      expect(result.x + 100).toBeLessThanOrEqual(existingField.x - MIN_GAP);
    });
    
    it("should detect fields placed too close on the bottom side", () => {
      const existingField = createField("field-1", 100, 100, 200, 30);
      const pageFields = [existingField];
      
      // Place a new field just 1px below (less than MIN_GAP)
      const result = applyMinGapEnforcement(100, 131, 100, 30, pageFields);
      
      // Should be nudged to be at least MIN_GAP below
      expect(result.y).toBeGreaterThanOrEqual(existingField.y + existingField.height + MIN_GAP);
    });
    
    it("should detect fields placed too close on the top side", () => {
      const existingField = createField("field-1", 100, 200, 200, 30);
      const pageFields = [existingField];
      
      // Place a new field just 1px above (less than MIN_GAP)
      const result = applyMinGapEnforcement(100, 169, 100, 30, pageFields);
      
      // Should be nudged to be at least MIN_GAP above
      expect(result.y + 30).toBeLessThanOrEqual(existingField.y - MIN_GAP);
    });
  });
  
  describe("drag-to-draw simulation", () => {
    it("should enforce MIN_GAP when placing field adjacent to existing field via drag-to-draw", () => {
      // Simulate first field placed at (100, 100) with size (200, 30)
      const firstField = createField("field-1", 100, 100, 200, 30);
      const pageFields = [firstField];
      
      // Simulate drag-to-draw placing second field adjacent (would be at x=300, y=100)
      // Without enforcement, this would merge visually
      const proposedX = 300; // Right edge of first field
      const proposedY = 100;
      const fieldW = 150;
      const fieldH = 30;
      
      const result = applyMinGapEnforcement(proposedX, proposedY, fieldW, fieldH, pageFields);
      
      // Verify the gap is at least MIN_GAP
      const actualGap = result.x - (firstField.x + firstField.width);
      expect(actualGap).toBeGreaterThanOrEqual(MIN_GAP);
    });
    
    it("should not adjust position when field is already at safe distance", () => {
      const existingField = createField("field-1", 100, 100, 200, 30);
      const pageFields = [existingField];
      
      // Place a new field 10px away (more than MIN_GAP)
      const result = applyMinGapEnforcement(310, 100, 100, 30, pageFields);
      
      // Position should remain unchanged
      expect(result.x).toBe(310);
      expect(result.y).toBe(100);
    });
    
    it("should handle multiple adjacent fields correctly", () => {
      const field1 = createField("field-1", 100, 100, 200, 30);
      const field2 = createField("field-2", 100, 200, 200, 30);
      const pageFields = [field1, field2];
      
      // Try to place a field between them (too close to both vertically)
      // The algorithm checks each field and adjusts accordingly
      const result = applyMinGapEnforcement(100, 131, 100, 30, pageFields);
      
      // Should be pushed below field1 (first adjacent field found)
      // The algorithm processes fields in order, so it will push below field1
      expect(result.y).toBeGreaterThanOrEqual(field1.y + field1.height + MIN_GAP);
    });
  });
  
  describe("vertical alignment checks", () => {
    it("should only apply horizontal gap when vertically aligned", () => {
      const existingField = createField("field-1", 100, 100, 200, 30);
      const pageFields = [existingField];
      
      // Place a field to the right but vertically far away (no alignment)
      const result = applyMinGapEnforcement(301, 200, 100, 30, pageFields);
      
      // Should not be adjusted since they are not vertically aligned
      expect(result.x).toBe(301);
    });
    
    it("should only apply vertical gap when horizontally aligned", () => {
      const existingField = createField("field-1", 100, 100, 200, 30);
      const pageFields = [existingField];
      
      // Place a field below but horizontally far away (no alignment)
      const result = applyMinGapEnforcement(400, 131, 100, 30, pageFields);
      
      // Should not be adjusted since they are not horizontally aligned
      expect(result.y).toBe(131);
    });
  });
});
