import { autofillModeFromFlag, runProfileAutofill } from "../profile-autofill";

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
  });

  it("can run the intelligence engine when explicitly enabled", () => {
    const result = runProfileAutofill(fields, profile, "intelligence");

    expect(result.fields.find((field) => field.id === "business")?.value).toBe("Smith Bookkeeping");
    expect(result.fields.find((field) => field.id === "dob")?.value).toBe("01/02/1990");
  });

  it("maps flags to safe rollout modes", () => {
    expect(autofillModeFromFlag(undefined)).toBe("legacy");
    expect(autofillModeFromFlag("shadow")).toBe("shadow");
    expect(autofillModeFromFlag("intelligence")).toBe("intelligence");
    expect(autofillModeFromFlag("anything-else")).toBe("legacy");
  });
});
