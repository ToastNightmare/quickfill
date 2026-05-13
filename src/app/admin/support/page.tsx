import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-routing";
import { getAdminSupportInbox } from "@/lib/admin-console";
import { AdminSupportInbox } from "@/components/AdminSupportInbox";

export const metadata: Metadata = {
  title: "Support Inbox | QuickFill",
  robots: { index: false, follow: false },
};

export default async function AdminSupportPage() {
  await requireAdminUser();
  const messages = await getAdminSupportInbox();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
          <Inbox className="h-4 w-4" />
          Admin only
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Support inbox</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          A private queue for app support requests. This stays out of the customer dashboard.
        </p>
      </div>

      <div className="mt-8">
        <AdminSupportInbox initialMessages={messages} />
      </div>
    </div>
  );
}
