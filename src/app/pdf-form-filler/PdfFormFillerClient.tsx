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
import HeroEditorDemo from "@/components/HeroEditorDemo";

export default function PdfFormFillerClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    captureAndStoreUtm();
    trackEvent("landing_page_view", { page: "ad-landing" });
    trackMetaEvent("ViewContent", { content_name: "pdf-form-filler" });
  }, []);

  const faqs = [
    {
      question: "Will QuickFill store my PDF?",
      answer: "No. Your PDF is processed to generate your download, then discarded. It is never saved to our servers, read by our team, or shared with anyone.",
    },
    {
      question: "Does it work with locked fields?",
      answer: "Yes. QuickFill overlays text, checkboxes, signatures, and dates directly onto the PDF, even fields that are locked or read-only in other tools.",
    },
    {
      question: "What Australian forms does it support?",
      answer: "Any PDF. QuickFill includes 15+ built-in templates: TFN declarations, Medicare, Centrelink, NDIS, rental applications, and ATO BAS forms. Your own PDFs work too.",
    },
    {
      question: "Do I need to create an account?",
      answer: "Not to start. Upload a PDF and fill it right now. An account is only needed to save your profile for auto-fill or track your fill history.",
    },
    {
      question: "What devices does it work on?",
      answer: "All of them. Phone, tablet, laptop, desktop, any browser, no software to install.",
    },
    {
      question: "How do I upgrade to Pro?",
      answer: "Click Go Pro on this page or from within the editor. Checkout takes under a minute through Stripe. Cancel anytime from your account settings.",
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Section 1: Hero */}
      <section className="relative overflow-hidden bg-navy px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="relative mx-auto max-w-5xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Stop printing PDF forms. Fill them online instead.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 sm:text-xl">
            Upload any Australian PDF, fill it in your browser, download it instantly. No Adobe. No printing. No scanning. Free to start.
          </p>

          {/* Trust pills */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {[
              "Fill any PDF without locked fields stopping you",
              "3 free fills every month, no card needed",
              "Built for Australian forms: TFN, Centrelink, rentals, NDIS",
            ].map((text) => (
              <span key={text} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-300">
                <Check className="h-4 w-4 text-accent" />
                {text}
              </span>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/editor"
              onClick={() => {
                trackEvent("home_cta_click", { cta: "ad_hero_primary" });
                trackMetaEvent("Lead", { content_name: "ad_hero_primary" });
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-colors sm:w-auto"
            >
              Fill a PDF Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/templates"
              onClick={() => trackEvent("home_cta_click", { cta: "ad_hero_secondary" })}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 px-6 text-base font-semibold text-white hover:bg-white/10 transition-colors sm:w-auto"
            >
              Browse Templates
            </Link>
          </div>

          {/* Trust micro-copy */}
          <p className="mt-4 text-center text-xs text-gray-400">
            Your PDF is never stored on our servers. 3 free fills every month.
          </p>

          {/* Hero visual */}
          <HeroEditorDemo />
        </div>
      </section>

      {/* Section 2: Social Proof Strip */}
      <section className="bg-surface border-y border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-4">
          {[
            { value: "15+", label: "Australian templates" },
            { value: "3", label: "free fills/month" },
            { value: "0", label: "PDFs stored" },
            { value: "60 sec", label: "average fill time" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-surface-alt px-4 py-5 text-center">
              <p className="text-2xl font-extrabold text-text">{stat.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Before / After Pain Section */}
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
            {/* Old Way */}
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

            {/* With QuickFill */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/30 p-6">
              <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-400 mb-4">WITH QUICKFILL</h3>
              <ul className="space-y-3">
                {[
                  "Upload your PDF",
                  "Type your details",
                  "Download instantly",
                ].map((item) => (
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
            Whether it is a TFN declaration, Centrelink form, rental application, or NDIS paperwork: QuickFill handles it. No software to install. Works on any device, any browser.
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
            Three steps. Done.
          </h2>

          <div className="grid sm:grid-cols-3 gap-4 mt-12">
            {[
              {
                number: "1",
                title: "Upload",
                description: "Drop your PDF into QuickFill. Works on phone, tablet, or desktop.",
              },
              {
                number: "2",
                title: "Fill",
                description: "Type your details. Add checkboxes, signatures, dates, and more.",
              },
              {
                number: "3",
                title: "Download",
                description: "Your completed PDF is ready instantly. Print it or email it.",
              },
            ].map((step) => (
              <div key={step.number} className="rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
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

      {/* Section 5: Trust / Security Block */}
      <section className="bg-surface px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Your forms stay private.
          </h2>
          <p className="text-text-muted text-center mt-4 max-w-2xl mx-auto">
            This is sensitive paperwork. Here is exactly how QuickFill handles it.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 mt-10">
            {[
              {
                icon: LockKeyhole,
                title: "No PDF storage",
                body: "Your PDF is used to create your download, then discarded. Period.",
              },
              {
                icon: ShieldCheck,
                title: "Private by design",
                body: "Your document is not read by us, not stored on our servers, and never shared with anyone.",
              },
              {
                icon: BadgeCheck,
                title: "Built for AU forms",
                body: "ATO, Medicare, Centrelink, NDIS, council, and rental forms. Tested on the documents Australians actually use.",
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

          <Link href="/privacy" className="mt-8 inline-flex items-center gap-1 text-sm text-accent hover:underline mx-auto">
            Read our full privacy policy <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Section 6: Pricing / Value Block */}
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
              <p className="text-4xl font-extrabold mt-4">$0</p>
              <p className="text-sm text-text-muted">3 fills every month</p>

              <ul className="mt-6 space-y-3">
                {[
                  "3 fills per month",
                  "All field types",
                  "Works on any device",
                  "No account to start",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-accent" />
                    <span>{feature}</span>
                  </li>
                ))}
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
              <p className="text-4xl font-extrabold mt-4">A$12 <span className="text-lg font-normal text-text-muted">/month</span></p>
              <p className="text-sm text-text-muted">or A$100/year (save A$44)</p>

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
                href="/checkout?plan=pro&billing=annual&source=ad_landing"
                onClick={() => {
                  trackEvent("checkout_start", { source: "ad_landing_pricing", plan: "pro", billing: "annual" });
                  trackMetaEvent("InitiateCheckout", { content_name: "pro", content_type: "annual" });
                }}
                className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
              >
                <Sparkles className="h-4 w-4" /> Go Pro
              </Link>
              <p className="text-xs text-text-muted text-center mt-3">Secure checkout by Stripe. Cancel anytime.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: FAQ */}
      <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Questions people ask before uploading
          </h2>

          <div className="mt-12 divide-y divide-border">
            {faqs.map((faq, index) => (
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

      {/* Section 8: Final CTA Strip */}
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
    </div>
  );
}
