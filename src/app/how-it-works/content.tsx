"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export default function HowItWorksContent() {
  const { isSignedIn } = useAuth();
  const [usage, setUsage] = useState<{ isPro: boolean } | null>(null);

  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/usage")
        .then((r) => r.json())
        .then((data) => setUsage({ isPro: data.isPro ?? false }))
        .catch(() => setUsage({ isPro: false }));
    }
  }, [isSignedIn]);

  const isPro = usage?.isPro ?? false;

  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-2xl font-bold sm:text-3xl">
        Ready to fill your first PDF?
      </h2>
      {isPro ? (
        <>
          <p className="mt-4 text-text-muted">
            You&apos;re on Pro. No limits, no watermarks.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:justify-center">
            <Link
              href="/editor"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-colors sm:w-auto"
            >
              Fill a PDF
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-4 text-text-muted">
            It takes less than 60 seconds. Try it free, no sign up needed.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/editor"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover transition-colors sm:w-auto"
            >
              Fill a PDF Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="flex h-12 w-full items-center justify-center rounded-xl border border-border px-6 text-base font-semibold hover:bg-surface transition-colors sm:w-auto"
            >
              See Pricing
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
