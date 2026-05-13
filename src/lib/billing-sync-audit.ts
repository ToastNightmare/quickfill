import type { BillingReconciliationResult } from "@/lib/billing-reconciliation";
import { isDatabaseConfigured, query } from "@/lib/db";

export async function recordBillingSync(result: BillingReconciliationResult, source: "cron" | "admin" | "customer" = "cron") {
  if (!isDatabaseConfigured()) return;

  try {
    await query("insert into audit_events (event_type, metadata) values ($1, $2::jsonb)", [
      result.ok ? "billing_sync_ok" : "billing_sync_failed",
      JSON.stringify({ ...result, source, completedAt: new Date().toISOString() }),
    ]);
  } catch (error) {
    console.error("Failed to record billing sync audit event", error);
  }
}
