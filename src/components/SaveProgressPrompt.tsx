"use client";

import Link from "next/link";

type SaveProgressPromptProps = {
  open: boolean;
  onKeepEditing: () => void;
  onSignInClick?: () => void;
};

const SIGN_IN_HREF = `/sign-in?redirect_url=${encodeURIComponent("/editor")}`;

/**
 * Shown when an anonymous user clicks Save Progress. Local autosave already
 * protects their work on this device, so this prompt reassures them and
 * explains that signing in adds account-level progress saving. It must never
 * imply the PDF file itself is stored on QuickFill servers.
 */
export function SaveProgressPrompt({ open, onKeepEditing, onSignInClick }: SaveProgressPromptProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:items-center sm:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-progress-prompt-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onKeepEditing();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <p id="save-progress-prompt-title" className="text-base font-bold text-text">
          Already saved on this device
        </p>
        <p className="mt-2 text-sm text-text-muted">
          Your document is already saved on this device. Sign in to save progress to your account.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <Link
            href={SIGN_IN_HREF}
            onClick={onSignInClick}
            className="rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Sign in to save
          </Link>
          <button
            type="button"
            onClick={onKeepEditing}
            className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text-muted transition-colors hover:bg-surface-alt"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
