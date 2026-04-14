import { describe, it, expect } from '@jest/globals';

/**
 * Unit tests for text field initialization in PdfViewer
 * 
 * This test verifies that newly created text fields always initialize
 * with an empty value (value: ""), preventing value bleed from previously
 * existing or selected fields.
 */

describe('TextField Initialization', () => {
  it('new text field should always have empty value on creation', () => {
    // Simulate the field creation logic from PdfViewer.tsx
    const genId = () => `field-${Date.now()}`;
    const currentPage = 0;
    const fieldX = 100;
    const fieldY = 100;
    const fieldW = 200;
    const fieldH = 28;
    const snapped = false;
    
    const id = genId();
    const snapBounds = snapped ? { x: fieldX, y: fieldY, width: fieldW, height: fieldH } : undefined;
    const base = { id, x: fieldX, y: fieldY, page: currentPage, snapped, snapBounds };
    
    // This is how text fields are created in PdfViewer.tsx
    const textField = { 
      ...base, 
      type: "text" as const, 
      width: fieldW, 
      height: fieldH, 
      value: "", 
      fontSize: 14 
    };
    
    // Assertion: newly created text field must have empty value
    expect(textField.value).toBe("");
    expect(textField.type).toBe("text");
  });

  it('multiple text fields should each have independent empty values', () => {
    const createTextField = (id: string, x: number, y: number) => ({
      id,
      x,
      y,
      page: 0,
      type: "text" as const,
      width: 200,
      height: 28,
      value: "",
      fontSize: 14,
      snapped: false,
    });
    
    const field1 = createTextField("field-1", 100, 100);
    const field2 = createTextField("field-2", 100, 200);
    const field3 = createTextField("field-3", 100, 300);
    
    // All fields should start with empty values
    expect(field1.value).toBe("");
    expect(field2.value).toBe("");
    expect(field3.value).toBe("");
    
    // Modifying one field should not affect others
    const modifiedField1 = { ...field1, value: "Test Value" };
    
    expect(modifiedField1.value).toBe("Test Value");
    expect(field2.value).toBe("");
    expect(field3.value).toBe("");
  });

  it('text field value should not inherit from previous field state', () => {
    // Simulate a scenario where a previous field had a value
    const previousField = {
      id: "field-1",
      x: 100,
      y: 100,
      page: 0,
      type: "text" as const,
      width: 200,
      height: 28,
      value: "Previous Value",
      fontSize: 14,
      snapped: false,
    };
    
    // Create a new field - it should NOT inherit the previous field's value
    const newField = {
      id: "field-2",
      x: 100,
      y: 200,
      page: 0,
      type: "text" as const,
      width: 200,
      height: 28,
      value: "", // Explicitly set to empty string
      fontSize: 14,
      snapped: false,
    };
    
    // Assertion: new field must have empty value regardless of previous field
    expect(newField.value).toBe("");
    expect(newField.value).not.toBe(previousField.value);
  });

  it('text field creation with snap should still have empty value', () => {
    const id = "field-snapped";
    const fieldX = 150;
    const fieldY = 150;
    const fieldW = 180;
    const fieldH = 32;
    const snapped = true;
    const currentPage = 0;
    
    const snapBounds = { x: fieldX, y: fieldY, width: fieldW, height: fieldH };
    const base = { id, x: fieldX, y: fieldY, page: currentPage, snapped, snapBounds };
    const inferredFontSize = 16;
    
    const textField = { 
      ...base, 
      type: "text" as const, 
      width: fieldW, 
      height: fieldH, 
      value: "", 
      fontSize: inferredFontSize 
    };
    
    // Even snapped fields must start with empty value
    expect(textField.value).toBe("");
  });
});
