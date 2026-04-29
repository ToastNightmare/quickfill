import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Admin | QuickFill",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-surface-alt px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
            <ShieldCheck className="h-4 w-4" />
            Admin only
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">QuickFill admin</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-muted">
            Private controls and business signals for running QuickFill.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/analytics"
            className="flex items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
              <BarChart3 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="font-semibold">Growth analytics</p>
              <p className="mt-1 text-sm text-text-muted">Track downloads, limits, and checkout intent.</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
