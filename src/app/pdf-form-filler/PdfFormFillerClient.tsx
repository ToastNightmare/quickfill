"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { trackMetaEvent } from "@/lib/meta-pixel";
import { captureAndStoreUtm } from "@/lib/utm";
import { LandingUploadBox } from "@/components/LandingUploadBox";
import { PRICING } from "@/lib/pricing";

const FAQS = [
  {
    question: "Can I fill a PDF form online?",
    answer:
      "Yes. Upload your PDF, type into the fields, add checkboxes, dates, and signatures, then download the completed file. It all happens in your browser, no printing or scanning.",
  },
  {
    question: "Do I need to install software?",
    answer:
      "No. QuickFill runs in your web browser on phone, tablet, laptop, or desktop. There is nothing to download or install.",
  },
  {
    question: "Can I download the completed PDF?",
    answer:
      "Yes. Once you have filled in your form, download the finished PDF instantly. You can then print it or email it like any normal file.",
  },
  {
    question: "Is QuickFill a government website?",
    answer:
      "No. QuickFill is an independent online tool for filling and completing PDF documents. It is not affiliated with any government department and does not provide legal, tax, or official advice.",
  },
  {
    question: "What happens after I upload my PDF?",
    answer:
      "Your PDF is loaded so you can type on it and place fields. When you download, it is processed only to generate your completed file. It is not saved to our servers, not read by our team, and never shared.",
  },
  {
    question: "Do I need an account to start?",
    answer:
      "Not to start. Upload a PDF and fill it right now. An account is only needed to save a profile for faster filling or to track your fill history.",
  },
];

export default function PdfFormFillerClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    captureAndStoreUtm();
    trackEvent("landing_page_view", { page: "ad-landing" });
    trackMetaEvent("ViewContent", { content_name: "pdf-form-filler" });
  }, []);

  // FAQ structured data for SEO (low risk, general intent only)
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="flex flex-col">
      {/* FAQ structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Section 1: Hero with real upload box above the fold */}
      <section className="relative overflow-hidden bg-navy px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Fill PDF Forms Online
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 sm:text-xl">
            Upload your PDF, type into it, and download the completed file without printing or scanning.
          </p>

          {/* Real upload box, connected to the editor flow */}
          <LandingUploadBox />

          {/* Trust pills */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {[
              "Type on any PDF in your browser",
              "3 free fills every month, no card needed",
              "Works on phone, tablet, and desktop",
            ].map((text) => (
              <span
                key={text}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-300"
              >
                <Check className="h-4 w-4 text-accent" />
                {text}
              </span>
            ))}
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">
            Your PDF is not saved to our servers. 3 free fills every month.
          </p>
        </div>
      </section>

      {/* Section 2: Stats strip */}
      <section className="bg-surface border-y border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-4">
          {[
            { value: "Any", label: "PDF supported" },
            { value: "3", label: "free fills/month" },
            { value: "0", label: "software to install" },
            { value: "60 sec", label: "average fill time" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-surface-alt px-4 py-5 text-center"
            >
              <p className="text-2xl font-extrabold text-text">{stat.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Before / After */}
      <section className="bg-surface px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="inline-flex rounded-full bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
              Sound familiar?
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl text-center">
              The old way is costing you time.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-10">
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30 p-6">
              <h3 className="text-base font-bold text-red-700 dark:text-red-400 mb-4">THE OLD WAY</h3>
              <ul className="space-y-3">
                {[
                  "Print the PDF",
                  "Hand-write every field",
                  "Hope for no mistakes",
                  "Scan it back in",
                  "Email the scan",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-400 text-xs font-bold">
                      ✗
                    </span>
                    <span className="text-sm text-red-800 dark:text-red-300">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400 mt-4">~20 minutes</p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/30 p-6">
              <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-400 mb-4">WITH QUICKFILL</h3>
              <ul className="space-y-3">
                {["Upload your PDF", "Type your details", "Download instantly"].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                      ✓
                    </span>
                    <span className="text-sm text-emerald-800 dark:text-emerald-300">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-4">~60 seconds</p>
            </div>
          </div>

          <p className="text-text-muted text-sm text-center max-w-2xl mx-auto mt-6">
            Whether it is an application, a worksheet, or everyday paperwork, QuickFill lets you type on the PDF and download it. No software to install. Works on any device, any browser.
          </p>

          <Link
            href="/editor"
            onClick={() => {
              trackEvent("home_cta_click", { cta: "ad_painpoint_cta" });
              trackMetaEvent("Lead", { content_name: "ad_painpoint_cta" });
            }}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors sm:w-auto mx-auto"
          >
            Try it now, free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Section 4: 3-Step How It Works */}
      <section className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            How it works
          </h2>

          <div className="grid sm:grid-cols-3 gap-4 mt-12">
            {[
              {
                number: "1",
                title: "Upload your PDF",
                description: "Drop your PDF into QuickFill. Works on phone, tablet, or desktop.",
              },
              {
                number: "2",
                title: "Fill the form",
                description: "Type on the PDF. Add text, checkboxes, signatures, and dates.",
              },
              {
                number: "3",
                title: "Download your completed PDF",
                description: "Your finished PDF is ready instantly. Print it or email it.",
              },
            ].map((step) => (
              <div
                key={step.number}
                className="rounded-lg border border-border bg-surface p-6 text-center shadow-sm"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-bold text-white">
                  {step.number}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-text-muted leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5: Trust / Privacy (verified claims only) */}
      <section className="bg-surface px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Your forms stay private.
          </h2>
          <p className="text-text-muted text-center mt-4 max-w-2xl mx-auto">
            QuickFill is designed to help you complete your PDF and download the finished file. Here is how your file is handled.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 mt-10">
            {[
              {
                icon: LockKeyhole,
                title: "Not saved to our servers",
                body: "Your PDF is processed only to generate your download, then discarded. It is not saved to disk or a database.",
              },
              {
                icon: ShieldCheck,
                title: "Not read, not shared",
                body: "We do not read the contents of your document, and it is never shared with anyone.",
              },
              {
                icon: BadgeCheck,
                title: "Works with any PDF",
                body: "Upload your own PDF, or start from a built-in template. Type on it and download the result.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-surface-alt p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 mb-4">
                  <item.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-semibold text-base">{item.title}</h3>
                <p className="mt-2 text-sm text-text-muted leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <Link
            href="/privacy"
            className="mt-8 inline-flex items-center gap-1 text-sm text-accent hover:underline mx-auto"
          >
            Read our full privacy policy <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Section 6: Pricing clarity */}
      <section className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Start free. Upgrade when you are ready.
          </h2>

          <div className="grid md:grid-cols-2 gap-6 mt-12">
            {/* Free card */}
            <div className="rounded-xl border border-border bg-surface p-8">
              <span className="inline-flex rounded-full bg-surface-alt px-3 py-1 text-xs font-bold uppercase tracking-wide text-text-muted">
                FREE
              </span>
              <p className="text-4xl font-extrabold mt-4">A$0</p>
              <p className="text-sm text-text-muted">Free to start, 3 fills every month</p>

              <ul className="mt-6 space-y-3">
                {["3 fills per month", "All field types", "Works on any device", "No account to start"].map(
                  (feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-accent" />
                      <span>{feature}</span>
                    </li>
                  )
                )}
              </ul>

              <Link
                href="/editor"
                onClick={() => trackEvent("home_cta_click", { cta: "ad_pricing_free" })}
                className="mt-8 flex h-11 w-full items-center justify-center rounded-lg border border-border text-sm font-semibold text-text hover:bg-surface-alt transition-colors"
              >
                Fill a PDF Free
              </Link>
            </div>

            {/* Pro card */}
            <div className="rounded-xl border-2 border-accent bg-surface p-8 relative">
              <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent">
                MOST POPULAR
              </span>
              <span className="mt-4 inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-600">
                {PRICING.pro.monthly.introBadge}
              </span>
              <p className="text-4xl font-extrabold mt-2">
                {PRICING.pro.monthly.introTodayLabel}
              </p>
              <p className="text-sm font-medium text-text-muted">{PRICING.pro.monthly.thenLabel}. Cancel anytime.</p>
              <p className="mt-1 text-sm text-text-muted">{PRICING.pro.annual.orLabel} ({PRICING.pro.annual.savingsLabel})</p>

              <ul className="mt-6 space-y-3">
                {[
                  "Unlimited fills",
                  "No watermarks",
                  "Save and resume progress",
                  "Fill history",
                  "Priority support",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-accent" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/checkout?plan=pro&billing=monthly&source=ad_landing"
                onClick={() => {
                  trackEvent("checkout_start", {
                    source: "ad_landing_pricing",
                    plan: "pro",
                    billing: "monthly",
                  });
                  trackMetaEvent("InitiateCheckout", { content_name: "pro", content_type: "monthly" });
                }}
                className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
              >
                <Sparkles className="h-4 w-4" /> {PRICING.pro.monthly.ctaLabel}
              </Link>
              <p className="text-xs font-medium text-text text-center mt-2">
                {PRICING.pro.monthly.finePrint}
              </p>
              <Link
                href="/checkout?plan=pro&billing=annual&source=ad_landing"
                onClick={() => {
                  trackEvent("checkout_start", {
                    source: "ad_landing_pricing",
                    plan: "pro",
                    billing: "annual",
                  });
                  trackMetaEvent("InitiateCheckout", { content_name: "pro", content_type: "annual" });
                }}
                className="mt-3 flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-semibold text-text hover:bg-surface-alt transition-colors"
              >
                {PRICING.pro.annual.ctaLabel}
              </Link>
              <p className="text-xs text-text-muted text-center mt-2">
                Annual: {PRICING.pro.annual.disclosure} Secure checkout by Stripe.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: FAQ */}
      <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>

          <div className="mt-12 divide-y divide-border">
            {FAQS.map((faq, index) => (
              <div key={index} className="pt-6">
                <button
                  type="button"
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="font-semibold text-base">{faq.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 text-text-muted transition-transform ${
                      openIndex === index ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openIndex === index && (
                  <p className="text-sm text-text-muted leading-relaxed mt-2 pb-6">{faq.answer}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 8: Final CTA */}
      <section className="bg-navy px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Stop printing. Start filling.
          </h2>
          <p className="text-gray-300 mt-4">Try QuickFill free, no account needed to start.</p>

          <Link
            href="/editor"
            onClick={() => {
              trackEvent("home_cta_click", { cta: "ad_final_cta" });
              trackMetaEvent("Lead", { content_name: "ad_final_cta" });
            }}
            className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-colors sm:w-auto mx-auto"
          >
            Fill a PDF Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-surface px-4 py-10 sm:px-6 lg:px-8 border-t border-border">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs leading-relaxed text-text-muted text-center">
            QuickFill is not a government website and does not provide legal, tax, medical, Centrelink, Medicare, migration, tenancy, or benefits advice.
          </p>
        </div>
      </section>
    </div>
  );
}
