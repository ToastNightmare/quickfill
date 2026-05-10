import { autofillModeFromFlag, runProfileAutofill, shouldReportAutofillShadowMode } from "../profile-autofill";

const profile = {
  fullName: "Jane Smith",
  organisation: "Smith Bookkeeping",
  dateOfBirth: "01/02/1990",
};

const fields = [
  { id: "name", name: "applicant_name", type: "text" as const, value: "" },
  { id: "business", name: "business_name", label: "Business name", type: "text" as const, value: "" },
  { id: "dob", name: "date_of_birth", label: "Date of birth", type: "date" as const, value: "" },
];

describe("profile autofill rollout adapter", () => {
  it("keeps legacy behavior as the default", () => {
    const result = runProfileAutofill(fields, profile);

    expect(result.mode).toBe("legacy");
    expect(result.fields.find((field) => field.id === "name")?.value).toBe("Jane Smith");
    expect(result.fields.find((field) => field.id === "dob")?.value).toBe("");
    expect(result.summary["auto-fill"]).toBeGreaterThanOrEqual(1);
    expect(result.shadowReport.mode).toBe("legacy");
  });

  it("can run the intelligence engine when explicitly enabled", () => {
    const result = runProfileAutofill(fields, profile, "intelligence");

    expect(result.fields.find((field) => field.id === "business")?.value).toBe("Smith Bookkeeping");
    expect(result.fields.find((field) => field.id === "dob")?.value).toBe("01/02/1990");
  });

  it("builds a privacy-safe shadow report without profile values", () => {
    const result = runProfileAutofill(fields, profile, "shadow");

    expect(result.fields.find((field) => field.id === "dob")?.value).toBe("");
    expect(result.shadowReport).toMatchObject({
      mode: "shadow",
      fieldCount: 3,
      legacyMatched: 2,
      intelligenceAutoFill: 3,
      intelligenceSkip: 0,
      highConfidenceWithoutLegacyCount: 1,
    });
    expect(result.shadowReport.profileKeys).toContain("dateOfBirth");
    expect(JSON.stringify(result.shadowReport)).not.toContain("Jane Smith");
    expect(JSON.stringify(result.shadowReport)).not.toContain("01/02/1990");
  });

  it("reports only rollout modes that intentionally collect shadow data", () => {
    expect(shouldReportAutofillShadowMode("legacy")).toBe(false);
    expect(shouldReportAutofillShadowMode("shadow")).toBe(true);
    expect(shouldReportAutofillShadowMode("intelligence")).toBe(true);
  });

  it("maps flags to safe rollout modes", () => {
    expect(autofillModeFromFlag(undefined)).toBe("legacy");
    expect(autofillModeFromFlag("shadow")).toBe("shadow");
    expect(autofillModeFromFlag("intelligence")).toBe("intelligence");
    expect(autofillModeFromFlag("anything-else")).toBe("legacy");
  });
});
