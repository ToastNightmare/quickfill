import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CreditCard, Database, RefreshCw, Webhook } from "lucide-react";
import { getAdminUser } from "@/lib/admin";
import { getAdminBillingReconciliation } from "@/lib/admin-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Billing Reconciliation | QuickFill",
  robots: { index: false, follow: false },
};

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700" : "inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

export default async function AdminBillingPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const reconciliation = await getAdminBillingReconciliation();
  const cards = [
    { title: "Stored subscriptions", value: reconciliation.storedSubscriptionCount, sub: `${reconciliation.storedPaidCount} paid active-like`, icon: Database },
    { title: "Stripe subscriptions", value: reconciliation.stripeSubscriptionCount, sub: `${reconciliation.stripeActiveLikeCount} active-like`, icon: CreditCard },
    { title: "Mismatches", value: reconciliation.mismatchCount, sub: reconciliation.mismatchCount === 0 ? "No drift detected" : "Needs review", icon: RefreshCw },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
            <RefreshCw className="h-4 w-4" />
            Billing reliability
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Billing reconciliation</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            Compare Stripe subscription truth with QuickFill stored access state so paid users do not silently lose or keep the wrong plan.
          </p>
        </div>
        <StatusPill ok={reconciliation.databaseConfigured && reconciliation.mismatchCount === 0} label={reconciliation.mismatchCount === 0 ? "Aligned" : "Review needed"} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.title} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-accent" />
                <p className="text-sm text-text-muted">{card.title}</p>
              </div>
              <p className="mt-5 text-3xl font-bold">{card.value}</p>
              <p className="mt-1 text-sm text-text-muted">{card.sub}</p>
            </article>
          );
        })}
      </div>

      {!reconciliation.databaseConfigured && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Database access is not configured, so QuickFill cannot compare stored subscription state.
        </div>
      )}

      <section className="mt-8 rounded-lg border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Mismatches</h2>
          <p className="mt-1 text-sm text-text-muted">Review these first after Stripe or webhook changes.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Severity</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Stripe</th>
                <th className="px-5 py-3 font-semibold">App</th>
                <th className="px-5 py-3 font-semibold">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reconciliation.mismatches.map((mismatch) => (
                <tr key={mismatch.id}>
                  <td className="px-5 py-4">
                    <span className={mismatch.severity === "fail" ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700" : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"}>
                      {mismatch.severity}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-medium">{mismatch.type}</td>
                  <td className="px-5 py-4 text-text-muted">{mismatch.userId || "Unknown"}</td>
                  <td className="px-5 py-4 text-text-muted">
                    <p>{mismatch.stripeState || "-"}</p>
                    <p className="break-all text-xs">{mismatch.stripeSubscriptionId || mismatch.stripeCustomerId || "No Stripe id"}</p>
                  </td>
                  <td className="px-5 py-4 text-text-muted">{mismatch.appState || "-"}</td>
                  <td className="px-5 py-4 text-text-muted">{mismatch.message}</td>
                </tr>
              ))}
              {reconciliation.mismatches.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-text-muted">
                    <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
                    No billing drift detected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold"><Webhook className="h-5 w-5 text-accent" /> Recent webhook events</h2>
          <div className="mt-4 space-y-3">
            {reconciliation.recentWebhookEvents.map((event) => (
              <div key={event.stripe_event_id} className="rounded-lg border border-border p-4 text-sm">
                <p className="font-semibold">{event.event_type}</p>
                <p className="mt-1 break-all text-xs text-text-muted">{event.stripe_event_id}</p>
                <p className="mt-1 text-text-muted">{formatDate(event.processed_at)}</p>
              </div>
            ))}
            {reconciliation.recentWebhookEvents.length === 0 && <p className="text-sm text-text-muted">No webhook events stored yet.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">Recent stored subscriptions</h2>
          <div className="mt-4 space-y-3">
            {reconciliation.storedSubscriptions.slice(0, 10).map((subscription) => (
              <div key={subscription.user_id} className="rounded-lg border border-border p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{subscription.tier} / {subscription.status}</p>
                  <p className="text-text-muted">{formatDate(subscription.updated_at)}</p>
                </div>
                <p className="mt-1 break-all text-xs text-text-muted">{subscription.user_id}</p>
                <p className="mt-1 break-all text-xs text-text-muted">{subscription.stripe_subscription_id || "No subscription id"}</p>
              </div>
            ))}
            {reconciliation.storedSubscriptions.length === 0 && <p className="text-sm text-text-muted">No stored subscriptions found.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
