"use client";

import { Check, X, Sparkles } from "lucide-react";
import { useState } from "react";

const features = [
  { name: "Documents per month", free: "3", pro: "Unlimited" },
  { name: "All field types (text, checkbox, signature, date)", free: true, pro: true },
  { name: "AcroForm auto-detection", free: true, pro: true },
  { name: "Instant PDF download", free: true, pro: true },
  { name: "Auto-fill profile", free: true, pro: true },
  { name: "Priority support", free: false, pro: true },
  { name: "Batch processing", free: false, pro: true },
];

const faqs = [
  {
    q: "Can I try QuickFill for free?",
    a: "Yes! You get 3 free PDF fills every month, no credit card required. Upload your first form and try it now.",
  },
  {
    q: "What happens when I hit my free limit?",
    a: "You'll be prompted to upgrade to Pro. Your filled documents are never lost — upgrade any time to continue.",
  },
  {
    q: "Can I cancel my Pro subscription?",
    a: "Absolutely. Cancel any time from your dashboard. You'll keep Pro access until the end of your billing period.",
  },
  {
    q: "What PDF forms does QuickFill support?",
    a: "QuickFill works with any PDF — tax forms, government applications, contracts, and more. It automatically detects AcroForm fields and supports manual field placement for flat PDFs.",
  },
  {
    q: "Is my data secure?",
    a: "Your PDFs are processed entirely in your browser. We never upload or store your documents on our servers.",
  },
];

export default function PricingPage() {
  const handleUpgrade = async () => {
    const res = await fetch("/api/stripe/checkout", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "QuickFill Pro",
            description: "Unlimited PDF form filling with priority support.",
            offers: {
              "@type": "Offer",
              price: "12.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
            },
          }),
        }}
      />

      <div className="flex flex-col">
        {/* Header */}
        <section className="bg-navy px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Simple, transparent pricing
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-gray-300">
              Start free. Upgrade when you need more.
            </p>
          </div>
        </section>

        {/* Plans */}
        <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
            {/* Free */}
            <div className="rounded-xl border border-border bg-surface p-8">
              <h2 className="text-lg font-semibold">Free</h2>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$0</span>
                <span className="text-text-muted">/month</span>
              </div>
              <p className="mt-4 text-sm text-text-muted">Perfect for occasional use.</p>
              <a
                href="/editor"
                className="mt-8 flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
              >
                Get Started Free
              </a>
            </div>

            {/* Pro */}
            <div className="relative rounded-xl border-2 border-accent bg-surface p-8 shadow-lg shadow-accent/10">
              <div className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
                Most Popular
              </div>
              <h2 className="text-lg font-semibold">Pro</h2>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$12</span>
                <span className="text-text-muted">/month</span>
              </div>
              <p className="mt-4 text-sm text-text-muted">For professionals and teams.</p>
              <button
                onClick={handleUpgrade}
                className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Upgrade to Pro
              </button>
            </div>
          </div>

          {/* Comparison table */}
          <div className="mx-auto mt-16 max-w-4xl overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt">
                  <th className="px-6 py-4 text-left font-semibold">Feature</th>
                  <th className="px-6 py-4 text-center font-semibold">Free</th>
                  <th className="px-6 py-4 text-center font-semibold text-accent">Pro</th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f.name} className="border-t border-border">
                    <td className="px-6 py-4">{f.name}</td>
                    <td className="px-6 py-4 text-center">
                      {typeof f.free === "string" ? (
                        f.free
                      ) : f.free ? (
                        <Check className="mx-auto h-4 w-4 text-accent" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-text-muted/40" />
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {typeof f.pro === "string" ? (
                        <span className="font-semibold text-accent">{f.pro}</span>
                      ) : f.pro ? (
                        <Check className="mx-auto h-4 w-4 text-accent" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-text-muted/40" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">
              Frequently Asked Questions
            </h2>
            <div className="mt-12 space-y-6">
              {faqs.map((faq) => (
                <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-5 text-left"
      >
        <span className="font-semibold">{question}</span>
        <span className="ml-4 shrink-0 text-text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-6 py-4 text-sm leading-relaxed text-text-muted">
          {answer}
        </div>
      )}
    </div>
  );
}
