"use client";
import Link from "next/link";
import { FileText } from "lucide-react";

const templates = [
  {
    file: "ato-tfn-declaration.pdf",
    title: "Tax File Number Declaration",
    description: "ATO form for declaring your TFN to a new employer or payer. Required when starting a new job.",
    emoji: "🏛️",
    category: "Government",
  },
  {
    file: "australian-invoice.pdf",
    title: "Tax Invoice",
    description: "Standard Australian tax invoice with ABN, GST calculation, and payment details.",
    emoji: "🧾",
    category: "Business",
  },
  {
    file: "rental-application.pdf",
    title: "Rental Application",
    description: "Standard rental application form for Australian residential properties.",
    emoji: "🏠",
    category: "Real Estate",
  },
  {
    file: "employee-details.pdf",
    title: "Employee Details Form",
    description: "Collect TFN, bank details, and superannuation information from new employees.",
    emoji: "👤",
    category: "Employment",
  },
  {
    file: "consent-form.pdf",
    title: "General Consent Form",
    description: "A clear, simple consent form suitable for medical, community, and business use.",
    emoji: "✅",
    category: "General",
  },
];

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

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <div key={t.file} className="flex flex-col rounded-xl border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-4xl mb-3">{t.emoji}</div>
            <span className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-1">{t.category}</span>
            <h2 className="text-base font-semibold mb-2">{t.title}</h2>
            <p className="text-sm text-text-muted leading-relaxed flex-1">{t.description}</p>
            <Link
              href={`/editor?template=${encodeURIComponent(t.file)}`}
              className="mt-5 flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              <FileText className="h-4 w-4" />
              Fill This Form
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
