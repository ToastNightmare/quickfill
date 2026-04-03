"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Upload,
  ScanSearch,
  Download,
  ArrowRight,
  Check,
  FileText,
  User,
  Clock,
  LayoutDashboard,
  CreditCard,
  Loader2,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { APP_CONFIG } from "@/lib/config";

interface FillEntry {
  filename: string;
  filledAt: string;
  fieldCount: number;
  pageCount: number;
}

interface UsageData {
  used: number;
  limit: number;
  isPro: boolean;
  tier: string;
}

interface FillsData {
  fills: FillEntry[];
  isPro: boolean;
}

function LoggedInHome() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [fills, setFills] = useState<FillsData | null>(null);

  useEffect(() => {
    fetch("/api/usage").then((r) => r.json()).then(setUsage).catch(() => {});
    fetch("/api/fills").then((r) => r.json()).then(setFills).catch(() => {});
  }, []);

  const recentFills = fills?.fills.slice(0, 3) ?? [];
  const lastFilled = recentFills[0]?.filledAt;
  const tierLabel = usage?.tier
    ? usage.tier.charAt(0).toUpperCase() + usage.tier.slice(1)
    : "Free";
  const isUnlimited = usage?.tier === "pro";

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#4f8ef720_0%,_transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Welcome back
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-300">
            Ready to fill your next form?
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/editor"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-8 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-colors sm:w-auto"
            >
              Open Editor
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 px-6 text-base font-semibold text-white hover:bg-white/10 transition-colors sm:w-auto"
            >
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Stats row */}
      <section className="bg-surface px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <FileText className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 text-2xl font-bold">
              {usage === null ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-text-muted" />
              ) : isUnlimited ? (
                "Unlimited"
              ) : (
                `${usage.used} / ${usage.limit}`
              )}
            </p>
            <p className="mt-1 text-sm text-text-muted">Fills used this month</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <CreditCard className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 text-2xl font-bold">
              {usage === null ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-text-muted" />
              ) : (
                tierLabel
              )}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Current plan
              {usage?.tier === "free" && (
                <>
                  {" "}&middot;{" "}
                  <Link href="/pricing" className="text-accent hover:underline">
                    Upgrade
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <Clock className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 text-2xl font-bold">
              {fills === null ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-text-muted" />
              ) : lastFilled ? (
                new Date(lastFilled).toLocaleDateString()
              ) : (
                "No fills yet"
              )}
            </p>
            <p className="mt-1 text-sm text-text-muted">Last filled</p>
          </div>
        </div>
      </section>

      {/* Recent fills */}
      <section className="bg-surface-alt px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Recent Activity</h2>
            {recentFills.length > 0 && (
              <Link href="/dashboard" className="text-sm text-accent hover:underline">
                View all
              </Link>
            )}
          </div>
          {fills === null ? (
            <div className="mt-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : recentFills.length === 0 ? (
            <div className="mt-8 rounded-xl border border-border bg-surface p-8 text-center">
              <p className="text-text-muted">Upload your first PDF to get started</p>
              <Link
                href="/editor"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                Open Editor
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {recentFills.map((fill, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-surface p-5"
                >
                  <p className="truncate font-medium">{fill.filename}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    {new Date(fill.filledAt).toLocaleDateString()} &middot;{" "}
                    {fill.fieldCount} fields
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section className="bg-surface px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: "Fill a Form", href: "/editor", icon: FileText },
              { label: "Auto-fill Profile", href: "/profile", icon: User },
              { label: "View History", href: "/dashboard", icon: LayoutDashboard },
              { label: "Pricing & Plans", href: "/pricing", icon: CreditCard },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <action.icon className="h-5 w-5 text-accent" />
                </div>
                <span className="font-semibold">{action.label}</span>
                <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-navy px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 font-bold text-white">
            <FileText className="h-5 w-5 text-accent" />
            QuickFill
          </div>
          <div className="flex gap-6">
            <Link
              href="/editor"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Editor
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/how-it-works"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="/privacy"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Terms
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} QuickFill. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: Upload,
    title: "Upload Any PDF",
    description:
      "Drag and drop any PDF form \u2014 ATO tax returns, Medicare claims, rental applications, council forms, and more.",
  },
  {
    icon: ScanSearch,
    title: "Smart Field Detection",
    description:
      "Automatically detects fillable AcroForm fields. For flat PDFs, place fields exactly where you need them.",
  },
  {
    icon: Download,
    title: "Download Instantly",
    description:
      "Get your filled PDF in seconds. Fields are embedded directly into the document \u2014 ready to print, email, or submit.",
  },
];

const steps = [
  { number: "1", title: "Upload", description: "Drop your PDF into the editor" },
  { number: "2", title: "Fill", description: "Type, check, sign \u2014 right on the form" },
  { number: "3", title: "Download", description: "Get your completed PDF instantly" },
];

const verticals = [
  {
    emoji: "\ud83c\udfe0",
    title: "Real Estate Agents",
    description:
      "Fill tenancy applications, lease agreements, and property documents in seconds.",
  },
  {
    emoji: "\ud83d\udccb",
    title: "Bookkeepers & Sole Traders",
    description:
      "ATO BAS forms, tax declarations, and business registrations \u2014 done fast.",
  },
  {
    emoji: "\u26ea",
    title: "Churches & Community Orgs",
    description:
      "Membership forms, event registrations, and grant applications sorted easily.",
  },
  {
    emoji: "\ud83c\udfe5",
    title: "Healthcare & Community Services",
    description:
      "Medicare, Centrelink, and client intake forms filled accurately every time.",
  },
];

const testimonials = [
  {
    name: "Sarah M.",
    role: "Bookkeeper, Perth WA",
    text: "I fill ATO BAS forms for 12 clients every quarter. QuickFill cut my processing time in half. No more printing, scanning, or installing software.",
    initials: "SM",
  },
  {
    name: "James T.",
    role: "Property Manager, Brisbane",
    text: "Rental applications, tenancy agreements, condition reports — all done in the browser. My team uses it every day. The auto-fill profile feature is a game changer.",
    initials: "JT",
  },
  {
    name: "Linda K.",
    role: "Sole Trader, Melbourne",
    text: "I was dreading my tax return forms. Uploaded the PDF, filled it in minutes, downloaded it. Done. Wish I found this years ago.",
    initials: "LK",
  },
];

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  const handleUpgrade = async (plan: "pro" | "business") => {
    setUpgradingPlan(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.error) {
        window.location.href = "/sign-up?redirect_url=/pricing";
        return;
      }
      if (data.url) window.location.href = data.url;
    } finally {
      setUpgradingPlan(null);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (isSignedIn) {
    return <LoggedInHome />;
  }

  return (
    <div className="flex flex-col">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "QuickFill",
            url: APP_CONFIG.url,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Any",
            description:
              "Fill PDF forms online free. Upload any PDF \u2014 ATO tax forms, Medicare, Centrelink, rental applications, council forms \u2014 and fill it in seconds. Smart field detection and instant download.",
            offers: [
              {
                "@type": "Offer",
                price: "0",
                priceCurrency: "AUD",
                name: "Free Plan",
                description: "3 documents per month",
              },
              {
                "@type": "Offer",
                price: "12",
                priceCurrency: "AUD",
                name: "Pro Plan",
                description: "Unlimited documents per month",
              },
              {
                "@type": "Offer",
                price: "29",
                priceCurrency: "AUD",
                name: "Business Plan",
                description: "Unlimited documents per month with team features",
              },
            ],
            featureList: [
              "PDF form filling",
              "AcroForm field detection",
              "Text, checkbox, signature, and date fields",
              "AI-powered field detection",
              "Instant PDF download",
              "Auto-fill from saved profile",
            ],
          }),
        }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#4f8ef720_0%,_transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Fill PDF Forms Online Free.{" "}
            <span className="text-accent">Done in seconds.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 sm:text-xl">
            The fastest way to fill out PDF forms online. Upload any form &mdash; ATO tax returns,
            Medicare claims, Centrelink forms, rental applications, council permits &mdash; and
            fill it with smart field detection and instant downloads. No software to install.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/editor"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-colors sm:w-auto"
            >
              Try Free &mdash; No Sign Up
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how-it-works"
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 px-6 text-base font-semibold text-white hover:bg-white/10 transition-colors sm:w-auto"
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to fill PDFs
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-text-muted">
            No more printing, hand-writing, and scanning. Fill any PDF form
            directly in your browser &mdash; Australian government forms, tax documents, and more.
          </p>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                  <feature.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who uses QuickFill? */}
      <section className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Who uses QuickFill?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-text-muted">
            Professionals across Australia rely on QuickFill to save hours on paperwork.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {verticals.map((v) => (
              <div
                key={v.title}
                className="rounded-xl border border-border bg-surface p-6"
              >
                <div className="text-3xl">{v.emoji}</div>
                <h3 className="mt-3 text-lg font-bold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Trusted by professionals across Australia
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-border bg-surface p-6 shadow-sm"
              >
                <p className="text-sm leading-relaxed text-text-muted">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-text-muted">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-xl font-bold text-white">
                  {step.number}
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden h-0.5 w-full bg-accent/20 sm:block absolute" />
                )}
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-text-muted">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="bg-surface-alt px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Works with any Australian PDF form
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-text-muted">
            Fill and submit forms for the ATO, Medicare, Centrelink, state government agencies,
            councils, real estate agents, and more.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[
              "ATO Tax Returns",
              "Medicare Claims",
              "Centrelink Forms",
              "Rental Applications",
              "Council Permits",
              "Tenancy Agreements",
              "ABN Registration",
              "Business Forms",
            ].map((label) => (
              <span
                key={label}
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text-muted"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-muted">
            Start free. Upgrade when you need more.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Free tier */}
            <div className="rounded-xl border border-border bg-surface p-8">
              <h3 className="text-lg font-semibold">Free</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$0</span>
                <span className="text-text-muted">/month</span>
              </div>
              <p className="mt-4 text-sm text-text-muted">
                Perfect for occasional use.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "3 documents per month",
                  "All field types",
                  "AcroForm detection",
                  "Instant PDF download",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className="mt-8 flex h-11 items-center justify-center rounded-lg border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
              >
                Get Started Free
              </Link>
            </div>

            {/* Pro tier */}
            <div className="relative rounded-xl border-2 border-accent bg-surface p-8 shadow-lg shadow-accent/10">
              <div className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
                Most Popular
              </div>
              <h3 className="text-lg font-semibold">Pro</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$12</span>
                <span className="text-text-muted">/month</span>
              </div>
              <p className="mt-4 text-sm text-text-muted">
                For professionals who need volume.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Unlimited documents",
                  "All field types",
                  "AcroForm detection",
                  "No watermarks",
                  "Auto-fill from profile",
                  "Last 30 fills history",
                  "Priority support",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleUpgrade("pro")}
                disabled={!!upgradingPlan}
                className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-70"
              >
                {upgradingPlan === "pro" ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Loading...</>
                ) : "Start Pro — $12/month"}
              </button>
            </div>

            {/* Business tier */}
            <div className="rounded-xl border border-border bg-surface p-8">
              <h3 className="text-lg font-semibold">Business</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$29</span>
                <span className="text-text-muted">/month</span>
              </div>
              <p className="mt-4 text-sm text-text-muted">
                For teams and organisations.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Unlimited documents",
                  "Unlimited fill history",
                  "Priority support",
                  "Team profiles (coming soon)",
                  "No watermarks",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleUpgrade("business")}
                disabled={!!upgradingPlan}
                className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-accent text-sm font-semibold text-accent hover:bg-accent hover:text-white transition-colors disabled:opacity-70"
              >
                {upgradingPlan === "business" ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Loading...</>
                ) : "Get Business — $29/month"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-navy px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 font-bold text-white">
            <FileText className="h-5 w-5 text-accent" />
            QuickFill
          </div>
          <div className="flex gap-6">
            <Link
              href="/editor"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Editor
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/how-it-works"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="/privacy"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Terms
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} QuickFill. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
