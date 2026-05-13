"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

type SyncState = "idle" | "loading" | "success" | "error";

export function AdminBillingSyncButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function syncBilling() {
    setState("loading");
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(userId)}/billing-sync`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; result?: { message?: string } } | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.result?.message ?? data?.error ?? "Could not sync billing from Stripe.");
      }

      setState("success");
      setMessage(data.result?.message ?? "Synced from Stripe.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not sync billing from Stripe.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={syncBilling}
        disabled={state === "loading"}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${state === "loading" ? "animate-spin" : ""}`} />
        {state === "loading" ? "Syncing" : "Sync from Stripe"}
      </button>
      {message && (
        <p className={`max-w-56 text-xs font-medium ${state === "error" ? "text-red-700" : "text-emerald-700"}`}>{message}</p>
      )}
    </div>
  );
}
