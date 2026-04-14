import type { Metadata } from "next";
import Link from "next/link";
import { Upload, MousePointerClick, Download, ArrowRight } from "lucide-react";
import HowItWorksContent from "./content";

export const metadata: Metadata = {
  title: "How to Fill a PDF Form Online Free | QuickFill",
  description:
    "Learn how to fill any PDF form online in 3 simple steps. Upload your ATO tax form, Medicare claim, rental application or any Australian PDF, fill in the fields, and download instantly. No software required.",
  keywords:
    "how to fill PDF online, fill ATO form online, fill Medicare form, PDF form filler Australia, fill rental application PDF, online form filler",
};

const steps = [
  {
    icon: Upload,
    title: "Step 1: Upload Your PDF",
    description:
      "Drag and drop any PDF form into the QuickFill editor, or click to browse your files. We support all standard PDF forms including ATO tax returns, Medicare claims, Centrelink forms, rental applications, council permits, and tenancy agreements. Files up to 50 MB are accepted.",
  },
  {
    icon: MousePointerClick,
    title: "Step 2: Fill in the Fields",
    description:
      "QuickFill automatically detects fillable AcroForm fields in your PDF. For flat PDFs, simply select a tool, text, checkbox, signature, or date, and click where you want to place it. Use Auto-fill from Profile to instantly populate common fields like your name, address, ABN, and contact details.",
  },
  {
    icon: Download,
    title: "Step 3: Download Your Completed PDF",
    description:
      "Click the download button to get your filled PDF instantly. Your answers are embedded directly into the document, ready to print, email, or submit to the ATO, Medicare, your real estate agent, or any government agency.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: "How to Fill a PDF Form Online",
            description:
              "Fill any PDF form online in 3 simple steps using QuickFill. Works with ATO, Medicare, Centrelink, rental applications, and all Australian government forms.",
            step: steps.map((s, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              name: s.title,
              text: s.description,
            })),
          }),
        }}
      />

      <div className="flex flex-col">
        {/* Hero */}
        <section className="bg-navy px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              How to Fill a PDF Form Online
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300">
              No software to install. Free account, no credit card required. Fill any PDF
              form, ATO tax returns, Medicare, Centrelink, rental apps, in your browser in under a minute.
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-16">
            {steps.map((step, i) => (
              <div key={step.title} className="flex gap-6">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-bold text-white">
                  {i + 1}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{step.title}</h2>
                  <p className="mt-3 leading-relaxed text-text-muted">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA - Client component handles Pro-aware rendering */}
        <section className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8">
          <HowItWorksContent />
        </section>
      </div>
    </>
  );
}
