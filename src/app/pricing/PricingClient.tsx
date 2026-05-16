"use client";

import { Check, CreditCard, Loader2, LockKeyhole, ShieldCheck, Sparkles, X } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

const freeIncludes = [
  "3 documents per month",
  "All field types",
  "AcroForm detection",
  "Instant PDF download",
];

const proAdds = [
  "Unlimited documents",
  "No watermarks",
  "Auto-fill from profile",
  "Save and resume progress",
  "Re-fill from history",
  "Unlimited fill history",
  "Priority support",
];

const tableFeatures = [
  { name: "Documents per month", free: "3", pro: "Unlimited" },
  { name: "No watermark on downloads", free: false, pro: true },
  { name: "Profile auto-fill", free: false, pro: true },
  { name: "AcroForm auto-detection", free: true, pro: true },
  { name: "All field types", free: true, pro: true },
  { name: "Fill history", free: "Last 10", pro: "Unlimited" },
  { name: "Priority support", free: false, pro: true },
];

const faqs = [
  {
    q: "Can I try QuickFill for free?",
    a: "Yes. You get 3 free PDF fills every month, no credit card required.",
  },
  {
    q: "What happens when I hit my free limit?",
    a: "You will be prompted to upgrade to Pro. Your filled documents are not lost, and you can upgrade any time to continue.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Yes. Cancel any time from your dashboard. You keep access until the end of your billing period.",
  },
  {
    q: "What PDF forms does QuickFill support?",
    a: "QuickFill works with tax forms, government applications, contracts, rental paperwork, and other PDFs. It detects AcroForm fields and supports manual field placement for flat PDFs.",
  },
  {
    q: "Is my data secure?",
    a: "PDFs are processed securely in memory for download generation and are not stored on our servers.",
  },
  {
    q: "Is the annual plan cheaper?",
    a: "Yes. Annual billing is A$100/year, which works out to A$8.33/month and saves A$44 compared with monthly billing.",
  },
];

type UsageState = {
  tier: string;
  isPro: boolean;
};

function isPaidUsage(usage: UsageState | null): boolean {
  const tier = usage?.tier ?? "free";
  return Boolean(usage?.isPro || tier === "pro" || tier === "business");
}

export default function PricingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [annual, setAnnual] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [checkingPlan, setCheckingPlan] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setUsage(null);
      setCheckingPlan(false);
      return;
    }

    let cancelled = false;

    const readUsage = async (): Promise<UsageState> => {
      const res = await fetch("/api/usage");
      if (!res.ok) throw new Error("Usage could not be loaded.");
      const data = await res.json();
      return { tier: data.tier ?? "free", isPro: Boolean(data.isPro) };
    };

    const loadPlan = async () => {
      setCheckingPlan(true);
      try {
        let nextUsage = await readUsage();

        if (!isPaidUsage(nextUsage)) {
          await fetch("/api/billing/sync", { method: "POST" }).catch(() => null);
          nextUsage = await readUsage();
        }

        if (!cancelled) setUsage(nextUsage);
      } catch {
        if (!cancelled) setUsage({ tier: "free", isPro: false });
      } finally {
        if (!cancelled) setCheckingPlan(false);
      }
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "cancelled") return;

    const billing = params.get("billing") ?? "unknown";
    setCheckoutNotice("Checkout was cancelled. No charge was made, and you can restart whenever you are ready.");
    trackEvent("checkout_cancelled", { source: "pricing", billing });

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("checkout");
    cleanUrl.searchParams.delete("plan");
    cleanUrl.searchParams.delete("billing");
    window.history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, []);

  const isPro = isPaidUsage(usage);
  const planStillLoading = Boolean(isSignedIn && (usage === null || checkingPlan));
  const priceLabel = annual ? "A$100/year" : "A$12/month";

  const handleUpgrade = async () => {
    trackEvent("checkout_start", { source: "pricing", plan: annual ? "annual" : "monthly" });
    setCheckoutNotice(null);
    setCheckoutError(null);

    if (!isLoaded) return;

    if (isPro) {
      window.location.href = "/dashboard";
      return;
    }

    if (!isSignedIn) {
      window.location.href = `/checkout?plan=pro&billing=${annual ? "annual" : "monthly"}&source=pricing`;
      return;
    }

    setUpgrading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", annual }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? "Checkout could not be started. Please try again.");
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Checkout could not be started. Please try again.");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout could not be started. Please try again.");
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
            description: "Unlimited PDF form filling with no watermark and priority support.",
            offers: [
              {
                "@type": "Offer",
                price: "12.00",
                priceCurrency: "AUD",
                availability: "https://schema.org/InStock",
                name: "Pro Monthly",
              },
              {
                "@type": "Offer",
                price: "100.00",
                priceCurrency: "AUD",
                availability: "https://schema.org/InStock",
                name: "Pro Annual",
              },
            ],
          }),
        }}
      />

      <div className="flex flex-col">
        <section className="bg-navy px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {isPro ? "Your Pro plan is active" : "Simple, transparent pricing"}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-gray-300">
              {isPro
                ? "You have unlimited downloads, no watermark, and priority support."
                : "Start free. Upgrade when you need unlimited downloads and no watermark."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
              <TrustItem icon={Check} text="No credit card required" />
              <TrustItem icon={CreditCard} text="Cancel any time" />
              <TrustItem icon={ShieldCheck} text="Secure checkout by Stripe" />
            </div>
          </div>
        </section>

        <section className="bg-surface px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            {checkoutNotice && (
              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-800">
                {checkoutNotice}
              </div>
            )}
            {checkoutError && !planStillLoading && !isPro && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
                {checkoutError}
              </div>
            )}
            {planStillLoading ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-6 py-8 text-center">
                <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-accent" />
                <h2 className="text-xl font-bold text-text">Checking your Pro status</h2>
                <p className="mt-2 text-sm text-text-muted">
                  QuickFill is confirming your current plan before showing checkout options.
                </p>
              </div>
            ) : isSignedIn && isPro ? (
              <div className="rounded-lg border border-accent bg-accent/5 px-6 py-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                  <Check className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-accent">You are already on Pro</h2>
                <p className="mt-2 text-sm text-text-muted">
                  You have unlimited fills, no watermarks, and priority support.
                </p>
                <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link
                    href="/dashboard"
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-surface px-6 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent"
                  >
                    Go to dashboard
                  </Link>
                  <Link
                    href="/editor"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                  >
                    Fill a PDF
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
                  <PlanCard title="Free" price="$0" suffix="/month" description="For occasional PDF forms and quick one-off jobs." items={freeIncludes}>
                    {!isSignedIn ? (
                      <Link
                        href="/sign-up"
                        className="flex h-11 items-center justify-center rounded-lg border-2 border-accent text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
                      >
                        Get Started Free
                      </Link>
                    ) : (
                      <div className="flex h-11 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-500">
                        Current Plan
                      </div>
                    )}
                  </PlanCard>

                  <div className="flex flex-col overflow-hidden rounded-lg border-2 border-accent bg-surface shadow-xl shadow-accent/15">
                    <div className="bg-navy p-6 text-white">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-semibold">Pro</h2>
                          <p className="mt-1 text-sm text-gray-300">Unlimited fills, no watermark, priority support.</p>
                        </div>
                        <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">Best value</span>
                      </div>

                      <div className="mt-6 grid grid-cols-2 rounded-lg border border-white/15 bg-white/5 p-1">
                        <button
                          type="button"
                          onClick={() => setAnnual(true)}
                          className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${annual ? "bg-white text-navy" : "text-gray-300 hover:text-white"}`}
                        >
                          Annual
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnnual(false)}
                          className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${!annual ? "bg-white text-navy" : "text-gray-300 hover:text-white"}`}
                        >
                          Monthly
                        </button>
                      </div>

                      <div className="mt-6">
                        <div className="flex items-end gap-2">
                          <span className="text-4xl font-extrabold leading-none">{annual ? "A$100" : "A$12"}</span>
                          <span className="pb-1 text-sm text-gray-300">{annual ? "/year" : "/month"}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-300">
                          {annual ? "Works out to A$8.33/month. Save A$44 a year." : "Flexible monthly billing. Cancel any time."}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-6">
                      <p className="text-xs font-semibold uppercase text-text-muted">Pro adds</p>
                      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                        {proAdds.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-auto pt-8">
                        <button
                          type="button"
                          onClick={handleUpgrade}
                          disabled={upgrading}
                          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-70"
                        >
                          {upgrading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" /> Get Pro, {priceLabel}
                            </>
                          )}
                        </button>
                        <p className="mt-3 text-center text-xs text-text-muted">Secure checkout by Stripe. Cancel any time.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10 overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-alt">
                        <th className="px-6 py-4 text-left font-semibold">Feature</th>
                        <th className="px-6 py-4 text-center font-semibold">Free</th>
                        <th className="px-6 py-4 text-center font-semibold text-accent">Pro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableFeatures.map((feature) => (
                        <tr key={feature.name} className="border-t border-border">
                          <td className="px-6 py-4">{feature.name}</td>
                          <FeatureValue value={feature.free} />
                          <FeatureValue value={feature.pro} highlight />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="border-y border-border bg-surface px-4 py-5 text-sm text-text-muted">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <TrustItem icon={ShieldCheck} text="Secure checkout by Stripe" />
            <TrustItem icon={CreditCard} text="Cancel any time" />
            <TrustItem icon={LockKeyhole} text="PDFs are not stored" />
          </div>
        </div>

        <section className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">Frequently Asked Questions</h2>
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

function PlanCard({
  title,
  price,
  suffix,
  description,
  items,
  children,
}: {
  title: string;
  price: string;
  suffix: string;
  description: string;
  items: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-4xl font-extrabold leading-none">{price}</span>
        <span className="pb-1 text-sm text-text-muted">{suffix}</span>
      </div>
      <p className="mt-4 text-sm text-text-muted">{description}</p>
      <p className="mt-6 text-xs font-semibold uppercase text-text-muted">{title} includes</p>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">{children}</div>
    </div>
  );
}

function FeatureValue({ value, highlight = false }: { value: string | boolean; highlight?: boolean }) {
  return (
    <td className="px-6 py-4 text-center">
      {typeof value === "string" ? (
        <span className={highlight ? "font-semibold text-accent" : undefined}>{value}</span>
      ) : value ? (
        <Check className="mx-auto h-4 w-4 text-accent" />
      ) : (
        <X className="mx-auto h-4 w-4 text-text-muted/40" />
      )}
    </td>
  );
}

function TrustItem({ icon: Icon, text }: { icon: typeof Check; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="h-4 w-4 text-accent" />
      {text}
    </span>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-5 text-left"
      >
        <span className="font-semibold">{question}</span>
        <span className="ml-4 shrink-0 text-text-muted">{open ? "-" : "+"}</span>
      </button>
      {open && <div className="border-t border-border px-6 py-4 text-sm leading-relaxed text-text-muted">{answer}</div>}
    </div>
  );
}
