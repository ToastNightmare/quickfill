"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

export function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Admin login failed.");
        return;
      }

      window.location.href = "/admin/ops";
    } catch {
      setError("Admin login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-surface-alt px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-accent">QuickFill Admin</p>
            <h1 className="text-2xl font-bold tracking-tight">Admin access</h1>
          </div>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-sm font-semibold" htmlFor="admin-password">
            Admin passcode
          </label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none transition-colors focus:border-accent"
              placeholder="Enter admin passcode"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || password.length === 0}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Open admin
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-border bg-surface-alt p-4 text-sm text-text-muted">
          Passcode access expires after 12 hours. Clerk admin details are checked only after passcode access is active.
        </div>

        <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-accent hover:underline">
          Back to QuickFill
        </Link>
      </div>
    </div>
  );
}
