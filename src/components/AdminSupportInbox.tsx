"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  CircleDot,
  Clock3,
  Inbox,
  Mail,
  NotebookPen,
  Reply,
  Send,
  Tag,
  UserRound,
} from "lucide-react";
import type { AdminSupportMessage, AdminSupportMessagePatch, AdminSupportStatus } from "@/lib/admin-logs";

const STATUS_META: Record<AdminSupportStatus, { label: string; className: string; icon: typeof CircleDot }> = {
  new: {
    label: "New",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: CircleDot,
  },
  open: {
    label: "Open",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: CheckCircle2,
  },
  closed: {
    label: "Closed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: Archive,
  },
};

const PRIORITY_META = {
  low: "bg-slate-50 text-slate-600 border-slate-200",
  normal: "bg-slate-50 text-slate-600 border-slate-200",
  high: "bg-red-50 text-red-700 border-red-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
} as const;

type DraftState = Record<string, { assignee: string; internalNotes: string }>;

function formatDate(value: string | null | undefined) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function statusSort(status: AdminSupportStatus) {
  if (status === "new") return 0;
  if (status === "open") return 1;
  return 2;
}

function initialDrafts(messages: AdminSupportMessage[]): DraftState {
  return Object.fromEntries(
    messages.map((message) => [
      message.id,
      {
        assignee: message.assignee ?? "",
        internalNotes: message.internalNotes ?? "",
      },
    ]),
  );
}

function StatusBadge({ status }: { status: AdminSupportStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold " + meta.className}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function SupportTag({ label, className }: { label: string; className: string }) {
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold " + className}>
      <Tag className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function AdminSupportInbox({
  initialMessages,
  totalMessages = initialMessages.length,
}: {
  initialMessages: AdminSupportMessage[];
  totalMessages?: number;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [drafts, setDrafts] = useState<DraftState>(() => initialDrafts(initialMessages));
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((left, right) => {
        const statusDelta = statusSort(left.status) - statusSort(right.status);
        if (statusDelta !== 0) return statusDelta;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [messages],
  );

  function updateDraft(id: string, draft: Partial<DraftState[string]>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        assignee: current[id]?.assignee ?? "",
        internalNotes: current[id]?.internalNotes ?? "",
        ...draft,
      },
    }));
  }

  async function updateMessage(message: AdminSupportMessage, patch: AdminSupportMessagePatch) {
    setError("");
    setPendingId(message.id);

    try {
      const response = await fetch(`/api/admin/support/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.message) {
        throw new Error(payload?.error || "Could not update support message");
      }

      const nextMessage = payload.message as AdminSupportMessage;
      setMessages((current) => current.map((item) => (item.id === message.id ? nextMessage : item)));
      updateDraft(message.id, {
        assignee: nextMessage.assignee ?? "",
        internalNotes: nextMessage.internalNotes ?? "",
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update support message");
    } finally {
      setPendingId(null);
    }
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
        <Mail className="mx-auto mb-3 h-8 w-8 text-text-muted/50" />
        <p className="font-semibold">No support messages in this view</p>
        <p className="mt-1 text-sm text-text-muted">Try another status filter or search term.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="h-5 w-5 text-accent" />
          <div>
            <p className="text-sm font-semibold">
              Showing {messages.length} of {totalMessages} support message{totalMessages === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-text-muted">Newest requests stay at the top until you open or close them.</p>
          </div>
        </div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      {sortedMessages.map((message) => {
        const isBusy = pendingId === message.id;
        const priority = message.priority || "normal";
        const priorityClass = PRIORITY_META[priority] ?? PRIORITY_META.normal;
        const draft = drafts[message.id] ?? { assignee: message.assignee ?? "", internalNotes: message.internalNotes ?? "" };
        return (
          <article key={message.id} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={message.status} />
                  <SupportTag label={priority} className={priorityClass} />
                  <SupportTag label={message.category || "general"} className="bg-blue-50 text-blue-700 border-blue-200" />
                </div>
                <h2 className="mt-3 text-lg font-semibold">{message.subject}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {message.name} | <a className="hover:text-text" href={"mailto:" + message.email}>{message.email}</a>
                </p>
              </div>
              <p className="text-sm text-text-muted">{formatDate(message.createdAt)}</p>
            </div>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-muted">{message.message}</p>

            <div className="mt-4 grid gap-2 text-xs text-text-muted sm:grid-cols-2 lg:grid-cols-4">
              <p>User ID: {message.userId || "guest"}</p>
              <p>Source: {message.source || "unknown"}</p>
              <p className="inline-flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" />
                {message.assignee || "Unassigned"}
              </p>
              <p className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                Replied: {formatDate(message.lastReplyAt)}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={`mailto:${message.email}?subject=${encodeURIComponent("Re: " + message.subject)}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent"
              >
                <Reply className="h-4 w-4" />
                Reply
              </a>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => updateMessage(message, { replySent: true })}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                Mark replied
              </button>
              {message.status !== "open" && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => updateMessage(message, { status: "open" })}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-amber-300 hover:text-amber-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark open
                </button>
              )}
              {message.status !== "closed" && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => updateMessage(message, { status: "closed" })}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
                >
                  <Archive className="h-4 w-4" />
                  Close
                </button>
              )}
              {message.status === "closed" && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => updateMessage(message, { status: "new" })}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-blue-300 hover:text-blue-700 disabled:opacity-60"
                >
                  <CircleDot className="h-4 w-4" />
                  Reopen
                </button>
              )}
            </div>

            <form
              className="mt-5 grid gap-3 border-t border-border pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                void updateMessage(message, {
                  assignee: draft.assignee,
                  internalNotes: draft.internalNotes,
                });
              }}
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_1fr_auto] md:items-end">
                <label className="block">
                  <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-text-muted">
                    <UserRound className="h-3.5 w-3.5" />
                    Owner
                  </span>
                  <input
                    value={draft.assignee}
                    onChange={(event) => updateDraft(message.id, { assignee: event.target.value })}
                    placeholder="Assign owner"
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition-colors focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-text-muted">
                    <NotebookPen className="h-3.5 w-3.5" />
                    Internal notes
                  </span>
                  <textarea
                    value={draft.internalNotes}
                    onChange={(event) => updateDraft(message.id, { internalNotes: event.target.value })}
                    placeholder="Add private follow-up notes"
                    rows={2}
                    className="min-h-10 w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </form>
          </article>
        );
      })}
    </div>
  );
}
