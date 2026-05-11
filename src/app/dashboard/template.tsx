"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

function isPaidTier(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const tier = (data as { tier?: unknown }).tier;
  return tier === "pro" || tier === "business";
}

export default function DashboardTemplate({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded") === "true";
  const confirmed = searchParams.get("confirmed") === "true";

  useEffect(() => {
    if (!upgraded || confirmed) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    const pollForProAccess = async () => {
      attempts += 1;

      try {
        const response = await fetch("/api/usage", { cache: "no-store" });
        const data = await response.json();

        if (!cancelled && isPaidTier(data)) {
          window.location.replace("/dashboard?upgraded=true&confirmed=true");
          return;
        }
      } catch {
        // Keep polling briefly; the dashboard still shows support guidance if this never settles.
      }

      if (!cancelled && attempts < maxAttempts) {
        window.setTimeout(pollForProAccess, 1500);
      }
    };

    const timer = window.setTimeout(pollForProAccess, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [confirmed, upgraded]);

  return <>{children}</>;
}
