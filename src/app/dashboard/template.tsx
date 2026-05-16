"use client";

import { useEffect, type ReactNode } from "react";

function isPaidTier(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const record = data as { isPro?: unknown; tier?: unknown };
  return record.isPro === true || record.tier === "pro" || record.tier === "business";
}

export default function DashboardTemplate({ children }: { children: ReactNode }) {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const upgraded = searchParams.get("upgraded") === "true";
    const confirmed = searchParams.get("confirmed") === "true";
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
  }, []);

  return <>{children}</>;
}
