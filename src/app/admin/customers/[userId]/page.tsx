import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, FileText, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { getAdminUser } from "@/lib/admin";
import { getAdminCustomer } from "@/lib/admin-console";

export const metadata: Metadata = {
  title: "Customer Lookup | QuickFill",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ userId: string }>;
}

function formatDate(value: string | null) {
  if (!value) return "None";
  return new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}

export default async function AdminCustomerPage({ params }: PageProps) {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { userId } = await params;
  const customer = await getAdminCustomer(userId).catch(() => null);
  if (!customer) notFound();

  const profileRows = Object.entries(customer.safeProfile);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" />
        Users
      </Link>

      <div className="mt-6 flex flex-col gap-5 rounded-lg border border-border bg-surface p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <img src={customer.imageUrl} alt="" className="h-14 w-14 rounded-full border border-border bg-surface-alt" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
            <p className="text-sm text-text-muted">{customer.email || customer.id}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold uppercase text-accent">{customer.tier}</span>
          <span className="rounded-full bg-surface-alt px-3 py-1 text-sm font-semibold text-text-muted">
            {customer.usedThisMonth} fills this month
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-accent" />
            <h2 className="font-semibold">Account</h2>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-text-muted">Created</dt>
              <dd className="font-medium">{formatDate(customer.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Last sign in</dt>
              <dd className="font-medium">{formatDate(customer.lastSignInAt)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Security</dt>
              <dd className="font-medium">{customer.twoFactorEnabled ? "2FA enabled" : "Standard login"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-accent" />
            <h2 className="font-semibold">Safe profile</h2>
          </div>
          {profileRows.length > 0 ? (
            <dl className="mt-4 space-y-3 text-sm">
              {profileRows.map(([key, value]) => (
                <div key={key}>
                  <dt className="capitalize text-text-muted">{key}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-text-muted">No saved profile details.</p>
          )}
          {customer.hasSensitiveProfileData && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Sensitive ID or banking fields exist but are hidden from admin view by default.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-accent" />
            <h2 className="font-semibold">Billing</h2>
          </div>
          {customer.stripeCustomer ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-text-muted">Stripe customer</dt>
                <dd className="break-all font-medium">{customer.stripeCustomer.id}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Delinquent</dt>
                <dd className="font-medium">{customer.stripeCustomer.delinquent ? "Yes" : "No"}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-text-muted">No Stripe customer linked.</p>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <h2 className="font-semibold">Subscriptions</h2>
          </div>
          <div className="mt-4 space-y-3">
            {customer.subscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-lg border border-border p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{subscription.status}</p>
                  <p className="text-text-muted">{money(subscription.amount)} / {subscription.interval}</p>
                </div>
                <p className="mt-1 text-xs text-text-muted">{subscription.price}</p>
                <p className="mt-2 text-xs text-text-muted">Renews or ended: {formatDate(subscription.currentPeriodEnd)}</p>
              </div>
            ))}
            {customer.subscriptions.length === 0 && <p className="text-sm text-text-muted">No subscriptions found.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" />
            <h2 className="font-semibold">Recent fills</h2>
          </div>
          <div className="mt-4 space-y-3">
            {customer.fills.map((fill, index) => (
              <div key={fill.filename + "-" + index} className="rounded-lg border border-border p-4 text-sm">
                <p className="font-semibold">{fill.filename}</p>
                <p className="mt-1 text-text-muted">
                  {formatDate(fill.filledAt)} | {fill.fieldCount} fields | {fill.pageCount} pages
                </p>
              </div>
            ))}
            {customer.fills.length === 0 && <p className="text-sm text-text-muted">No fill history found.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
