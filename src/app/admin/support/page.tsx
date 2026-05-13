import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-routing";
import { getAdminSupportInbox } from "@/lib/admin-console";
import type { AdminSupportStatusFilter } from "@/lib/admin-logs";
import { AdminSupportInbox } from "@/components/AdminSupportInbox";

export const metadata: Metadata = {
  title: "Support Inbox | QuickFill",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;
const STATUS_FILTERS: { value: AdminSupportStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanStatus(value: string | string[] | undefined): AdminSupportStatusFilter {
  const status = firstParam(value);
  return status === "new" || status === "open" || status === "closed" ? status : "all";
}

function cleanPage(value: string | string[] | undefined) {
  const page = Number(firstParam(value) ?? 1);
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
}

function supportHref({ page, q, status }: { page?: number; q: string; status: AdminSupportStatusFilter }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/support?${query}` : "/admin/support";
}

function FilterLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        "rounded-lg px-3 py-2 text-sm font-semibold transition-colors " +
        (active ? "bg-text text-white" : "border border-border bg-surface text-text-muted hover:border-accent hover:text-text")
      }
    >
      {label}
    </Link>
  );
}

export default async function AdminSupportPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const q = (firstParam(params.q) ?? "").trim().slice(0, 120);
  const status = cleanStatus(params.status);
  const page = cleanPage(params.page);
  const inbox = await getAdminSupportInbox({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: q,
    status,
  });
  const pageCount = Math.max(1, Math.ceil(inbox.total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

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

      <div className="mt-8 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <form className="grid gap-3 lg:grid-cols-[1fr_180px_auto_auto]" action="/admin/support">
          <label className="relative block">
            <span className="sr-only">Search support messages</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, email, subject, or message"
              className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-3 text-sm outline-none transition-colors focus:border-accent"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              name="status"
              defaultValue={status}
              className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition-colors focus:border-accent"
            >
              {STATUS_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Search
          </button>
          <Link
            href="/admin/support"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent"
          >
            Reset
          </Link>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((item) => (
            <FilterLink
              key={item.value}
              active={item.value === status}
              href={supportHref({ q, status: item.value })}
              label={item.label}
            />
          ))}
        </div>
      </div>

      <div className="mt-8">
        <AdminSupportInbox initialMessages={inbox.messages} totalMessages={inbox.total} />
      </div>

      {pageCount > 1 && (
        <nav className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-text-muted">
            Page {safePage} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Link
              aria-disabled={safePage <= 1}
              href={safePage <= 1 ? supportHref({ q, status }) : supportHref({ q, status, page: safePage - 1 })}
              className={
                "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-semibold transition-colors " +
                (safePage <= 1 ? "pointer-events-none opacity-50" : "hover:border-accent hover:text-accent")
              }
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Link>
            <Link
              aria-disabled={safePage >= pageCount}
              href={safePage >= pageCount ? supportHref({ q, status, page: safePage }) : supportHref({ q, status, page: safePage + 1 })}
              className={
                "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-semibold transition-colors " +
                (safePage >= pageCount ? "pointer-events-none opacity-50" : "hover:border-accent hover:text-accent")
              }
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
