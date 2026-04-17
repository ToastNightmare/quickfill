import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "PDF Form Templates | QuickFill",
};

interface Template {
  file: string;
  title: string;
  description: string;
  emoji: string;
  category: string;
  badge?: string;
}

const officialTemplates: Template[] = [
  {
    file: "ato-tfn-declaration.pdf",
    title: "Tax File Number Declaration",
    description: "Official ATO form (NAT 3092). Required when starting a new job so your employer can withhold the correct amount of tax.",
    emoji: "🏛️",
    category: "ATO Official",
    badge: "Official",
  },
  {
    file: "ato-super-choice.pdf",
    title: "Superannuation Standard Choice",
    description: "Official ATO form (NAT 13080). Tell your employer which super fund to pay your contributions into.",
    emoji: "🏦",
    category: "ATO Official",
    badge: "Official",
  },
  {
    file: "ato-withholding-declaration.pdf",
    title: "Withholding Declaration",
    description: "Official ATO form (NAT 3093). Advise your employer of changes to your tax withholding: HELP debt, Medicare levy, tax offsets.",
    emoji: "📋",
    category: "ATO: Official",
    badge: "Official",
  },
  {
    file: "employment-separation.pdf",
    title: "Employment Separation Certificate",
    description: "Official Services Australia form (SU001). Required by Centrelink when you leave a job to claim income support.",
    emoji: "📄",
    category: "Services Australia Official",
    badge: "Official",
  },
  {
    file: "medicare-enrolment.pdf",
    title: "Medicare Enrolment",
    description: "Official Services Australia form (MS004). Apply for a Medicare card as a new resident or Australian citizen.",
    emoji: "🏥",
    category: "Services Australia: Official",
    badge: "Official",
  },
];

const legalTemplates: Template[] = [
  {
    file: "statutory-declaration.pdf",
    title: "Statutory Declaration",
    description: "Official statutory declaration form for making legal declarations. Includes witness section and criminal offence warning.",
    emoji: "⚖️",
    category: "Legal",
  },
];

const centrelinkTemplates: Template[] = [
  {
    file: "centrelink-su415.pdf",
    title: "Centrelink Income & Assets (SU415)",
    description: "Services Australia form for declaring income and assets. Sections for employment, other income, assets, and partner details.",
    emoji: "💼",
    category: "Centrelink",
  },
];

const realEstateTemplates: Template[] = [
  {
    file: "tenancy-application-nsw.pdf",
    title: "Rental Application (NSW)",
    description: "New South Wales rental application with sections for applicant, employment, rental history, references, ID, occupants, pets, and vehicles.",
    emoji: "🏠",
    category: "Real Estate",
  },
  {
    file: "tenancy-application-vic.pdf",
    title: "Rental Application (VIC)",
    description: "Victoria rental application with Victorian requirements including bond/rent fields and privacy notice.",
    emoji: "🏡",
    category: "Real Estate",
  },
  {
    file: "rental-application.pdf",
    title: "Rental Application",
    description: "Standard residential rental application for Australian properties. Covers personal details, employment, references, and ID.",
    emoji: "🏘️",
    category: "Real Estate",
  },
];

const superTemplates: Template[] = [
  {
    file: "superannuation-hardship.pdf",
    title: "Superannuation Hardship Release",
    description: "Early release of superannuation on compassionate/financial hardship grounds. Sections for member details, grounds, financial details, and supporting documents.",
    emoji: "📥",
    category: "Superannuation",
  },
];

const professionalTemplates: Template[] = [
  {
    file: "employee-details.pdf",
    title: "New Employee Details Form",
    description: "Collect TFN, bank details, super fund, and emergency contact from new staff. Ready for payroll setup.",
    emoji: "👤",
    category: "Employment",
  },
  {
    file: "australian-invoice.pdf",
    title: "Tax Invoice",
    description: "Professional Australian tax invoice with ABN, GST breakdown, line items, and payment details.",
    emoji: "🧾",
    category: "Business",
  },
  {
    file: "consent-form.pdf",
    title: "General Consent Form",
    description: "A clear, signed consent and authority form suitable for community, business, and personal use.",
    emoji: "✅",
    category: "General",
  },
  {
    file: "medical-consent.pdf",
    title: "Medical Consent Form",
    description: "Patient consent for procedures and treatments. Includes Medicare number, allergies, emergency contact, and signatures.",
    emoji: "⚕️",
    category: "Healthcare",
  },
  {
    file: "bank-account-change.pdf",
    title: "Bank Account Update Request",
    description: "Update your bank account details with an employer, super fund, or government agency. Signed declaration included.",
    emoji: "💳",
    category: "Finance",
  },
  {
    file: "insurance-claim.pdf",
    title: "Insurance Claim Form",
    description: "General insurance claim covering home, motor, and personal property. Works with most Australian insurers.",
    emoji: "🛡️",
    category: "Insurance",
  },
  {
    file: "ndis-service-agreement.pdf",
    title: "NDIS Service Agreement",
    description: "Compliant NDIS service agreement between participant and provider. Includes support schedule, rates, and signatures.",
    emoji: "♿",
    category: "NDIS",
  },
];

function TemplateCard({ template }: { template: Template }) {
  // Map file to slug
  const slugMap: Record<string, string> = {
    "ato-tfn-declaration.pdf": "tfn-declaration",
    "ato-super-choice.pdf": "super-choice",
    "ato-withholding-declaration.pdf": "withholding-declaration",
    "employment-separation.pdf": "employment-separation",
    "medicare-enrolment.pdf": "medicare-enrolment",
    "statutory-declaration.pdf": "statutory-declaration",
    "centrelink-su415.pdf": "centrelink-su415",
    "tenancy-application-nsw.pdf": "rental-application-nsw",
    "tenancy-application-vic.pdf": "rental-application-vic",
    "rental-application.pdf": "rental-application",
    "superannuation-hardship.pdf": "super-hardship",
    "employee-details.pdf": "employee-details",
    "australian-invoice.pdf": "tax-invoice",
    "consent-form.pdf": "consent-form",
    "medical-consent.pdf": "medical-consent",
    "bank-account-change.pdf": "bank-account-change",
    "insurance-claim.pdf": "insurance-claim",
    "ndis-service-agreement.pdf": "ndis-service-agreement",
  };

  const slug = slugMap[template.file];
  const hasDetailPage = slug && template.file !== "ato-withholding-declaration.pdf" && template.file !== "rental-application.pdf" && template.file !== "consent-form.pdf" && template.file !== "bank-account-change.pdf" && template.file !== "insurance-claim.pdf";

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-shadow relative">
      {template.badge && (
        <span className="absolute top-4 right-4 inline-flex items-center rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-semibold text-white">
          {template.badge}
        </span>
      )}
      {hasDetailPage ? (
        <Link href={`/templates/${slug}`} className="block hover:opacity-80 transition-opacity">
          <div className="text-4xl mb-3">{template.emoji}</div>
          <span className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-1">{template.category}</span>
          <h2 className="text-base font-semibold mb-2">{template.title}</h2>
          <p className="text-sm text-text-muted leading-relaxed flex-1">{template.description}</p>
        </Link>
      ) : (
        <>
          <div className="text-4xl mb-3">{template.emoji}</div>
          <span className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-1">{template.category}</span>
          <h2 className="text-base font-semibold mb-2">{template.title}</h2>
          <p className="text-sm text-text-muted leading-relaxed flex-1">{template.description}</p>
        </>
      )}
      <Link
        href={`/editor?template=${encodeURIComponent(template.file)}`}
        className="mt-5 flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
      >
        <FileText className="h-4 w-4" />
        Fill This Form
      </Link>
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
          🇦🇺 Australian Forms
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Form Templates</h1>
        <p className="mx-auto mt-4 max-w-2xl text-text-muted">
          Ready-to-fill Australian forms. Click any template to open it in the editor with your profile auto-filled.
        </p>
      </div>

      {/* Official Government Forms Section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-text mb-6">Official Government Forms</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {officialTemplates.map((t) => (
            <TemplateCard key={t.file} template={t} />
          ))}
        </div>
      </div>

      {/* Legal Section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-text mb-6">Legal</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {legalTemplates.map((t) => (
            <TemplateCard key={t.file} template={t} />
          ))}
        </div>
      </div>

      {/* Centrelink Section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-text mb-6">Centrelink</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {centrelinkTemplates.map((t) => (
            <TemplateCard key={t.file} template={t} />
          ))}
        </div>
      </div>

      {/* Real Estate Section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-text mb-6">Real Estate</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {realEstateTemplates.map((t) => (
            <TemplateCard key={t.file} template={t} />
          ))}
        </div>
      </div>

      {/* Superannuation Section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-text mb-6">Superannuation</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {superTemplates.map((t) => (
            <TemplateCard key={t.file} template={t} />
          ))}
        </div>
      </div>

      {/* Professional Templates Section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-text mb-6">Professional Templates</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {professionalTemplates.map((t) => (
            <TemplateCard key={t.file} template={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
