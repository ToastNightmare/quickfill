import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, FileText, ShieldAlert, UserRound } from "lucide-react";
import { getAdminUser } from "@/lib/admin";
import { getAdminCustomer } from "@/lib/admin-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Customer Detail | QuickFill Admin",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}

export default async function AdminCustomerPage({ params }: PageProps) {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { id } = await params;
  const customer = await getAdminCustomer(id).catch(() => null);
  if (!customer) notFound();

  const profileEntries = Object.entries(customer.safeProfile);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft className="h-4 w-4" />
        Users
      </Link>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img src={customer.imageUrl} alt="" className="h-16 w-16 rounded-full border border-border bg-surface-alt" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
              <p className="mt-1 text-sm text-text-muted">{customer.email || customer.id}</p>
            </div>
          </div>
          <span className="w-fit rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase text-accent">{customer.tier}</span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-text-muted">Usage this month</p>
            <p className="mt-2 text-2xl font-bold">{customer.usedThisMonth}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-text-muted">Recent fills</p>
            <p className="mt-2 text-2xl font-bold">{customer.recentFillCount}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-text-muted">Last sign in</p>
            <p className="mt-2 text-sm font-semibold">{formatDate(customer.lastSignInAt)}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-text-muted">Security</p>
            <p className="mt-2 text-sm font-semibold">{customer.banned ? "Banned" : customer.locked ? "Locked" : customer.twoFactorEnabled ? "2FA on" : "Normal"}</p>
          </div>
        </div>
      </div>

      {customer.hasSensitiveProfileData && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>This customer profile contains sensitive fields. This admin view only shows safe profile values.</p>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-5 w-5 text-accent" /> Safe profile</h2>
          <div className="mt-4 space-y-3 text-sm">
            {profileEntries.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4 rounded-lg border border-border p-3">
                <span className="text-text-muted">{key}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
            {profileEntries.length === 0 && <p className="text-text-muted">No safe profile values stored.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="h-5 w-5 text-accent" /> Stripe</h2>
          {customer.stripeCustomer ? (
            <div className="mt-4 space-y-3 text-sm">
              <p><span className="text-text-muted">Customer:</span> {customer.stripeCustomer.id}</p>
              <p><span className="text-text-muted">Email:</span> {customer.stripeCustomer.email || "Unknown"}</p>
              <p><span className="text-text-muted">Name:</span> {customer.stripeCustomer.name || "Unknown"}</p>
              <p><span className="text-text-muted">Delinquent:</span> {customer.stripeCustomer.delinquent ? "Yes" : "No"}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-muted">No Stripe customer is linked.</p>
          )}

          <div className="mt-5 space-y-3">
            {customer.subscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-lg border border-border p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{subscription.status}</p>
                  <p className="font-semibold">{money(subscription.amount)} / {subscription.interval}</p>
                </div>
                <p className="mt-1 break-all text-xs text-text-muted">{subscription.id}</p>
                <p className="mt-1 text-text-muted">Period end: {formatDate(subscription.currentPeriodEnd)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-5 w-5 text-accent" /> Recent fills</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {customer.fills.map((fill) => (
            <div key={`${fill.filename}-${fill.filledAt}`} className="rounded-lg border border-border p-4 text-sm">
              <p className="font-semibold">{fill.filename}</p>
              <p className="mt-1 text-text-muted">{fill.fieldCount} fields, {fill.pageCount} pages</p>
              <p className="mt-1 text-text-muted">{formatDate(fill.filledAt)}</p>
            </div>
          ))}
          {customer.fills.length === 0 && <p className="text-sm text-text-muted">No recent fills stored.</p>}
        </div>
      </section>
    </div>
  );
}
