"use client";

import { useAuth } from "@clerk/nextjs";
import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

function checkoutParams() {
  const params = new URLSearchParams(window.location.search);
  const billing = params.get("billing") === "monthly" ? "monthly" : "annual";
  const source = params.get("source") ?? "checkout";
  return { billing, source };
}

export default function CheckoutPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [message, setMessage] = useState("Preparing secure checkout...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const { billing, source } = checkoutParams();
    const checkoutPath = `/checkout?plan=pro&billing=${billing}&source=${encodeURIComponent(source)}`;

    if (!isSignedIn) {
      setMessage("Create your account to continue to checkout.");
      window.location.href = `/sign-up?redirect_url=${encodeURIComponent(checkoutPath)}`;
      return;
    }

    let cancelled = false;

    async function startCheckout() {
      setMessage("Opening secure Stripe checkout...");
      setError(null);
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "pro", annual: billing === "annual" }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (data.url) {
          window.location.href = data.url;
          return;
        }

        if (res.status === 401) {
          window.location.href = `/sign-up?redirect_url=${encodeURIComponent(checkoutPath)}`;
          return;
        }

        setError(data.error ?? "Checkout could not be started. Please try again.");
      } catch {
        if (!cancelled) setError("Checkout could not be started. Please try again.");
      }
    }

    startCheckout();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-surface-alt px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
          {error ? (
            <ShieldCheck className="h-6 w-6 text-accent" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          )}
        </div>
        <h1 className="mt-5 text-2xl font-bold">QuickFill Pro checkout</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          {error ?? message}
        </p>
        {error && (
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              Try again
            </button>
            <Link
              href="/pricing"
              className="flex h-11 items-center justify-center rounded-lg border border-border px-5 text-sm font-semibold text-text hover:bg-surface-alt transition-colors"
            >
              Back to pricing
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
