import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, ShieldCheck, UserRound } from "lucide-react";
import { getAdminUser } from "@/lib/admin";
import { getAdminUsers } from "@/lib/admin-console";

export const metadata: Metadata = {
  title: "Admin Users | QuickFill",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { q = "" } = await searchParams;
  const data = await getAdminUsers(q);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
            <ShieldCheck className="h-4 w-4" />
            Admin only
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">User management</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-muted">
            Search customers, check plan state, and jump into safe customer lookup without touching the Pro dashboard.
          </p>
        </div>
        <form className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name or email"
              className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <button className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
            Search
          </button>
        </form>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Customers</h2>
            <p className="text-sm text-text-muted">{data.totalCount} total user{data.totalCount === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Usage</th>
                <th className="px-5 py-3 font-semibold">Last sign in</th>
                <th className="px-5 py-3 font-semibold">Security</th>
                <th className="px-5 py-3 font-semibold">Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-alt/60">
                  <td className="px-5 py-4">
                    <Link href={"/admin/customers/" + user.id} className="flex items-center gap-3">
                      <img src={user.imageUrl} alt="" className="h-9 w-9 rounded-full border border-border bg-surface-alt" />
                      <span>
                        <span className="block font-semibold text-text">{user.name}</span>
                        <span className="block text-xs text-text-muted">{user.email || user.id}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold uppercase text-accent">
                      {user.tier}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-text-muted">
                    {user.usedThisMonth} fills this month, {user.recentFillCount} recent
                  </td>
                  <td className="px-5 py-4 text-text-muted">{formatDate(user.lastSignInAt)}</td>
                  <td className="px-5 py-4 text-text-muted">
                    {user.banned ? "Banned" : user.locked ? "Locked" : user.twoFactorEnabled ? "2FA on" : "Normal"}
                  </td>
                  <td className="px-5 py-4 text-text-muted">{user.stripeCustomerId ? "Connected" : "None"}</td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-text-muted">
                    <UserRound className="mx-auto mb-3 h-8 w-8 opacity-40" />
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
