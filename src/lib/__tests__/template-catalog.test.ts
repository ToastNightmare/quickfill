import { templateDirectory } from "@/lib/template-directory";
import { getRelatedTemplates, templates } from "@/lib/templates-config";

const SEO_FIELDS = [
  "seoTitle",
  "seoDescription",
  "whatIsThis",
  "keywords",
  "whoNeedsThis",
  "howToComplete",
  "commonMistakes",
  "faqs",
] as const;

const EXPECTED_TEMPLATE_FILES = [
  "ato-tfn-declaration.pdf",
  "ato-super-choice.pdf",
  "ato-withholding-declaration.pdf",
  "employment-separation.pdf",
  "medicare-enrolment.pdf",
  "statutory-declaration.pdf",
  "centrelink-su415.pdf",
  "tenancy-application-nsw.pdf",
  "tenancy-application-vic.pdf",
  "rental-application.pdf",
  "superannuation-hardship.pdf",
  "employee-details.pdf",
  "australian-invoice.pdf",
  "consent-form.pdf",
  "medical-consent.pdf",
  "bank-account-change.pdf",
  "insurance-claim.pdf",
  "ndis-service-agreement.pdf",
];

function hasContent(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined;
}

describe("template catalog", () => {
  it("uses unique slugs and keeps landing-page SEO blocks all-or-nothing", () => {
    const slugs = templates.flatMap((template) => (template.slug ? [template.slug] : []));

    expect(slugs).toHaveLength(14);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const template of templates) {
      const catalogEntry = template as unknown as Record<string, unknown>;
      const hasSlug = typeof template.slug === "string";

      for (const field of SEO_FIELDS) {
        expect(hasContent(catalogEntry[field])).toBe(hasSlug);
      }
    }
  });

  it("makes official government form codes first-class in metadata", () => {
    const officialGovernmentForms = templates.filter(
      (template) =>
        template.templateType === "officialForm" && template.sourceKind === "governmentPublic",
    );

    for (const template of officialGovernmentForms) {
      expect(template.formCode).toBeTruthy();
    }

    for (const template of templates) {
      if (!template.formCode || !template.slug) continue;

      expect(template.seoTitle).toContain(template.formCode);
      expect(template.keywords).toContain(template.formCode);
    }
  });

  it("keeps template SEO claims honest", () => {
    const unsupportedClaim = /free|no sign ?up/i;

    for (const template of templates) {
      if (!template.slug) continue;

      expect(template.seoTitle).not.toMatch(unsupportedClaim);
      expect(template.seoDescription).not.toMatch(unsupportedClaim);
    }
  });

  it("uses the fill-online title pattern for available landing pages", () => {
    for (const template of templates) {
      if (!template.slug || template.allowFill === false || template.indexable === false) continue;

      expect(template.seoTitle).toMatch(/^Fill .+ Online \| QuickFill$/);
    }
  });

  it("derives all 18 directory entries from the unified file catalog", () => {
    expect(templateDirectory).toHaveLength(18);
    expect(templateDirectory.map((template) => template.file).sort()).toEqual(
      [...EXPECTED_TEMPLATE_FILES].sort(),
    );
  });

  it("keeps related landing pages available on unified categories", () => {
    expect(getRelatedTemplates("super-choice").map((template) => template.slug)).toContain(
      "withholding-declaration",
    );
    expect(getRelatedTemplates("medicare-enrolment").map((template) => template.slug)).toContain(
      "medical-consent",
    );
  });
});
