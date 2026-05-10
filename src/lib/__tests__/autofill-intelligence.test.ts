import {
  applyAutofillPredictions,
  predictAutofillField,
  predictAutofillFields,
  summarizeAutofillPredictions,
  type AutofillFieldCandidate,
} from "../autofill-intelligence";

const profile = {
  fullName: "Jane Smith",
  email: "jane@example.com",
  phone: "0412 345 678",
  addressLine1: "42 Wallaby Way",
  dateOfBirth: "01/02/1990",
  tfn: "123 456 789",
  bankBsb: "062-000",
  bankAccount: "123456789",
  bankName: "Commonwealth Bank",
  organisation: "Smith Bookkeeping",
  signature: "Signed",
};

function field(partial: Partial<AutofillFieldCandidate>): AutofillFieldCandidate {
  return {
    id: partial.id ?? "field",
    name: partial.name,
    label: partial.label,
    nearbyText: partial.nearbyText,
    type: partial.type ?? "text",
    value: partial.value ?? "",
  };
}

describe("autofill intelligence", () => {
  it("auto-fills high-confidence personal fields when profile values exist", () => {
    const prediction = predictAutofillField(
      field({ id: "applicant_name", label: "Applicant full name" }),
      profile,
    );

    expect(prediction.profileKey).toBe("fullName");
    expect(prediction.decision).toBe("auto-fill");
    expect(prediction.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not confuse business name with full name", () => {
    const prediction = predictAutofillField(
      field({ id: "business_name", label: "Business name" }),
      profile,
    );

    expect(prediction.profileKey).toBe("organisation");
    expect(prediction.profileKey).not.toBe("fullName");
  });

  it("handles Australian identity and banking fields", () => {
    const predictions = predictAutofillFields(
      [
        field({ id: "dob", label: "Date of birth", type: "date" }),
        field({ id: "tfn", label: "Tax file number", type: "comb" }),
        field({ id: "bsb", label: "BSB", type: "comb" }),
        field({ id: "account", label: "Account number", type: "text" }),
      ],
      profile,
    );

    expect(predictions.map((item) => item.profileKey)).toEqual([
      "dateOfBirth",
      "tfn",
      "bankBsb",
      "bankAccount",
    ]);
    expect(predictions.every((item) => item.decision === "auto-fill")).toBe(true);
  });

  it("suggests matches when the field is recognized but the profile value is empty", () => {
    const prediction = predictAutofillField(
      field({ id: "passport", label: "Passport number" }),
      profile,
    );

    expect(prediction.profileKey).toBe("passportNumber");
    expect(prediction.hasProfileValue).toBe(false);
    expect(prediction.decision).toBe("suggest");
  });

  it("applies only predictions that are allowed by the requested confidence level", () => {
    const fields = [
      field({ id: "name", label: "Applicant full name" }),
      field({ id: "occupation", label: "Occupation" }),
    ];
    const predictions = predictAutofillFields(fields, profile);

    const autoFilled = applyAutofillPredictions(fields, profile, predictions, "auto-fill");
    const reviewed = applyAutofillPredictions(fields, profile, predictions, "review");

    expect(autoFilled.find((item) => item.id === "name")?.value).toBe("Jane Smith");
    expect(autoFilled.find((item) => item.id === "occupation")?.value).toBe("");
    expect(reviewed.find((item) => item.id === "occupation")?.value).toBe("");
  });

  it("summarizes decisions for a review step", () => {
    const predictions = predictAutofillFields(
      [
        field({ id: "name", label: "Applicant full name" }),
        field({ id: "passport", label: "Passport number" }),
        field({ id: "unknown", label: "Office use only" }),
      ],
      profile,
    );

    expect(summarizeAutofillPredictions(predictions)).toEqual({
      "auto-fill": 1,
      review: 0,
      suggest: 1,
      skip: 1,
    });
  });
});
