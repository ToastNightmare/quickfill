import { trackAutofillShadowReport } from "../autofill-shadow-reporting";
import { runProfileAutofill } from "../profile-autofill";
import { trackEvent } from "../analytics";

jest.mock("../analytics", () => ({
  trackEvent: jest.fn(),
}));

const fields = [
  { id: "name", name: "applicant_name", type: "text" as const, value: "" },
];
const profile = { fullName: "Jane Smith" };

describe("autofill shadow reporting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not report legacy mode", () => {
    const result = runProfileAutofill(fields, profile, "legacy");

    expect(trackAutofillShadowReport(result)).toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("reports shadow mode with a privacy-safe summary", () => {
    const result = runProfileAutofill(fields, profile, "shadow");

    expect(trackAutofillShadowReport(result, { surface: "mobile" })).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith(
      "profile_autofill_used",
      expect.objectContaining({
        mode: "shadow",
        fieldCount: 1,
        shadowReported: true,
        surface: "mobile",
      }),
    );
    expect(JSON.stringify((trackEvent as jest.Mock).mock.calls[0][1])).not.toContain("Jane Smith");
  });
});
