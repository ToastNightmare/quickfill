"use client";

import { FormEvent, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, LifeBuoy, Send } from "lucide-react";

interface SupportFormProps {
  source: string;
  title?: string;
  description?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  compact?: boolean;
  onSent?: () => void;
}

export function SupportForm({
  source,
  title = "Need help?",
  description = "Send a message to support and we will look into it.",
  defaultSubject = "",
  defaultMessage = "",
  compact = false,
  onSent,
}: SupportFormProps) {
  const { user } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const fullName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ");
    const primaryEmail = user?.primaryEmailAddress?.emailAddress || "";
    if (fullName) setName(fullName);
    if (primaryEmail) setEmail(primaryEmail);
  }, [user]);

  useEffect(() => {
    setSubject(defaultSubject);
  }, [defaultSubject]);

  useEffect(() => {
    setMessage(defaultMessage);
  }, [defaultMessage]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !message.trim()) {
      setError("Email and message are required.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setError("");

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          subject,
          message,
          source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send support message.");
      setStatus("sent");
      if (!defaultMessage) setMessage("");
      onSent?.();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not send support message.");
    }
  };

  return (
    <form
      onSubmit={submit}
      className={compact ? "space-y-3" : "rounded-xl border border-border bg-surface p-5 shadow-sm"}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <LifeBuoy className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-text-muted">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
            placeholder="Your name"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-muted">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
            placeholder="you@example.com"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-muted">Subject</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          placeholder="What can we help with?"
        />
      </label>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-muted">Message</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 min-h-28 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Tell us what happened."
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {status === "sent" ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {status === "sending" ? "Sending..." : status === "sent" ? "Sent" : "Send message"}
        </button>
        {status === "sent" && <p className="text-sm font-medium text-emerald-600">Support request sent.</p>}
        {status === "error" && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    </form>
  );
}
