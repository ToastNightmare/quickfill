import {
  COMB_PREEXISTING_ACCEPTANCE,
  isCombPreexistingEligible,
  isVisualCombDetectionAccepted,
  upgradeDeclaredCombField,
  upgradeDeclaredCombFields,
  upgradeVisualCombField,
  type CombPreexistingAcroField,
} from "../comb-preexisting";
import type { CombDetectResult } from "../snap-detect";
import type { EditorField } from "../types";

function textField(value = "12"): Extract<EditorField, { type: "text" }> {
  return {
    id: "member-number",
    type: "text",
    x: 20,
    y: 30,
    width: 100,
    height: 20,
    page: 0,
    value,
    fontSize: 12,
  };
}

function acroField(
  overrides: Partial<CombPreexistingAcroField> = {},
): CombPreexistingAcroField {
  return {
    name: "member-number",
    type: "text",
    x: 20,
    y: 30,
    width: 100,
    height: 20,
    page: 0,
    value: "12",
    valueSource: "text",
    ...overrides,
  };
}

function detection(
  overrides: Partial<CombDetectResult> = {},
): CombDetectResult {
  return {
    cellWidth: 20,
    cellCount: 5,
    x: 40,
    y: 60,
    width: 200,
    height: 40,
    firstCellX: 40,
    cellBoundaries: [40, 80, 120, 160, 200],
    cellCenters: [60, 100, 140, 180, 220],
    cellWidths: [40, 40, 40, 40, 40],
    ...overrides,
  };
}

describe("comb-aware pre-existing fields", () => {
  it("exports the conservative acceptance thresholds as one object", () => {
    expect(COMB_PREEXISTING_ACCEPTANCE).toEqual({
      minimumCellCount: 2,
      maximumCellCount: 40,
      minimumSpanRatio: 0.7,
      minimumHeightRatio: 0.5,
      maximumHeightRatio: 1.5,
    });
  });

  it("accepts only eligible single-line AcroForm text fields", () => {
    expect(isCombPreexistingEligible(textField(), acroField(), 5)).toBe(true);
    expect(
      isCombPreexistingEligible(
        { ...textField(), type: "comb", charCount: 5 } as EditorField,
        acroField(),
        5,
      ),
    ).toBe(false);
    expect(
      isCombPreexistingEligible(textField(), acroField({ multiline: true }), 5),
    ).toBe(false);
    expect(
      isCombPreexistingEligible(textField(), acroField({ kind: "choice" }), 5),
    ).toBe(false);
    expect(
      isCombPreexistingEligible(
        textField(),
        acroField({ valueSource: "choice" }),
        5,
      ),
    ).toBe(false);
    expect(isCombPreexistingEligible(textField("123456"), acroField(), 5)).toBe(
      false,
    );
  });

  it("upgrades declared combs without adding visual cell geometry", () => {
    const upgraded = upgradeDeclaredCombField(
      textField("12345"),
      acroField({ combed: true, maxLength: 5 }),
    );

    expect(upgraded).toEqual({
      id: "member-number",
      type: "comb",
      x: 20,
      y: 30,
      width: 100,
      height: 20,
      page: 0,
      value: "12345",
      charCount: 5,
    });
    expect(upgraded).not.toHaveProperty("cellWidth");
    expect(upgraded).not.toHaveProperty("cellPositions");
    expect(upgraded).not.toHaveProperty("cellWidths");
  });

  it("keeps oversized declared values as text and upgrades restored matches by id", () => {
    const declared = acroField({ combed: true, maxLength: 5 });
    expect(upgradeDeclaredCombField(textField("123456"), declared).type).toBe(
      "text",
    );
    expect(
      upgradeDeclaredCombFields(
        [textField("123"), { ...textField(), id: "unmatched" }],
        [declared],
      ).map((field) => field.type),
    ).toEqual(["comb", "text"]);
  });

  it.each([
    [2, 140, 20, true],
    [40, 140, 60, true],
    [1, 140, 40, false],
    [41, 140, 40, false],
    [5, 139.9, 40, false],
    [5, 140, 19.9, false],
    [5, 140, 60.1, false],
  ])(
    "checks cell count %s, span %s, and row height %s",
    (cellCount, width, height, accepted) => {
      expect(
        isVisualCombDetectionAccepted(
          textField(),
          detection({ cellCount, width, height }),
          2,
        ),
      ).toBe(accepted);
    },
  );

  it("converts accepted visual geometry back to PDF points", () => {
    const upgraded = upgradeVisualCombField(
      textField("123"),
      acroField(),
      detection(),
      2,
    );

    expect(upgraded).toEqual({
      id: "member-number",
      type: "comb",
      x: 20,
      y: 30,
      width: 100,
      height: 20,
      page: 0,
      value: "123",
      charCount: 5,
      cellWidth: 10,
      cellPositions: [10, 30, 50, 70, 90],
      cellWidths: [20, 20, 20, 20, 20],
    });
  });

  it("leaves ambiguous detections and oversized values unchanged", () => {
    const field = textField("123456");
    expect(
      upgradeVisualCombField(field, acroField(), detection(), 2),
    ).toBe(field);
    expect(
      upgradeVisualCombField(
        textField(),
        acroField(),
        detection({ width: 120 }),
        2,
      ).type,
    ).toBe("text");
  });
});
