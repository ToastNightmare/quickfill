"use client";

import { Check, CreditCard, ExternalLink, Loader2, LockKeyhole, ShieldCheck, Sparkles, X } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { trackMetaEvent } from "@/lib/meta-pixel";
import { getStoredUtm } from "@/lib/utm";
import { PRICING, formatAud } from "@/lib/pricing";

const freeIncludes = [
  "3 downloads per month",
  "QuickFill watermark on downloads",
  "All manual field tools",
  "Instant PDF download",
];

const proAdds = [
  "Unlimited downloads",
  "No watermarks",
  "Save and resume progress",
  "Unlimited fill history",
  "Priority support",
];

const tableFeatures = [
  { name: "Downloads per month", free: "3", pro: "Unlimited" },
  { name: "Watermark on downloads", free: "QuickFill watermark", pro: "None" },
  { name: "Upload your own PDF", free: true, pro: true },
  { name: "Manual text, box, date, and signature tools", free: true, pro: true },
  { name: "Save and resume progress", free: false, pro: true },
  { name: "Fill history", free: "Last 10", pro: "Unlimited" },
  { name: "Priority support", free: false, pro: true },
];

const faqs = [
  {
    q: "Will Pro remove watermarks?",
    a: "Yes. Pro downloads have no QuickFill watermark. Free downloads include a small QuickFill watermark.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes. Cancel from billing management whenever you need to. You keep access until the end of the paid period.",
  },
  {
    q: "Can I upload my own PDF?",
    a: "Yes. You can upload your own PDF or start from a ready template, then place text, boxes, dates, and signatures.",
  },
  {
    q: "Are PDFs stored?",
    a: "PDFs are processed for download generation and are not stored on QuickFill servers.",
  },
  {
    q: "What happens after 3 free downloads?",
    a: "Free users are asked to upgrade to Pro before downloading more finished PDFs in that month.",
  },
  {
    q: "Is annual cheaper?",
    a: `Yes. Annual is ${PRICING.pro.annual.labelWithPeriod}, which works out to ${PRICING.pro.annual.perMonthLabel} and saves ${formatAud(PRICING.pro.annual.savingsVsMonthly)} compared with monthly billing.`,
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
  const [managingBilling, setManagingBilling] = useState(false);
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
  const priceLabel = annual ? PRICING.pro.annual.labelWithPeriod : PRICING.pro.monthly.labelWithPeriod;

  const handleManageBilling = async () => {
    trackEvent("billing_portal_open", { source: "pricing" });
    setCheckoutNotice(null);
    setCheckoutError(null);
    setManagingBilling(true);

    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not open billing portal.");
      }
      window.location.href = data.url;
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not open billing portal.");
    } finally {
      setManagingBilling(false);
    }
  };

  const handleUpgrade = async () => {
    trackEvent("checkout_start", { source: "pricing", plan: annual ? "annual" : "monthly" });
    trackMetaEvent('InitiateCheckout', { content_name: annual ? 'pro_annual' : 'pro_monthly' });
    setCheckoutNotice(null);
    setCheckoutError(null);

    if (!isLoaded) return;

    if (isPro) {
      await handleManageBilling();
      return;
    }

    if (!isSignedIn) {
      window.location.href = `/checkout?plan=pro&billing=${annual ? "annual" : "monthly"}&source=pricing`;
      return;
    }

    setUpgrading(true);
    try {
      const utm = getStoredUtm();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", annual, ...utm }),
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
            description: "Unlimited PDF form downloads with no watermark and priority support.",
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
        <section className="bg-navy px-4 py-9 sm:px-6 sm:py-11 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-blue-100">
                Free to start. Pro when you need more.
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                {isPro ? "Your Pro plan is active" : "Fill PDFs free, upgrade for no watermark"}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-gray-300 sm:text-lg">
                {isPro
                  ? "You have unlimited downloads, no watermark, saved progress, and priority support."
                  : "Use the free plan for occasional forms. Choose Pro for unlimited downloads, no watermark, and saved progress."}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-300 lg:justify-end">
              <TrustItem icon={Check} text="No credit card required" />
              <TrustItem icon={CreditCard} text="Cancel any time" />
              <TrustItem icon={ShieldCheck} text="Secure checkout by Stripe" />
            </div>
          </div>
        </section>

        <section className="bg-surface px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            {checkoutNotice && (
              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-800">
                {checkoutNotice}
              </div>
            )}
            {checkoutError && !planStillLoading && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
                {checkoutError}
              </div>
            )}
            {planStillLoading ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-6 py-8 text-center">
                <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-accent" />
                <h2 className="text-xl font-bold text-text">Loading your account</h2>
                <p className="mt-2 text-sm text-text-muted">
                  Getting your account ready before showing the right options.
                </p>
              </div>
            ) : isSignedIn && isPro ? (
              <CurrentPlanPanel managingBilling={managingBilling} onManageBilling={handleManageBilling} />
            ) : (
              <>
                <div className="mb-5 grid gap-3 rounded-lg border border-border bg-surface-alt p-4 text-sm text-text-muted sm:grid-cols-3">
                  <ValuePoint title="Free" text="3 downloads each month with a QuickFill watermark." />
                  <ValuePoint title="Pro" text="Unlimited downloads with no watermark." />
                  <ValuePoint title="Your PDFs" text="Processed for download generation and not stored." />
                </div>

                <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
                  <PlanCard
                    title="Free"
                    price="$0"
                    suffix="/month"
                    description="For occasional PDF forms and quick one-off jobs."
                    eyebrow="Best for trying QuickFill"
                    items={freeIncludes}
                  >
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
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Best for regular forms</p>
                          <h2 className="mt-2 text-lg font-semibold">Pro</h2>
                          <p className="mt-1 text-sm text-gray-300">Unlimited downloads, no watermark, saved progress.</p>
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

                      <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:items-end">
                        <div>
                          <div className="flex items-end gap-2">
                            <span className="text-4xl font-extrabold leading-none">{annual ? PRICING.pro.annual.label : PRICING.pro.monthly.label}</span>
                            <span className="pb-1 text-sm text-gray-300">{annual ? "/year" : "/month"}</span>
                          </div>
                          <p className="mt-2 text-sm text-gray-300">
                            {annual ? `Works out to ${PRICING.pro.annual.perMonthLabel}.` : `${PRICING.pro.monthly.introLabel} first month, then ${PRICING.pro.monthly.labelWithPeriod}.`}
                          </p>
                        </div>
                        <div className="rounded-lg bg-white/10 px-3 py-2 text-sm text-blue-100">
                          {annual ? `${PRICING.pro.annual.savingsLabel}.` : `Annual: ${PRICING.pro.annual.savingsLabel}.`}
                        </div>
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
                        <p className="mt-3 text-center text-xs font-medium text-text">
                          {annual ? PRICING.pro.annual.disclosure : PRICING.pro.monthly.disclosure}
                        </p>
                        <p className="mt-1 text-center text-xs text-text-muted">Secure checkout by Stripe.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[680px] text-sm">
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

        <section className="bg-surface-alt px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold sm:text-3xl">Quick answers</h2>
                <p className="mt-2 text-sm text-text-muted">The common pricing questions before someone upgrades.</p>
              </div>
              <Link href="/support" className="text-sm font-semibold text-accent hover:text-accent-hover">
                Ask support
              </Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
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

function CurrentPlanPanel({
  managingBilling,
  onManageBilling,
}: {
  managingBilling: boolean;
  onManageBilling: () => void;
}) {
  return (
    <div className="rounded-lg border border-accent bg-accent/5 px-6 py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent">
            <Check className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-accent">Current plan</p>
            <h2 className="mt-1 text-2xl font-bold text-text">QuickFill Pro</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Unlimited downloads, no watermark, saved progress, fill history, and priority support are active on your account.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
          <button
            type="button"
            onClick={onManageBilling}
            disabled={managingBilling}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-5 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-70"
          >
            {managingBilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Manage billing
          </button>
          <Link
            href="/editor"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Fill a PDF
          </Link>
        </div>
      </div>
    </div>
  );
}

function ValuePoint({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="font-semibold text-text">{title}</p>
      <p className="mt-1 leading-6">{text}</p>
    </div>
  );
}

function PlanCard({
  title,
  price,
  suffix,
  description,
  eyebrow,
  items,
  children,
}: {
  title: string;
  price: string;
  suffix: string;
  description: string;
  eyebrow: string;
  items: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase text-text-muted">{eyebrow}</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
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
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="font-semibold text-text">{question}</h3>
      <p className="mt-2 text-sm leading-6 text-text-muted">{answer}</p>
    </div>
  );
}
