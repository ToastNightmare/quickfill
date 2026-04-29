import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inbox, Mail } from "lucide-react";
import { getAdminUser } from "@/lib/admin";
import { getAdminSupportInbox } from "@/lib/admin-console";

export const metadata: Metadata = {
  title: "Support Inbox | QuickFill",
  robots: { index: false, follow: false },
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminSupportPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();
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

      <div className="mt-8 space-y-4">
        {messages.map((message) => (
          <article key={message.id} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-accent">{message.status}</p>
                <h2 className="mt-1 text-lg font-semibold">{message.subject}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {message.name} | <a className="hover:text-text" href={"mailto:" + message.email}>{message.email}</a>
                </p>
              </div>
              <p className="text-sm text-text-muted">{formatDate(message.createdAt)}</p>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-muted">{message.message}</p>
            {message.userId && <p className="mt-4 text-xs text-text-muted">User ID: {message.userId}</p>}
          </article>
        ))}
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
            <Mail className="mx-auto mb-3 h-8 w-8 text-text-muted/50" />
            <p className="font-semibold">No support messages yet</p>
            <p className="mt-1 text-sm text-text-muted">The inbox is ready once support forms start sending here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
