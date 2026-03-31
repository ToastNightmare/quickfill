"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Upload,
  ScanSearch,
  Download,
  ArrowRight,
  Check,
  FileText,
} from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Upload Any PDF",
    description:
      "Drag and drop any PDF form \u2014 tax documents, applications, contracts. We handle them all.",
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
      "Get your filled PDF in seconds. Fields are embedded directly into the document \u2014 no watermarks.",
  },
];

const steps = [
  { number: "1", title: "Upload", description: "Drop your PDF into the editor" },
  { number: "2", title: "Fill", description: "Type, check, sign \u2014 right on the form" },
  { number: "3", title: "Download", description: "Get your completed PDF instantly" },
];

export default function Home() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#4f8ef720_0%,_transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Upload any form.{" "}
            <span className="text-accent">Fill it in seconds.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300 sm:text-xl">
            The fastest way to fill out PDF forms online. Smart field detection,
            drag-and-drop placement, and instant downloads &mdash; no software to
            install.
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
            directly in your browser.
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

      {/* Pricing */}
      <section id="pricing" className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-text-muted">
            Start free. Upgrade when you need more.
          </p>

          {/* Monthly/Annual toggle */}
          <div className="mt-8 flex justify-center">
            <div className="inline-flex rounded-full bg-surface-alt p-1">
              <button
                onClick={() => setBilling("monthly")}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  billing === "monthly"
                    ? "bg-surface shadow text-text"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling("annual")}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  billing === "annual"
                    ? "bg-surface shadow text-text"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Annual
              </button>
            </div>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
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
                href="/editor"
                className="mt-8 flex h-11 items-center justify-center rounded-lg border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
              >
                Get Started Free
              </Link>
            </div>

            {/* Pro tier */}
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
              <h3 className="text-lg font-semibold">Pro</h3>
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
              <p className="mt-4 text-sm text-text-muted">
                For professionals and teams.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Unlimited documents",
                  "All field types",
                  "AcroForm detection",
                  "Instant PDF download",
                  "Priority support",
                  "Batch processing",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              {billing === "monthly" ? (
                <Link
                  href="/editor"
                  className="mt-8 flex h-11 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                >
                  Start Pro Trial
                </Link>
              ) : (
                <button
                  disabled
                  className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-accent/60 text-sm font-semibold text-white cursor-not-allowed"
                >
                  Coming Soon
                </button>
              )}
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
              href="/#pricing"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Pricing
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
