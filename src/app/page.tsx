"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import HeroEditorDemo from "@/components/HeroEditorDemo";
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
  Sparkles,
  Loader2,
  ShieldCheck,
  LockKeyhole,
  BadgeCheck,
  Calendar,
  CheckSquare,
  Eraser,
  Magnet,
  PenTool,
  RotateCcw,
  Save,
  SquareSplitHorizontal,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { APP_CONFIG } from "@/lib/config";
import { PRICING } from "@/lib/pricing";
import { trackEvent } from "@/lib/analytics";
import { trackMetaEvent } from "@/lib/meta-pixel";
import { captureAndStoreUtm } from "@/lib/utm";

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
              { label: "Saved Details", href: "/profile", icon: User },
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
    title: "Upload Any PDF Form",
    description:
      "Tax forms, rental applications, government documents, employment paperwork: QuickFill handles them all.",
  },
  {
    icon: User,
    title: "Fill Faster with Saved Details",
    description:
      "Save your name, address, and contact details once. Use them to fill matching fields faster across any form.",
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
  { number: "2", title: "Fill", description: "Type, check, sign, right on the form" },
  { number: "3", title: "Download", description: "Get your completed PDF instantly" },
];

const verticals = [
  {
    icon: FileText,
    title: "Real Estate Agents",
    description:
      "Fill tenancy applications, lease agreements, and property documents in seconds.",
  },
  {
    icon: FileText,
    title: "Bookkeepers & Sole Traders",
    description:
      "Tax declarations, invoices, and business registration forms, done fast.",
  },
  {
    icon: ShieldCheck,
    title: "Churches & Community Orgs",
    description:
      "Membership forms, event registrations, and grant applications sorted easily.",
  },
  {
    icon: BadgeCheck,
    title: "Healthcare & Community Services",
    description:
      "Client intake forms, referral documents, and service agreements filled accurately every time.",
  },
];

const heroTrustPills = [
  { icon: Check, text: "Fill any PDF without locked fields stopping you" },
  { icon: CreditCard, text: `Free plan, Pro is ${PRICING.pro.monthly.labelWithPeriod}` },
  { icon: BadgeCheck, text: "Australian templates included. Works with any PDF." },
];

const proofStats = [
  { value: "15+", label: "ready templates" },
  { value: "3", label: "free fills each month" },
  { value: "0", label: "stored PDF uploads" },
  { value: "50MB", label: "PDF upload limit" },
];

const buyerQuestions = [
  {
    icon: LockKeyhole,
    title: "Will QuickFill keep my PDF?",
    body: "No. Your PDF is used to generate your filled download, then discarded. It is never saved to our servers.",
  },
  {
    icon: ShieldCheck,
    title: "Will it work with official forms?",
    body: "Yes. QuickFill works with any PDF form and includes ready-made templates for tax, rental, government, and business documents.",
  },
  {
    icon: BadgeCheck,
    title: "Can I try it before paying?",
    body: "Yes. The free plan gives 3 fills each month so you can test your own PDF before upgrading.",
  },
];

const securitySignals = [
  {
    icon: LockKeyhole,
    title: "No PDF storage",
    body: "Your PDF is used to create your download, then discarded. We don't save it.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Your PDF is not read by us, not stored on our servers, and not shared with anyone.",
  },
  {
    icon: BadgeCheck,
    title: "Built in Australia",
    body: "QuickFill is built in Australia and includes templates for ATO, Medicare, Centrelink, and rental forms. Works with any PDF, anywhere.",
  },
];

const testimonials: { name: string; role: string; text: string; initials: string }[] = [];

const heroDemoWorkflow = [
  { title: "Upload PDF", detail: "sample-form.pdf", icon: Upload },
  { title: "Place fields", detail: "Text, date, checkbox", icon: FileText },
  { title: "Type details", detail: "Alex Sample", icon: User },
  { title: "Snap & align", detail: "Guides locked", icon: Check },
  { title: "Download", detail: "Completed PDF", icon: Download },
];

function HeroProductDemo() {
  const [stepIndex, setStepIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const interval = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % heroDemoWorkflow.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, [prefersReducedMotion]);

  const activeStep = prefersReducedMotion ? heroDemoWorkflow.length - 1 : stepIndex;
  const hasUploaded = activeStep >= 0;
  const hasFields = activeStep >= 1;
  const hasTyped = activeStep >= 2;
  const hasAligned = activeStep >= 3;
  const hasDownloaded = activeStep >= 4;
  const statusItems: Array<[string, boolean]> = [
    ["Fields placed", hasFields],
    ["Details typed", hasTyped],
    ["Snap guides aligned", hasAligned],
    ["Download ready", hasDownloaded],
  ];

  return (
    <div
      className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-white text-left shadow-2xl shadow-black/25"
      aria-label="QuickFill product workflow demo"
    >
      <div className="flex flex-col gap-3 border-b border-border bg-white px-4 py-3 text-text sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm text-text-muted">
          <FileText className="h-4 w-4 shrink-0 text-accent" />
          <span>QuickFill</span>
          <span>/</span>
          <span className="truncate font-medium text-text">sample-application-form.pdf</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
            Generic demo
          </span>
          <span
            className={`rounded-md px-2 py-1 font-semibold motion-safe:transition-colors motion-safe:duration-500 ${
              hasAligned ? "bg-blue-50 text-blue-700" : "bg-surface-alt text-text-muted"
            }`}
          >
            Snap {hasAligned ? "on" : "ready"}
          </span>
          <span
            className={`rounded-md px-2 py-1 font-semibold motion-safe:transition-colors motion-safe:duration-500 ${
              hasDownloaded ? "bg-accent text-white" : "bg-surface-alt text-text-muted"
            }`}
          >
            {hasDownloaded ? "Ready to download" : "Editing"}
          </span>
        </div>
      </div>

      <div className="grid bg-surface-alt lg:grid-cols-[1fr_260px]">
        <div className="p-4 sm:p-6">
          <div className="grid gap-2 sm:grid-cols-5">
            {heroDemoWorkflow.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === activeStep;
              const isComplete = index < activeStep || prefersReducedMotion;

              return (
                <div
                  key={step.title}
                  className={`rounded-lg border px-3 py-2 motion-safe:transition-all motion-safe:duration-500 motion-reduce:transition-none ${
                    isActive
                      ? "border-accent bg-white shadow-sm shadow-accent/15 motion-safe:scale-[1.02]"
                      : isComplete
                        ? "border-emerald-100 bg-emerald-50"
                        : "border-border bg-white/70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        isComplete
                          ? "bg-emerald-600 text-white"
                          : isActive
                            ? "bg-accent text-white"
                            : "bg-surface-alt text-text-muted"
                      }`}
                    >
                      {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="text-xs font-bold text-text">{step.title}</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-text-muted">{step.detail}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[150px_1fr]">
            <aside className="rounded-lg border border-border bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                Field tools
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-1">
                {[
                  ["T", "Text"],
                  ["@", "Email"],
                  ["Date", "Date"],
                  ["X", "Checkbox"],
                ].map(([icon, label], index) => (
                  <div
                    key={label}
                    className={`flex h-9 items-center gap-2 rounded-md border px-2 text-xs font-semibold motion-safe:transition-all motion-safe:duration-500 motion-reduce:transition-none ${
                      hasFields && index < 3
                        ? "border-accent/30 bg-accent/10 text-accent"
                        : "border-border bg-surface-alt text-text-muted"
                    }`}
                  >
                    <span className="w-8 text-center text-[11px]">{icon}</span>
                    {label}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-border bg-surface-alt p-3 text-xs text-text-muted">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-accent" />
                  <span className="font-semibold text-text">Upload complete</span>
                </div>
                <p className="mt-1">1 page ready</p>
              </div>
            </aside>

            <div className="relative min-h-[430px] overflow-hidden rounded-lg border border-border bg-[#e8edf5] p-4 sm:p-6">
              <div
                className={`absolute left-5 top-5 z-20 rounded-lg border border-accent/20 bg-white px-3 py-2 text-xs font-semibold text-text shadow-lg shadow-slate-900/10 motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
                  hasUploaded ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-accent" />
                  sample-application-form.pdf
                </div>
              </div>

              <div className="mx-auto max-w-[430px] rounded-md bg-white p-6 text-text shadow-xl shadow-slate-900/15">
                <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-accent">
                      Demo only
                    </p>
                    <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-text">
                      Sample application form
                    </h3>
                  </div>
                  <div className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    PDF
                  </div>
                </div>

                <div className="relative mt-5 space-y-5">
                  {hasAligned && (
                    <>
                      <div className="absolute left-[33%] top-2 h-[255px] w-px bg-accent/40 motion-safe:animate-pulse" />
                      <div className="absolute left-0 right-4 top-[112px] h-px bg-accent/40 motion-safe:animate-pulse" />
                      <div className="absolute left-0 right-4 top-[181px] h-px bg-accent/40 motion-safe:animate-pulse" />
                    </>
                  )}

                  {[
                    ["Full name", "Alex Sample", "top-0"],
                    ["Address", "42 Example Road", "top-[68px]"],
                    ["Email", "alex@example.com", "top-[137px]"],
                    ["Date", "12 Jun 2026", "top-[206px]"],
                  ].map(([label, value], index) => (
                    <div key={label} className="grid grid-cols-[110px_1fr] items-center gap-4">
                      <p className="text-sm font-semibold text-text">{label}</p>
                      <div className="relative h-11 rounded-md border border-border bg-surface-alt">
                        <div
                          className={`absolute inset-0 rounded-md border-2 px-3 py-2 text-sm font-semibold text-navy motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
                            hasFields
                              ? hasAligned
                                ? "translate-x-0 border-accent bg-blue-50"
                                : index % 2 === 0
                                  ? "-translate-x-1 border-accent/70 bg-white"
                                  : "translate-x-1 border-accent/70 bg-white"
                              : "scale-95 border-transparent bg-transparent opacity-0"
                          }`}
                        >
                          <span
                            className={`motion-safe:transition-opacity motion-safe:duration-500 motion-reduce:transition-none ${
                              hasTyped ? "opacity-100" : "opacity-0"
                            }`}
                          >
                            {value}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="grid grid-cols-[110px_1fr] items-center gap-4">
                    <p className="text-sm font-semibold text-text">Consent</p>
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded border-2 text-accent motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
                        hasFields ? "border-accent bg-blue-50 opacity-100" : "border-transparent opacity-0"
                      }`}
                    >
                      {hasTyped && <Check className="h-5 w-5" />}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`absolute bottom-5 right-5 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold shadow-lg shadow-slate-900/10 motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none ${
                  hasDownloaded
                    ? "translate-y-0 border-emerald-200 text-emerald-700 opacity-100"
                    : "translate-y-3 border-border text-text-muted opacity-0"
                }`}
              >
                <Check className="h-4 w-4" />
                Completed PDF ready
              </div>
            </div>
          </div>
        </div>

        <aside className="border-t border-border bg-white p-4 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
                Live status
              </p>
              <p className="mt-1 text-sm font-semibold text-text">
                {heroDemoWorkflow[activeStep].title}
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-accent" />
          </div>

          <div className="mt-5 space-y-3">
            {statusItems.map(([label, done]) => (
              <div key={label} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full motion-safe:transition-colors motion-safe:duration-500 ${
                    done ? "bg-emerald-600 text-white" : "bg-surface-alt text-text-muted"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-text-muted">{label}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            className={`mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold motion-safe:transition-all motion-safe:duration-500 motion-reduce:transition-none ${
              hasDownloaded
                ? "bg-accent text-white shadow-lg shadow-accent/20"
                : "bg-surface-alt text-text-muted"
            }`}
            tabIndex={-1}
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        </aside>
      </div>
    </div>
  );
}



export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  useEffect(() => {
    captureAndStoreUtm();
    trackEvent("landing_page_view", { page: "home" });
  }, []);

  const handleUpgrade = async (plan: "pro", annual = true) => {
    trackEvent("checkout_start", { source: "home_pricing", plan, billing: annual ? "annual" : "monthly" });
    trackMetaEvent('InitiateCheckout', { content_name: plan, content_type: annual ? 'annual' : 'monthly' });
    if (!isLoaded) return;
    if (!isSignedIn) {
      window.location.href = `/checkout?plan=${plan}&billing=${annual ? "annual" : "monthly"}&source=home_pricing`;
      return;
    }
    setUpgradingPlan(annual ? "pro_annual" : "pro_monthly");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, annual }),
      });
      const data = await res.json();
      if (data.error) {
        window.location.href = `/checkout?plan=${plan}&billing=${annual ? "annual" : "monthly"}&source=home_pricing`;
        return;
      }
      if (data.url) window.location.href = data.url;
    } finally {
      setUpgradingPlan(null);
    }
  };

  if (isLoaded && isSignedIn) {
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
              "Fill any PDF form online free. Upload your PDF, fill it with text, signatures, checkboxes, and dates, then download your completed document instantly. No software required.",
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
              "Drag-and-drop form filling",
              "Instant PDF download",
              "Fill faster with saved details",
            ],
          }),
        }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="relative mx-auto max-w-5xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Stop printing locked PDFs forever
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 sm:text-xl">
            Fill any PDF form online: no Adobe, no printing, no scanning. Works on any device.
          </p>
          {/* Feature pills */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-300">
            {heroTrustPills.map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <Icon className="h-4 w-4 text-accent" />
                {text}
              </span>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/editor"
              onClick={() => {
                trackEvent("home_cta_click", { cta: "hero_fill_pdf" });
                trackMetaEvent('Lead', { content_name: 'hero_fill_pdf' });
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-colors sm:w-auto"
            >
              Fill a PDF Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/templates"
              onClick={() => trackEvent("home_cta_click", { cta: "hero_browse_templates" })}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 px-6 text-base font-semibold text-white hover:bg-white/10 transition-colors sm:w-auto"
            >
              Browse Templates
            </Link>
          </div>
          {/* Social proof */}
          <p className="mt-4 text-center text-xs text-gray-400">
            Works with tax forms, rental applications, government paperwork, and any PDF you need to fill.
          </p>

          <HeroEditorDemo />
        </div>
      </section>

      {/* Proof strip */}
      <section className="border-y border-border bg-surface px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-4">
          {proofStats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-surface-alt px-4 py-5 text-center">
              <p className="text-2xl font-extrabold text-text">{stat.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Buyer confidence */}
      <section className="bg-surface px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
              Built for cautious paperwork
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              The answers people need before uploading a form
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-muted">
              QuickFill is designed for sensitive paperwork where privacy, accuracy, and speed matter.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {buyerQuestions.map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-surface-alt p-6 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <item.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/editor"
              onClick={() => {
                trackEvent("home_cta_click", { cta: "trust_fill_pdf" });
                trackMetaEvent('Lead', { content_name: 'trust_fill_pdf' });
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors sm:w-auto"
            >
              Upload a PDF
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/privacy"
              className="flex h-11 w-full items-center justify-center rounded-lg border border-border px-5 text-sm font-semibold text-text hover:bg-surface-alt transition-colors sm:w-auto"
            >
              Read privacy details
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-surface-alt px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to fill PDFs
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-text-muted">
            No more printing, hand-writing, and scanning. Fill any PDF form
            directly in your browser. Any PDF form, government documents, tax forms, and more.
          </p>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="min-h-[220px] rounded-lg border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-shadow"
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
                    <th className="px-6 py-4 text-left font-semibold text-gray-900">General PDF suites</th>
                    <th className="px-6 py-4 text-left font-semibold text-gray-900">E-signature tools</th>
                    <th className="px-6 py-4 text-left font-semibold text-accent bg-accent/10">QuickFill ({PRICING.pro.monthly.label}/mo)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="bg-white">
                    <td className="px-6 py-4 font-medium text-gray-900">Fill PDFs online</td>
                    <td className="px-6 py-4 text-gray-700">Often broader than needed</td>
                    <td className="px-6 py-4 text-gray-700">Built around signing flows</td>
                    <td className="px-6 py-4 font-semibold text-green-600 bg-accent/5">Yes</td>
                  </tr>
                  <tr className="bg-surface-alt">
                    <td className="px-6 py-4 font-medium text-gray-900">Australian templates</td>
                    <td className="px-6 py-4 text-gray-700">Not Australia-first</td>
                    <td className="px-6 py-4 text-gray-700">Not Australia-first</td>
                    <td className="px-6 py-4 font-semibold text-green-600 bg-accent/5">15+ built-in</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-6 py-4 font-medium text-gray-900">Works on locked fields</td>
                    <td className="px-6 py-4 text-gray-700">Can be fiddly</td>
                    <td className="px-6 py-4 text-gray-700">Setup required</td>
                    <td className="px-6 py-4 font-semibold text-green-600 bg-accent/5">Yes</td>
                  </tr>
                  <tr className="bg-surface-alt">
                    <td className="px-6 py-4 font-medium text-gray-900">No printing needed</td>
                    <td className="px-6 py-4 text-gray-700">Yes, with the right tool</td>
                    <td className="px-6 py-4 text-gray-700">Yes, for signing flows</td>
                    <td className="px-6 py-4 font-semibold text-green-600 bg-accent/5">Download instantly</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-6 py-4 font-medium text-gray-900">Price</td>
                    <td className="px-6 py-4 text-gray-900">$20+/mo</td>
                    <td className="px-6 py-4 text-gray-900">$20+/mo</td>
                    <td className="px-6 py-4 font-semibold text-accent bg-accent/5">{PRICING.pro.monthly.label}/mo</td>
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
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">Built in Australia</span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Features built for real paperwork
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-muted">
              QuickFill is built in Australia, with AU-specific tools alongside features that work with any PDF form, anywhere.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: ScanSearch,
                title: "ABN Lookup",
                description: "Type your ABN and we instantly verify it against the Australian Business Register and auto-fill your business name.",
              },
              {
                icon: BadgeCheck,
                title: "TFN & Medicare Validation",
                description: "Real-time format validation for Tax File Numbers and Medicare cards so you never submit an error again.",
              },
              {
                icon: User,
                title: "Saved Details",
                description: "Save your name, address, and other details once. Use them to fill matching fields faster across any form.",
              },
              {
                icon: Clock,
                title: "Save & Resume",
                description: "Start filling a form, close the tab, come back later. Your progress is automatically saved for 30 days.",
              },
              {
                icon: Sparkles,
                title: "Re-fill Previous Forms",
                description: "Filled this form before? One click to re-fill it with the same details: great for monthly BAS and invoices.",
              },
              {
                icon: LockKeyhole,
                title: "Private by Design",
                description: "Your PDF is not read by us, not stored on our servers, and not shared with anyone.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <f.icon className="h-5 w-5 text-accent" />
                </div>
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
            Professionals rely on QuickFill to save hours on paperwork.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {verticals.map((v) => (
              <div
                key={v.title}
                className="min-h-[180px] rounded-xl border border-border bg-surface p-6"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <v.icon className="h-5 w-5 text-accent" />
                </div>
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
            {securitySignals.map((signal) => (
              <div key={signal.title} className="rounded-xl border border-border bg-surface-alt p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <signal.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-4 font-semibold text-base">{signal.title}</h3>
                <p className="mt-2 text-sm text-text-muted leading-relaxed">{signal.body}</p>
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
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.title} className="rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-bold text-white">
                  {step.number}
                </div>
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
            Works with any PDF form
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-text-muted">
            Fill and submit tax forms, rental applications, employment paperwork, government documents, and any other PDF you need.
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
              "Employment Contracts",
              "Consent Forms",
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
              <p className="mt-2 text-sm text-text-muted">Yes! Get 3 free fills per month with no credit card required. Pro gives unlimited fills for {PRICING.pro.monthly.labelWithPeriod}.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">Is it secure?</h3>
              <p className="mt-2 text-sm text-text-muted">Your PDF is processed to generate your download and is never saved to our servers. We do not read or share the contents of your document.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">Does it work on my phone?</h3>
              <p className="mt-2 text-sm text-text-muted">Yes. QuickFill works on iPhone, Android, iPad, or any device with a web browser.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">Can I use it for government forms?</h3>
              <p className="mt-2 text-sm text-text-muted">Yes. QuickFill works with any PDF form and includes ready-made government templates: TFN declarations, Centrelink income forms, Medicare enrolment, NDIS service agreements, and more.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-6">
              <h3 className="font-semibold text-base">What&apos;s the difference between free and Pro?</h3>
              <p className="mt-2 text-sm text-text-muted">Free gives 3 fills per month. Pro ({PRICING.pro.monthly.labelWithPeriod}) gives unlimited fills and access to all ready-made templates.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 bg-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-muted">
            Start free. Upgrade when you need unlimited downloads and no watermark.
          </p>

          <div className="mx-auto mt-12 grid max-w-4xl gap-6 lg:grid-cols-2 lg:items-stretch">
            <div className="flex flex-col rounded-lg border border-border bg-surface p-6 shadow-sm">
              <div>
                <h3 className="text-lg font-semibold">Free</h3>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-4xl font-extrabold leading-none">$0</span>
                  <span className="pb-1 text-sm text-text-muted">/month</span>
                </div>
                <p className="mt-4 text-sm text-text-muted">Perfect for occasional paperwork.</p>
              </div>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase text-text-muted">Free includes</p>
                <ul className="mt-3 space-y-3">
                  {[
                    "3 documents per month",
                    "All field types",
                    "AcroForm detection",
                    "Instant PDF download",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto pt-8">
                <Link
                  href="/sign-up"
                  onClick={() => {
                    trackEvent("home_cta_click", { cta: "pricing_free" });
                    trackMetaEvent('Lead', { content_name: 'pricing_free' });
                  }}
                  className="flex h-11 items-center justify-center rounded-lg border-2 border-accent text-sm font-semibold text-accent hover:bg-accent/10 transition-colors"
                >
                  Get Started Free
                </Link>
              </div>
            </div>

            <div className="flex flex-col overflow-hidden rounded-lg border-2 border-accent bg-surface shadow-xl shadow-accent/15">
              <div className="bg-navy p-6 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">Pro</h3>
                    <p className="mt-1 text-sm text-gray-300">Unlimited fills, no watermark, priority support.</p>
                  </div>
                  <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                    Best value
                  </span>
                </div>
                <div className="mt-6">
                  <span className="inline-flex rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
                    {PRICING.pro.monthly.introBadge}
                  </span>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="text-4xl font-extrabold leading-none">{PRICING.pro.monthly.introLabel}</span>
                    <span className="pb-1 text-sm text-gray-300">today</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-300">{PRICING.pro.monthly.thenLabel}. Cancel anytime.</p>
                  <p className="mt-1 text-sm text-gray-300">{PRICING.pro.annual.orLabel}, {PRICING.pro.annual.savingsLabel}.</p>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-semibold uppercase text-text-muted">Pro adds</p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    "Unlimited documents",
                    "No watermarks",
                    "Fill faster with saved details",
                    "Save and resume",
                    "Re-fill from history",
                    "Priority support",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  <button
                    onClick={() => handleUpgrade("pro", false)}
                    disabled={!!upgradingPlan}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-70"
                  >
                    {upgradingPlan === "pro_monthly" ? (
                      <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Loading...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> {PRICING.pro.monthly.ctaLabel}</>
                    )}
                  </button>
                  <button
                    onClick={() => handleUpgrade("pro", true)}
                    disabled={!!upgradingPlan}
                    className="mt-3 flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-semibold text-text hover:bg-surface-alt transition-colors disabled:opacity-70"
                  >
                    {upgradingPlan === "pro_annual" ? "Loading..." : PRICING.pro.annual.ctaLabel}
                  </button>
                  <p className="mt-3 text-center text-xs font-medium text-text">
                    {PRICING.pro.monthly.finePrint}
                  </p>
                  <p className="mt-1 text-center text-xs text-text-muted">
                    Secure checkout by Stripe.
                  </p>
                </div>
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
