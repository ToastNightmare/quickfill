import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BarChart3, CreditCard, Inbox, ShieldCheck, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Admin | QuickFill",
  robots: {
    index: false,
    follow: false,
  },
};

const adminCards = [
  {
    href: "/admin/analytics",
    title: "Growth analytics",
    body: "Track downloads, limits, checkout intent, and product quality.",
    icon: BarChart3,
  },
  {
    href: "/admin/users",
    title: "User management",
    body: "Search users, check plan state, usage, and safe customer details.",
    icon: Users,
  },
  {
    href: "/admin/support",
    title: "Support inbox",
    body: "Handle app support requests outside the customer dashboard.",
    icon: Inbox,
  },
  {
    href: "/admin/failures",
    title: "Failed downloads",
    body: "Review blocked or failed PDF exports before they become trust issues.",
    icon: AlertTriangle,
  },
  {
    href: "/admin/revenue",
    title: "Revenue metrics",
    body: "Read Stripe-backed revenue, invoice, and subscription signals.",
    icon: CreditCard,
  },
];

export default async function AdminPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
            <ShieldCheck className="h-4 w-4" />
            Admin only
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">QuickFill admin</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-muted">
            Private controls and business signals for running QuickFill. This area stays separate from your customer Pro dashboard.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {adminCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="flex min-h-40 flex-col justify-between rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-semibold">{card.title}</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">{card.body}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
