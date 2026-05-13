"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { BillingReconciliationResult } from "@/lib/billing-reconciliation";

type SyncState = {
  status: "idle" | "running" | "done" | "error";
  message: string;
  result: BillingReconciliationResult | null;
};

function resultSummary(result: BillingReconciliationResult) {
  return `Checked ${result.checked}, updated ${result.updated}, downgraded ${result.downgraded}, skipped ${result.skipped}, errors ${result.errors.length}.`;
}

export function AdminBillingSyncControl({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ status: "idle", message: "", result: null });

  async function runBillingSync() {
    setState({ status: "running", message: "Running billing sync...", result: null });

    try {
      const response = await fetch("/api/admin/billing-sync", { method: "POST" });
      const payload = await response.json().catch(() => null);
      const result = payload?.result as BillingReconciliationResult | undefined;

      if (!result) {
        throw new Error(payload?.error || "Billing sync did not return a result.");
      }

      setState({
        status: result.ok ? "done" : "error",
        message: result.ok ? resultSummary(result) : `${result.message} ${resultSummary(result)}`,
        result,
      });
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Billing sync failed.",
        result: null,
      });
    }
  }

  const isRunning = state.status === "running";
  const isDisabled = disabled || isRunning;

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-text-muted">
        <p>Use this after Stripe changes, failed payments, refunds, or support messages about Pro access.</p>
        {state.message && (
          <p
            className={
              "mt-2 rounded-lg border px-3 py-2 " +
              (state.status === "done"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : state.status === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-border bg-surface-alt text-text-muted")
            }
          >
            {state.message}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={isDisabled}
        onClick={runBillingSync}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={"h-4 w-4" + (isRunning ? " animate-spin" : "")} />
        {isRunning ? "Syncing" : "Run billing sync"}
      </button>
    </div>
  );
}
