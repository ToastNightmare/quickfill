import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditCard, DollarSign, TrendingUp } from "lucide-react";
import { getAdminUser } from "@/lib/admin";
import { getAdminRevenueSummary } from "@/lib/admin-console";

export const metadata: Metadata = {
  title: "Revenue Metrics | QuickFill",
  robots: { index: false, follow: false },
};

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminRevenuePage() {
  const admin = await getAdminUser();
  if (!admin) notFound();
  const revenue = await getAdminRevenueSummary();

  const cards = [
    { title: "Monthly run rate", value: money(revenue.monthlyRunRateCents), sub: "Active, trialing, and past due subs", icon: TrendingUp },
    { title: "Paid invoices", value: money(revenue.last30InvoiceCents), sub: "Paid invoice volume in the last 30 days", icon: DollarSign },
    { title: "Active subscriptions", value: String(revenue.activeSubscriptions), sub: revenue.trialingSubscriptions + " trialing, " + revenue.pastDueSubscriptions + " past due", icon: CreditCard },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
          <TrendingUp className="h-4 w-4" />
          Revenue
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Revenue metrics</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Stripe-backed subscription and invoice signals for QuickFill growth.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-accent" />
                <p className="text-sm text-text-muted">{card.title}</p>
              </div>
              <p className="mt-5 text-3xl font-bold">{card.value}</p>
              <p className="mt-1 text-sm text-text-muted">{card.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">Recent invoices</h2>
          <div className="mt-4 space-y-3">
            {revenue.recentInvoices.map((invoice) => (
              <div key={invoice.id} className="rounded-lg border border-border p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{invoice.email || invoice.id}</p>
                  <p className="font-semibold">{money(invoice.amountPaid)}</p>
                </div>
                <p className="mt-1 text-text-muted">{invoice.status || "unknown"} | {formatDate(invoice.createdAt)}</p>
                {invoice.hostedInvoiceUrl && (
                  <a className="mt-2 inline-flex text-xs font-semibold text-accent hover:text-accent-hover" href={invoice.hostedInvoiceUrl}>
                    Open invoice
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">Recent subscriptions</h2>
          <div className="mt-4 space-y-3">
            {revenue.recentSubscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-lg border border-border p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{subscription.status}</p>
                  <p className="font-semibold">{money(subscription.amount)} / {subscription.interval}</p>
                </div>
                <p className="mt-1 break-all text-text-muted">{subscription.customer}</p>
                <p className="mt-1 text-text-muted">{formatDate(subscription.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
