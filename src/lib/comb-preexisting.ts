import type { CombDetectResult } from "./snap-detect";
import type { CombField, EditorField } from "./types";

export const COMB_PREEXISTING_ACCEPTANCE = Object.freeze({
  minimumCellCount: 2,
  maximumCellCount: 40,
  minimumSpanRatio: 0.7,
  minimumHeightRatio: 0.5,
  maximumHeightRatio: 1.5,
});

export interface CombPreexistingAcroField {
  name: string;
  type: "text" | "checkbox";
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  value: string;
  valueSource?: "text" | "choice" | "none";
  kind?: "radio" | "choice";
  multiline?: true;
  combed?: true;
  maxLength?: number;
}

export function isCombPreexistingEligible(
  field: EditorField,
  acroField: CombPreexistingAcroField,
  charCount?: number,
): field is Extract<EditorField, { type: "text" }> {
  return (
    field.type === "text" &&
    acroField.type === "text" &&
    acroField.multiline !== true &&
    acroField.kind === undefined &&
    acroField.valueSource !== "choice" &&
    (charCount === undefined || field.value.length <= charCount)
  );
}

function combBase(field: Extract<EditorField, { type: "text" }>) {
  return {
    id: field.id,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    page: field.page,
    ...(field.snapped !== undefined ? { snapped: field.snapped } : {}),
    ...(field.snapBounds !== undefined ? { snapBounds: field.snapBounds } : {}),
    ...(field.eraseMasks !== undefined ? { eraseMasks: field.eraseMasks } : {}),
  };
}

export function upgradeDeclaredCombField(
  field: EditorField,
  acroField: CombPreexistingAcroField,
): EditorField {
  const charCount = acroField.maxLength;
  if (
    acroField.combed !== true ||
    charCount === undefined ||
    !Number.isInteger(charCount) ||
    charCount < COMB_PREEXISTING_ACCEPTANCE.minimumCellCount ||
    !isCombPreexistingEligible(field, acroField, charCount)
  ) {
    return field;
  }

  return {
    ...combBase(field),
    type: "comb",
    value: field.value,
    charCount,
  };
}

export function upgradeDeclaredCombFields(
  fields: EditorField[],
  acroFields: readonly CombPreexistingAcroField[],
): EditorField[] {
  const byName = new Map(acroFields.map((field) => [field.name, field]));
  return fields.map((field) => {
    const acroField = byName.get(field.id);
    return acroField ? upgradeDeclaredCombField(field, acroField) : field;
  });
}

export function isVisualCombDetectionAccepted(
  field: Extract<EditorField, { type: "text" }>,
  detection: CombDetectResult,
  detectionScale: number,
): boolean {
  if (!Number.isFinite(detectionScale) || detectionScale <= 0) return false;

  const spanWidth = detection.width / detectionScale;
  const rowHeight = detection.height / detectionScale;
  return (
    detection.cellCount >= COMB_PREEXISTING_ACCEPTANCE.minimumCellCount &&
    detection.cellCount <= COMB_PREEXISTING_ACCEPTANCE.maximumCellCount &&
    spanWidth >= field.width * COMB_PREEXISTING_ACCEPTANCE.minimumSpanRatio &&
    rowHeight >= field.height * COMB_PREEXISTING_ACCEPTANCE.minimumHeightRatio &&
    rowHeight <= field.height * COMB_PREEXISTING_ACCEPTANCE.maximumHeightRatio
  );
}

export function upgradeVisualCombField(
  field: EditorField,
  acroField: CombPreexistingAcroField,
  detection: CombDetectResult,
  detectionScale: number,
): EditorField {
  if (
    !isCombPreexistingEligible(field, acroField, detection.cellCount) ||
    !isVisualCombDetectionAccepted(field, detection, detectionScale)
  ) {
    return field;
  }

  const x = Math.round(detection.firstCellX / detectionScale);
  const y = Math.round(detection.y / detectionScale);
  const lastCellIndex = detection.cellCount - 1;
  const lastCellRight =
    detection.cellBoundaries[lastCellIndex] +
    (detection.cellWidths[lastCellIndex] ?? detection.cellWidth);
  const comb: CombField = {
    ...combBase(field),
    x,
    y,
    width: Math.round(
      (lastCellRight - detection.firstCellX) / detectionScale,
    ),
    height: Math.round(detection.height / detectionScale),
    type: "comb",
    value: field.value,
    charCount: detection.cellCount,
    cellWidth: Math.round(detection.cellWidth / detectionScale),
    cellPositions: detection.cellCenters.map((center) =>
      Math.round(center / detectionScale - x),
    ),
    cellWidths: detection.cellWidths.map((width) =>
      Math.round(width / detectionScale),
    ),
  };
  return comb;
}
