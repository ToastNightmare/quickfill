"use client";

import { Check, X, Sparkles } from "lucide-react";
import { useState } from "react";

const features = [
  { name: "Documents per month", free: "3", pro: "Unlimited", business: "Unlimited" },
  { name: "No watermark on downloads", free: false, pro: true, business: true },
  { name: "Profile auto-fill", free: true, pro: true, business: true },
  { name: "AcroForm auto-detection", free: true, pro: true, business: true },
  { name: "All field types", free: true, pro: true, business: true },
  { name: "Fill history", free: "Last 3", pro: "Last 10", business: "Unlimited" },
  { name: "Priority support", free: false, pro: true, business: true },
  { name: "Dedicated account support", free: false, pro: false, business: true },
  { name: "Team profiles", free: false, pro: false, business: "Coming soon" },
  { name: "API access", free: false, pro: false, business: "Coming soon" },
];

const faqs = [
  {
    q: "Can I try QuickFill for free?",
    a: "Yes! You get 3 free PDF fills every month, no credit card required. Upload your first form and try it now.",
  },
  {
    q: "What happens when I hit my free limit?",
    a: "You'll be prompted to upgrade to Pro or Business. Your filled documents are never lost  -  upgrade any time to continue.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Absolutely. Cancel any time from your dashboard. You'll keep access until the end of your billing period.",
  },
  {
    q: "What PDF forms does QuickFill support?",
    a: "QuickFill works with any PDF  -  tax forms, government applications, contracts, and more. It automatically detects AcroForm fields and supports manual field placement for flat PDFs.",
  },
  {
    q: "Is my data secure?",
    a: "Your PDFs are processed entirely in your browser. We never upload or store your documents on our servers.",
  },
  {
    q: "What's the difference between Pro and Business?",
    a: "Pro gives you unlimited fills with no watermark  -  perfect for individuals and sole traders. Business adds unlimited fill history, dedicated support, and team features like shared profiles and API access  -  built for agencies and bookkeeping firms.",
  },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const handleUpgrade = async (plan: "pro" | "business") => {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    if (data.url) window.location.href = data.url;
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
            offers: [
              {
                "@type": "Offer",
                price: "12.00",
                priceCurrency: "AUD",
                availability: "https://schema.org/InStock",
                name: "Pro",
              },
              {
                "@type": "Offer",
                price: "29.00",
                priceCurrency: "AUD",
                availability: "https://schema.org/InStock",
                name: "Business",
              },
            ],
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

            {/* Monthly/Annual toggle */}
            <div className="mt-8 flex justify-center">
              <div className="inline-flex rounded-full bg-white/10 p-1">
                <button
                  onClick={() => setBilling("monthly")}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    billing === "monthly"
                      ? "bg-white text-navy shadow"
                      : "text-gray-300 hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBilling("annual")}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    billing === "annual"
                      ? "bg-white text-navy shadow"
                      : "text-gray-300 hover:text-white"
                  }`}
                >
                  Annual
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Free */}
            <div className="rounded-xl border border-border bg-surface p-8">
              <h2 className="text-lg font-semibold">Free</h2>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$0</span>
                <span className="text-text-muted">/month</span>
              </div>
              <p className="mt-4 text-sm text-text-muted">Perfect for occasional use.</p>
              <p className="mt-2 text-xs font-medium text-text-muted">Best for: Occasional form filling</p>
              <a
                href="/editor"
                className="mt-8 flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
              >
                Get Started Free
              </a>
            </div>

            {/* Pro */}
            <div className="relative rounded-xl border-2 border-accent bg-surface p-8 shadow-lg shadow-accent/10">
              {billing === "annual" ? (
                <div className="absolute -top-3 left-6 rounded-full bg-green-500 px-3 py-0.5 text-xs font-semibold text-white">
                  Best Value
                </div>
              ) : (
                <div className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}
              <h2 className="text-lg font-semibold">Pro</h2>
              <div className="mt-4">
                {billing === "monthly" ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold">$12</span>
                    <span className="text-text-muted">/month</span>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-extrabold">$99</span>
                      <span className="text-text-muted">/year</span>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        Save $45
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      $8.25/month, billed annually
                    </p>
                  </div>
                )}
              </div>
              <p className="mt-4 text-sm text-text-muted">Unlimited fills, no watermark, priority support.</p>
              <p className="mt-2 text-xs font-medium text-text-muted">Best for: Sole traders, bookkeepers, individuals</p>
              {billing === "monthly" ? (
                <button
                  onClick={() => handleUpgrade("pro")}
                  className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  Upgrade to Pro
                </button>
              ) : (
                <button
                  disabled
                  className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent/60 text-sm font-semibold text-white cursor-not-allowed"
                >
                  Coming Soon
                </button>
              )}
            </div>

            {/* Business */}
            <div className="rounded-xl border border-white/10 p-8" style={{ backgroundColor: "#1a1a2e" }}>
              <h2 className="text-lg font-semibold text-white">Business</h2>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-white">$29</span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="mt-4 text-sm text-gray-300">Built for agencies &amp; bookkeepers.</p>
              <p className="mt-2 text-xs font-medium text-gray-400">Best for: Agencies, teams, and organisations</p>
              {billing === "monthly" ? (
                <button
                  onClick={() => handleUpgrade("business")}
                  className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[#1a1a2e] hover:bg-gray-100 transition-colors"
                >
                  Get Business
                </button>
              ) : (
                <button
                  disabled
                  className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 text-sm font-semibold text-gray-400 cursor-not-allowed"
                >
                  Coming Soon
                </button>
              )}
            </div>
          </div>

          {/* Comparison table */}
          <div className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt">
                  <th className="px-6 py-4 text-left font-semibold">Feature</th>
                  <th className="px-6 py-4 text-center font-semibold">Free</th>
                  <th className="px-6 py-4 text-center font-semibold text-accent">Pro</th>
                  <th className="px-6 py-4 text-center font-semibold">Business</th>
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
                    <td className="px-6 py-4 text-center">
                      {typeof f.business === "string" ? (
                        <span className="font-semibold">{f.business}</span>
                      ) : f.business ? (
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

        {/* Trust strip */}
        <div className="bg-surface border-y border-border px-4 py-5 text-center text-sm text-text-muted">
          🔒 Secure checkout via Stripe · Cancel any time · No setup fees · Instant access
        </div>

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
        <span className="ml-4 shrink-0 text-text-muted">{open ? "\u2212" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-6 py-4 text-sm leading-relaxed text-text-muted">
          {answer}
        </div>
      )}
    </div>
  );
}
