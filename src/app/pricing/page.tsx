"use client";

import { Check, X, Sparkles, Loader2, ShieldCheck, LockKeyhole, CreditCard } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

const proFeatures = [
  "Unlimited documents",
  "All field types",
  "AcroForm detection",
  "No watermarks",
  "Auto-fill from profile",
  "Unlimited fill history",
  "Priority support",
];

const freeFeatures = [
  { label: "3 documents per month", included: true },
  { label: "All field types", included: true },
  { label: "AcroForm detection", included: true },
  { label: "Instant PDF download", included: true },
  { label: "Unlimited documents", included: false },
  { label: "No watermarks", included: false },
  { label: "Auto-fill from profile", included: false },
];

const tableFeatures = [
  { name: "Documents per month", free: "3", pro: "Unlimited" },
  { name: "No watermark on downloads", free: false, pro: true },
  { name: "Profile auto-fill", free: true, pro: true },
  { name: "AcroForm auto-detection", free: true, pro: true },
  { name: "All field types", free: true, pro: true },
  { name: "Fill history", free: "Last 10", pro: "Unlimited" },
  { name: "Priority support", free: false, pro: true },
];

const faqs = [
  {
    q: "Can I try QuickFill for free?",
    a: "Yes! You get 3 free PDF fills every month, no credit card required. Upload your first form and try it now.",
  },
  {
    q: "What happens when I hit my free limit?",
    a: "You'll be prompted to upgrade to Pro. Your filled documents are never lost, upgrade any time to continue.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Absolutely. Cancel any time from your dashboard. You'll keep access until the end of your billing period.",
  },
  {
    q: "What PDF forms does QuickFill support?",
    a: "QuickFill works with any PDF, tax forms, government applications, contracts, and more. It automatically detects AcroForm fields and supports manual field placement for flat PDFs.",
  },
  {
    q: "Is my data secure?",
    a: "PDFs are processed securely in memory for download generation and are not stored on our servers.",
  },
  {
    q: "What does Pro include?",
    a: "Pro gives you unlimited fills, no watermark, full fill history, and priority support, perfect for sole traders, bookkeepers, and anyone who regularly fills forms.",
  },
  {
    q: "Is the annual plan cheaper?",
    a: "Yes, the annual plan works out to $8.33/month (billed $100/year), saving you over $44 compared to monthly billing. That's more than 3 months free.",
  },
];

export default function PricingPage() {
  const { isSignedIn } = useAuth();
  const [annual, setAnnual] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [usage, setUsage] = useState<{ tier: string; isPro: boolean } | null>(null);

  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/usage")
        .then((r) => r.json())
        .then((data) => setUsage({ tier: data.tier ?? "free", isPro: data.isPro }))
        .catch(() => setUsage({ tier: "free", isPro: false }));
    }
  }, [isSignedIn]);

  const isPro = usage?.isPro ?? false;

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", annual }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      if (data.url) window.location.href = data.url;
    } finally {
      setUpgrading(false);
    }
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
              { "@type": "Offer", price: "12.00", priceCurrency: "AUD", availability: "https://schema.org/InStock", name: "Pro Monthly" },
              { "@type": "Offer", price: "100.00", priceCurrency: "AUD", availability: "https://schema.org/InStock", name: "Pro Annual" },
            ],
          }),
        }}
      />

      <div className="flex flex-col">
        {/* Header */}
        <section className="bg-navy px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Simple, transparent pricing
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-gray-300">
              Start free. Upgrade when the watermark or monthly limit gets in your way.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
              {[
                { icon: Check, text: "No credit card required" },
                { icon: CreditCard, text: "Cancel any time" },
                { icon: ShieldCheck, text: "Secure checkout by Stripe" },
              ].map((item) => (
                <span key={item.text} className="inline-flex items-center gap-2">
                  <item.icon className="h-4 w-4 text-accent" />
                  {item.text}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="bg-surface px-4 py-12 sm:px-6 lg:px-8 overflow-visible">
          <div className="mx-auto max-w-3xl">

            {/* Pro user block */}
            {isSignedIn && isPro && (
              <div className="mb-8 rounded-xl border border-accent bg-accent/5 px-6 py-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                  <Check className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-accent">You're already on Pro</h2>
                <p className="mt-2 text-sm text-text-muted">
                  You have unlimited fills, no watermarks, and priority support.
                </p>
                <Link href="/editor" className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover transition-colors">
                  Open Editor
                </Link>
              </div>
            )}

            {/* Cards row, Free + fanned Pro */}
            {!isPro && (
            <div className="grid gap-4 sm:grid-cols-2 sm:items-stretch pt-8">

              {/* Free */}
              <div className="flex flex-col rounded-xl border border-border bg-surface p-8">
                <h2 className="text-lg font-semibold">Free</h2>
                <div className="mt-4">
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-extrabold leading-none">$0</span>
                    <span className="text-text-muted text-sm leading-none pb-0.5">/month</span>
                  </div>
                  <div className="mt-2 h-7" />
                </div>
                <p className="mt-4 text-sm text-text-muted">Perfect for occasional use.</p>
                <ul className="mt-6 space-y-3">
                  {freeFeatures.map((item) => (
                    <li key={item.label} className={`flex items-start gap-2 text-sm ${!item.included ? "opacity-40" : ""}`}>
                      {item.included
                        ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        : <X className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />}
                      <span className={!item.included ? "line-through" : ""}>{item.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  {usage === null && isSignedIn ? (
                    <div className="flex h-11 items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                    </div>
                  ) : !isSignedIn ? (
                    <a href="/sign-up" className="flex h-11 items-center justify-center rounded-xl border-2 border-accent text-sm font-semibold text-accent hover:bg-accent/10 transition-colors">
                      Get Started Free
                    </a>
                  ) : !isPro ? (
                    <div className="flex h-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-500 cursor-default">
                      ✓ Current Plan
                    </div>
                  ) : (
                    <a href="/editor" className="flex h-11 items-center justify-center rounded-xl border-2 border-accent text-sm font-semibold text-accent hover:bg-accent/10 transition-colors">
                      Open Editor
                    </a>
                  )}
                </div>
              </div>

              {/* Pro, two cards, animated swap on click */}
              <style>{`
                @keyframes cardFloat {
                  0%   { transform: rotate(5deg) translateX(88px) translateY(8px); }
                  50%  { transform: rotate(6.5deg) translateX(91px) translateY(4px); }
                  100% { transform: rotate(5deg) translateX(88px) translateY(8px); }
                }
                .card-float-monthly { animation: cardFloat 3s ease-in-out infinite; }
                .card-float-annual  { animation: cardFloat 3s ease-in-out infinite; }
              `}</style>
              <div className="relative" style={{ overflow: "visible" }}>

                {/* Monthly card */}
                <div
                  className={`absolute inset-0 rounded-xl bg-[#1e3a6e] border border-white/15 cursor-pointer select-none ${annual ? "card-float-monthly" : ""}`}
                  style={{
                    zIndex: annual ? 1 : 2,
                    transform: annual ? undefined : "rotate(0deg) translateX(0px) translateY(0px)",
                    transformOrigin: "bottom center",
                    boxShadow: annual ? "0 8px 32px rgba(0,0,0,0.4)" : "0 20px 60px rgba(0,0,0,0.5)",
                    opacity: annual ? 0.88 : 1,
                    transition: annual ? "opacity 0.35s ease, box-shadow 0.35s ease" : "transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease, box-shadow 0.35s ease",
                  }}
                  onClick={() => annual && setAnnual(false)}
                >

                  {/* Full content, always visible */}
                  <div className="absolute inset-0 flex flex-col p-8">
                    <div className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">Most Popular</div>
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-white">Pro</h2>
                      <span className="text-sm font-extrabold text-blue-300 uppercase tracking-widest">Monthly</span>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-end gap-2">
                        <span className="text-4xl font-extrabold text-white leading-none">$12</span>
                        <span className="text-gray-400 text-xs leading-none pb-0.5">/month</span>
                      </div>
                      <div className="mt-2 h-7 flex items-center">
                        <button onClick={() => setAnnual(true)} className="text-xs text-accent font-semibold hover:underline">
                          💡 Switch to annual and save $44
                        </button>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-300">No limits, no watermarks, fill as many PDFs as you need.</p>
                    <ul className="mt-6 space-y-3">
                      {proFeatures.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-gray-200">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-8">
                      {isPro ? (
                        <div className="flex h-11 w-full items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white cursor-default">✓ Current Plan</div>
                      ) : (
                        <button onClick={handleUpgrade} disabled={upgrading}
                          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-all shadow-lg shadow-accent/40 hover:shadow-accent/60 disabled:opacity-70">
                          {upgrading ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</> : <><Sparkles className="h-4 w-4" /> Upgrade to Pro, $12/month</>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Annual card */}
                <div
                  className={`absolute inset-0 rounded-xl bg-navy cursor-pointer select-none ${!annual ? "card-float-annual" : ""}`}
                  style={{
                    zIndex: annual ? 2 : 1,
                    transform: annual ? "rotate(0deg) translateX(0px) translateY(0px)" : undefined,
                    transformOrigin: "bottom center",
                    boxShadow: annual ? "0 20px 60px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.4)",
                    opacity: annual ? 1 : 0.88,
                    transition: !annual ? "opacity 0.35s ease, box-shadow 0.35s ease" : "transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease, box-shadow 0.35s ease",
                  }}
                  onClick={() => !annual && setAnnual(true)}
                >


                  {/* Annual card full content, always visible */}
                  <div className="absolute inset-0 flex flex-col p-8">
                    <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-accent/20 blur-2xl" />
                    </div>
                    <div className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white z-10">
                      Best Value
                    </div>
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-white">Pro</h2>
                      <span className="text-sm font-extrabold text-accent uppercase tracking-widest">Annual</span>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-end gap-2">
                        <span className="text-4xl font-extrabold text-white leading-none">$8.33</span>
                        <span className="text-gray-400 text-xs leading-none pb-0.5">/month</span>
                      </div>
                      <div className="mt-2 h-7 flex items-center">
                        <div className="inline-flex items-center rounded-full bg-green-500/15 border border-green-500/25 px-3 py-1">
                          <span className="text-xs font-semibold text-green-400">🎉 Billed $100/year, save $44</span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-300">No limits, no watermarks, fill as many PDFs as you need.</p>
                    <ul className="mt-6 space-y-3">
                      {proFeatures.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-gray-200">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-8">
                      {isPro ? (
                        <div className="flex h-11 w-full items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white cursor-default">✓ Current Plan</div>
                      ) : (
                        <button onClick={handleUpgrade} disabled={upgrading}
                          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-all shadow-lg shadow-accent/40 hover:shadow-accent/60 disabled:opacity-70">
                          {upgrading ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</> : <><Sparkles className="h-4 w-4" /> Get Pro, $100/year</>}
                        </button>
                      )}

                    </div>
                  </div>
                </div>

                {/* Invisible spacer so the parent has natural height */}
                <div className="invisible flex flex-col rounded-xl bg-navy p-8">
                  <h2 className="text-lg font-semibold">Pro</h2>
                  <div className="mt-4">
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-extrabold leading-none">$8.33</span>
                      <span className="text-xs leading-none pb-0.5">/month</span>
                    </div>
                    <div className="mt-2 h-7" />
                  </div>
                  <p className="mt-4 text-sm">Unlimited fills, no watermark, priority support.</p>
                  <ul className="mt-6 space-y-3">
                    {proFeatures.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-8">
                    <div className="h-11 w-full" />
                    <p className="mt-3 text-xs">Spacer</p>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Comparison table - hide for Pro users */}
            {!isPro && (
            <div className="mt-20 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-alt">
                    <th className="px-6 py-4 text-left font-semibold">Feature</th>
                    <th className="px-6 py-4 text-center font-semibold">Free</th>
                    <th className="px-6 py-4 text-center font-semibold text-accent">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {tableFeatures.map((f) => (
                    <tr key={f.name} className="border-t border-border">
                      <td className="px-6 py-4">{f.name}</td>
                      <td className="px-6 py-4 text-center">
                        {typeof f.free === "string" ? f.free : f.free
                          ? <Check className="mx-auto h-4 w-4 text-accent" />
                          : <X className="mx-auto h-4 w-4 text-text-muted/40" />}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {typeof f.pro === "string"
                          ? <span className="font-semibold text-accent">{f.pro}</span>
                          : f.pro
                          ? <Check className="mx-auto h-4 w-4 text-accent" />
                          : <X className="mx-auto h-4 w-4 text-text-muted/40" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </section>
        {/* Trust strip */}
        <div className="bg-surface border-y border-border px-4 py-5 text-sm text-text-muted">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {[
              { icon: ShieldCheck, text: "Secure checkout by Stripe" },
              { icon: CreditCard, text: "Cancel any time" },
              { icon: LockKeyhole, text: "PDFs are not stored" },
            ].map((item) => (
              <span key={item.text} className="inline-flex items-center gap-2">
                <item.icon className="h-4 w-4 text-accent" />
                {item.text}
              </span>
            ))}
          </div>
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
