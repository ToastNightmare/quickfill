import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CreditCard, Database, ShieldCheck } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-routing";
import { checkDatabaseConnection } from "@/lib/db";
import { AdminBillingSyncControl } from "@/components/AdminBillingSyncControl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Billing Sync | QuickFill Admin",
  robots: { index: false, follow: false },
};

export default async function AdminBillingSyncPage() {
  await requireAdminUser();

  const database = await checkDatabaseConnection();
  const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY);
  const canRun = database.ok && stripeReady;

  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Admin home
        </Link>

        <div className="mt-6 border-b border-border pb-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
            <ShieldCheck className="h-4 w-4" />
            Admin only
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Billing repair</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            Manually reconcile QuickFill plan access against Stripe when a payment, refund, webhook, or support request needs immediate attention.
          </p>
        </div>

        <section className="mt-8 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">Run Stripe billing sync</h2>
                <p className="mt-1 text-sm text-text-muted">
                  This checks stored subscriptions, refreshes them from Stripe, downgrades expired access, and writes the result to ops health.
                </p>
              </div>
            </div>
          </div>

          <AdminBillingSyncControl disabled={!canRun} />
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-accent" />
              <h2 className="font-semibold">Database</h2>
            </div>
            <p className="mt-2 text-sm text-text-muted">{database.message}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-accent" />
              <h2 className="font-semibold">Stripe</h2>
            </div>
            <p className="mt-2 text-sm text-text-muted">
              {stripeReady ? "Stripe secret is configured." : "Stripe secret is missing; billing sync cannot run."}
            </p>
          </div>
        </section>

        {!canRun && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Billing sync is disabled until both the database and Stripe are healthy.
          </p>
        )}
      </div>
    </div>
  );
}
