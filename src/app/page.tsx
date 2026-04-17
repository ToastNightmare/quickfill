"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import {
  Upload,
  ScanSearch,
  Download,
  ArrowRight,
  Check,
  X,
  FileText,
  User,
  Clock,
  LayoutDashboard,
  CreditCard,
  Sparkles,
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
          <Logo variant="full-white" className="h-10 w-auto max-w-[200px]" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:flex sm:gap-6">
            <Link href="/editor" className="text-sm text-gray-400 hover:text-white transition-colors">Fill a PDF</Link>
            <Link href="/templates" className="text-sm text-gray-400 hover:text-white transition-colors">Templates</Link>
            <Link href="/pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</Link>
            <Link href="/how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">How It Works</Link>
            <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">Dashboard</Link>
            <Link href="/profile" className="text-sm text-gray-400 hover:text-white transition-colors">Profile</Link>
            <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="text-sm text-gray-400 hover:text-white transition-colors">Terms</Link>
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
    title: "Upload Any Australian Form",
    description:
      "ATO tax returns, Medicare claims, Centrelink forms, rental applications, council permits: QuickFill handles them all.",
  },
  {
    icon: User,
    title: "Auto-fill from Your Profile",
    description:
      "Save your name, address, TFN, Medicare number, ABN and more. QuickFill fills matching fields instantly across any form.",
  },
  {
    icon: Download,
    title: "Download in Seconds",
    description:
      "Your completed PDF is ready instantly. Print it, email it, or submit it: no software required.",
  },
];

const steps = [
  { number: "1", title: "Upload", description: "Drop your PDF into the editor" },
  { number: "2", title: "Fill", description: "Type, check, sign , right on the form" },
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
      "ATO BAS forms, tax declarations, and business registrations , done fast.",
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

const testimonials: { name: string; role: string; text: string; initials: string }[] = [];

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  const handleUpgrade = async (plan: "pro") => {
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
              "Fill PDF forms online free. Upload any PDF , ATO tax forms, Medicare, Centrelink, rental applications, council forms , and fill it in seconds. Smart field detection and instant download.",
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
            Stop printing locked PDFs forever
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 sm:text-xl">
            Fill Australian government and business forms online: no Adobe, no printing, no scanning. Works on any device.
          </p>
          {/* Feature pills */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-300">
            <span className="inline-flex items-center gap-1">✏️ Fill any PDF: no locked fields stopping you</span>
            <span className="inline-flex items-center gap-1">💰 Half the price of Adobe Acrobat</span>
            <span className="inline-flex items-center gap-1">🇦🇺 Built for Australian forms: TFN, Centrelink, rental apps, NDIS</span>
          </div>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={isSignedIn ? "/editor" : "/sign-up"}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-colors sm:w-auto"
            >
              {isSignedIn ? "Fill a PDF" : "Start filling forms free"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how-it-works"
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 px-6 text-base font-semibold text-white hover:bg-white/10 transition-colors sm:w-auto"
            >
              See How It Works
            </a>
          </div>
          {/* Social proof */}
          <p className="mt-4 text-center text-xs text-gray-400">
            Trusted by Australians filling TFN declarations, rental applications, Centrelink forms and NDIS paperwork
          </p>
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
            directly in your browser, Australian government forms, tax documents, and more.
          </p>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="min-h-[220px] rounded-xl border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-shadow"
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

      {/* Competitor Comparison */}
      <section className="bg-navy px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-white">
              Why switch to QuickFill?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-muted">
              No more wrestling with broken PDF software.
            </p>
          </div>
          <div className="mt-12 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold text-gray-900">Feature</th>
                    <th className="px-6 py-4 text-left font-semibold text-gray-900">Adobe Acrobat ($24/mo)</th>
                    <th className="px-6 py-4 text-left font-semibold text-gray-900">DocuSign ($25/mo)</th>
                    <th className="px-6 py-4 text-left font-semibold text-accent bg-accent/10">QuickFill ($12/mo)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="bg-white">
                    <td className="px-6 py-4 font-medium text-gray-900">Fill PDFs online</td>
                    <td className="px-6 py-4 text-red-500">❌ Desktop only</td>
                    <td className="px-6 py-4 text-red-500">❌ Envelopes only</td>
                    <td className="px-6 py-4 font-semibold text-green-600 bg-accent/5">✅ Yes</td>
                  </tr>
                  <tr className="bg-surface-alt">
                    <td className="px-6 py-4 font-medium text-gray-900">Australian templates</td>
                    <td className="px-6 py-4 text-red-500">❌ None</td>
                    <td className="px-6 py-4 text-red-500">❌ None</td>
                    <td className="px-6 py-4 font-semibold text-green-600 bg-accent/5">✅ 15+ built-in</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-6 py-4 font-medium text-gray-900">Works on locked fields</td>
                    <td className="px-6 py-4 text-red-500">❌ No</td>
                    <td className="px-6 py-4 text-red-500">❌ No</td>
                    <td className="px-6 py-4 font-semibold text-green-600 bg-accent/5">✅ Yes</td>
                  </tr>
                  <tr className="bg-surface-alt">
                    <td className="px-6 py-4 font-medium text-gray-900">No printing needed</td>
                    <td className="px-6 py-4 text-red-500">❌ Exports only</td>
                    <td className="px-6 py-4 text-gray-500">➖ N/A</td>
                    <td className="px-6 py-4 font-semibold text-green-600 bg-accent/5">✅ Download instantly</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-6 py-4 font-medium text-gray-900">Price</td>
                    <td className="px-6 py-4 text-gray-900">$24/mo</td>
                    <td className="px-6 py-4 text-gray-900">$25/mo</td>
                    <td className="px-6 py-4 font-semibold text-accent bg-accent/5">$12/mo</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Australian Features */}
      <section className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
              🇦🇺 Built for Australian forms
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Features made for Australia
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-muted">
              No other PDF filler understands Australian forms like QuickFill. From TFN validation to ABN lookup, we handle the details that matter.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                emoji: "🔍",
                title: "ABN Lookup",
                description: "Type your ABN and we instantly verify it against the Australian Business Register and auto-fill your business name.",
              },
              {
                emoji: "🪪",
                title: "TFN & Medicare Validation",
                description: "Real-time format validation for Tax File Numbers and Medicare cards so you never submit an error again.",
              },
              {
                emoji: "📋",
                title: "Australian Profile Auto-fill",
                description: "Save your TFN, Medicare number, ABN, address, and driver licence once. QuickFill fills matching fields across any form.",
              },
              {
                emoji: "💾",
                title: "Save & Resume",
                description: "Start filling a form, close the tab, come back later. Your progress is automatically saved for 30 days.",
              },
              {
                emoji: "🔄",
                title: "Re-fill Previous Forms",
                description: "Filled this form before? One click to re-fill it with the same details: great for monthly BAS and invoices.",
              },
              {
                emoji: "🔒",
                title: "Private by Design",
                description: "Your PDFs are processed in your browser. We never upload or store your documents on our servers.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="text-3xl mb-3">{f.emoji}</div>
                <h3 className="font-semibold text-base mb-1">{f.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{f.description}</p>
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
                className="min-h-[180px] rounded-xl border border-border bg-surface p-6"
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

      {/* Trust signals */}
      <section className="bg-surface px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { emoji: "🔒", title: "Your files stay private", body: "PDFs are processed entirely in your browser. We never upload or store your documents on our servers." },
              { emoji: "⚡", title: "Ready in under 60 seconds", body: "Upload, fill, and download. No software to install. Sign up free and get started in under 60 seconds." },
              { emoji: "🇦🇺", title: "Built for Australia", body: "ATO, Medicare, Centrelink, council forms, QuickFill works with the forms Australians fill every day." },
            ].map((t) => (
              <div key={t.title} className="rounded-xl border border-border bg-surface-alt p-6">
                <div className="text-3xl mb-3">{t.emoji}</div>
                <h3 className="font-semibold text-base mb-1">{t.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{t.body}</p>
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

      {/* FAQ */}
      <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mt-12 space-y-6">
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">Is it really free?</h3>
              <p className="mt-2 text-sm text-text-muted">Yes! Get 3 free fills per month with no credit card required. Pro gives unlimited fills for $12/month.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">Is it secure?</h3>
              <p className="mt-2 text-sm text-text-muted">Your data never leaves your browser. Forms are filled locally and downloaded directly to you. We never upload or store your documents.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">Does it work on my phone?</h3>
              <p className="mt-2 text-sm text-text-muted">Yes. QuickFill works on iPhone, Android, iPad, or any device with a web browser.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">Can I use it for government forms?</h3>
              <p className="mt-2 text-sm text-text-muted">Yes. QuickFill includes real Australian government forms: TFN declarations, Centrelink income forms, Medicare enrolment, NDIS service agreements, and more.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">What's the difference between free and Pro?</h3>
              <p className="mt-2 text-sm text-text-muted">Free gives 3 fills per month. Pro ($12/month) gives unlimited fills and access to all Australian templates.</p>
            </div>
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

          <div className="mx-auto mt-12 grid max-w-2xl gap-8 sm:grid-cols-2 sm:items-stretch pt-5">
            {/* Free tier */}
            <div className="flex flex-col rounded-xl border border-border bg-surface p-8">
              <h3 className="text-lg font-semibold">Free</h3>
              <div className="mt-4">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-extrabold leading-none">$0</span>
                  <span className="text-text-muted text-sm leading-none pb-0.5">/month</span>
                </div>
                <div className="mt-2 h-7" />
              </div>
              <p className="mt-4 text-sm text-text-muted">Perfect for occasional use.</p>
              <ul className="mt-6 space-y-3">
                {[
                  { label: "3 documents per month", included: true },
                  { label: "All field types", included: true },
                  { label: "AcroForm detection", included: true },
                  { label: "Instant PDF download", included: true },
                  { label: "Unlimited documents", included: false },
                  { label: "No watermarks", included: false },
                  { label: "Auto-fill from profile", included: false },
                ].map((item) => (
                  <li key={item.label} className={`flex items-start gap-2 text-sm ${!item.included ? "opacity-40" : ""}`}>
                    {item.included ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    ) : (
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                    )}
                    <span className={!item.included ? "line-through" : ""}>{item.label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link
                  href="/sign-up"
                  className="flex h-11 items-center justify-center rounded-xl border-2 border-accent text-sm font-semibold text-accent hover:bg-accent/10 transition-colors"
                >
                  Get Started Free
                </Link>
              </div>
            </div>

            {/* Pro tier */}
            <div className="relative flex flex-col rounded-xl bg-navy p-8 shadow-xl shadow-navy/30">
              <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-accent/20 blur-2xl" />
              </div>
              <div className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white z-10">
                Most Popular
              </div>
              <h3 className="text-lg font-semibold text-white">Pro</h3>
              <div className="mt-4">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-white leading-none">$8.33</span>
                  <span className="text-gray-400 text-sm leading-none pb-0.5">/month</span>
                </div>
                <div className="mt-2 h-7 flex items-center">
                  <div className="inline-flex items-center rounded-full bg-green-500/15 border border-green-500/25 px-3 py-1">
                    <span className="text-xs font-semibold text-green-400">🎉 Billed $100/year, save $44</span>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-300">Unlimited fills, no watermark, priority support.</p>
              <ul className="mt-6 space-y-3">
                {[
                  "Unlimited documents",
                  "All field types",
                  "AcroForm detection",
                  "No watermarks",
                  "Auto-fill from profile",
                  "Save & resume progress",
                  "Re-fill from history",
                  "Unlimited fill history",
                  "Priority support",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-200">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <button
                  onClick={() => handleUpgrade("pro")}
                  disabled={!!upgradingPlan}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-all shadow-lg shadow-accent/40 hover:shadow-accent/60 disabled:opacity-70"
                >
                  {upgradingPlan === "pro" ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Loading...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Get Pro, $100/year</>
                  )}
                </button>
                <p className="mt-3 text-center text-xs text-gray-500">
                  Or <Link href="/pricing" className="text-accent hover:underline">pay $12/month</Link> · <Link href="/pricing" className="text-accent hover:underline">See full pricing</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-navy px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <Logo variant="full-white" className="h-10 w-auto max-w-[200px]" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:flex sm:gap-6">
            <Link href="/editor" className="text-sm text-gray-400 hover:text-white transition-colors">Fill a PDF</Link>
            <Link href="/templates" className="text-sm text-gray-400 hover:text-white transition-colors">Templates</Link>
            <Link href="/pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</Link>
            <Link href="/how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">How It Works</Link>
            {isSignedIn ? (
              <>
                <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">Dashboard</Link>
                <Link href="/profile" className="text-sm text-gray-400 hover:text-white transition-colors">Profile</Link>
              </>
            ) : (
              <Link href="/sign-in" className="text-sm text-gray-400 hover:text-white transition-colors">Sign In</Link>
            )}
            <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="text-sm text-gray-400 hover:text-white transition-colors">Terms</Link>
          </div>
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} QuickFill. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
