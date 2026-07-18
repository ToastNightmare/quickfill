"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldSuggestion, SuggestedFieldType } from "@/lib/field-suggestions";

export type FieldSuggestionReviewStatus = "processing" | "review" | "error";
export type FieldSuggestionCommitAction = "accept_all" | "accepted_selected";
export type FieldSuggestionReviewDecision = "accepted" | "rejected";

interface FieldSuggestionReviewProps {
  status: FieldSuggestionReviewStatus;
  suggestions: readonly FieldSuggestion[];
  errorMessage?: string;
  onTypeChange: (id: string, type: SuggestedFieldType) => void;
  onCommit: (
    suggestions: readonly FieldSuggestion[],
    action: FieldSuggestionCommitAction,
  ) => void;
  onDecision?: (decision: FieldSuggestionReviewDecision) => void;
  onRetry: () => void;
  onCancel: () => void;
}

export function FieldSuggestionReview({
  status,
  suggestions,
  errorMessage,
  onTypeChange,
  onCommit,
  onDecision,
  onRetry,
  onCancel,
}: FieldSuggestionReviewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const decisionsRef = useRef<Record<string, FieldSuggestionReviewDecision>>({});
  const [decisions, setDecisions] = useState<Record<string, FieldSuggestionReviewDecision>>({});

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  const accepted = suggestions.filter((suggestion) => decisions[suggestion.id] === "accepted");
  const remaining = suggestions.filter((suggestion) => decisions[suggestion.id] !== "rejected");

  const decide = (id: string, decision: FieldSuggestionReviewDecision) => {
    if (decisionsRef.current[id] === decision) return;
    const next = { ...decisionsRef.current, [id]: decision };
    decisionsRef.current = next;
    setDecisions(next);
    onDecision?.(decision);
  };

  const handleRetry = () => {
    decisionsRef.current = {};
    setDecisions({});
    onRetry();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-suggestion-review-title"
        aria-describedby="field-suggestion-review-description"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        className="flex max-h-[calc(100svh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl outline-none sm:max-h-[calc(100svh-2rem)] sm:rounded-2xl"
      >
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 id="field-suggestion-review-title" className="text-lg font-bold text-text">
            {status === "processing"
              ? "Finding fillable areas"
              : status === "error"
                ? "Couldn’t suggest fields"
                : "Review fillable field suggestions"}
          </h2>
          <p id="field-suggestion-review-description" className="mt-1 text-sm leading-relaxed text-text-muted">
            This check runs only in your browser. Nothing is added to your form until you confirm it here.
          </p>
        </div>

        {status === "processing" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center" role="status" aria-live="polite">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
            <div>
              <p className="font-semibold text-text">Checking the first photo page…</p>
              <p className="mt-1 text-sm text-text-muted">You can cancel and keep using the normal editor.</p>
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-1 flex-col justify-center px-6 py-10 text-center">
            <p role="alert" className="font-semibold text-text">
              {errorMessage ?? "Field suggestions are unavailable for this page."}
            </p>
            <p className="mt-2 text-sm text-text-muted">Your photo is still ready in the editor, and no fields were added.</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center px-6 py-10 text-center">
            <p className="font-semibold text-text">No clear fillable areas were found.</p>
            <p className="mt-2 text-sm text-text-muted">Try again, or continue and place fields manually.</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <p className="sr-only" aria-live="polite">
              {accepted.length} accepted and {suggestions.filter((suggestion) => decisions[suggestion.id] === "rejected").length} rejected.
            </p>
            <ol className="space-y-3">
              {suggestions.map((suggestion, index) => {
                const decision = decisions[suggestion.id];
                const number = index + 1;
                return (
                  <li
                    key={suggestion.id}
                    data-testid={`field-suggestion-${suggestion.id}`}
                    className="rounded-xl border border-border bg-surface-alt p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-text">Field {number}</p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          Page 1 · {Math.round(suggestion.confidence * 100)}% confidence
                        </p>
                      </div>
                      {decision && (
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${decision === "accepted" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"}`}>
                          {decision === "accepted" ? "Accepted for review" : "Rejected"}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <label className="text-sm font-medium text-text" htmlFor={`field-suggestion-type-${suggestion.id}`}>
                        Field type
                        <select
                          id={`field-suggestion-type-${suggestion.id}`}
                          value={suggestion.type}
                          onChange={(event) => onTypeChange(suggestion.id, event.target.value as SuggestedFieldType)}
                          className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm"
                        >
                          <option value="text">Single-line text</option>
                          <option value="checkbox">Checkbox</option>
                        </select>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          aria-pressed={decision === "accepted"}
                          onClick={() => decide(suggestion.id, "accepted")}
                          className="min-h-11 rounded-lg border border-green-300 px-4 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          Accept
                          <span className="sr-only"> field {number}</span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={decision === "rejected"}
                          onClick={() => decide(suggestion.id, "rejected")}
                          className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text-muted transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          Reject
                          <span className="sr-only"> field {number}</span>
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2 sm:px-6">
          {status === "review" && suggestions.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => onCommit(remaining, "accept_all")}
                disabled={remaining.length === 0}
                className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                Accept all
              </button>
              <button
                type="button"
                onClick={() => onCommit(accepted, "accepted_selected")}
                disabled={accepted.length === 0}
                className="min-h-11 rounded-xl border border-accent px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent/5 disabled:opacity-50"
              >
                Add accepted fields{accepted.length > 0 ? ` (${accepted.length})` : ""}
              </button>
            </>
          )}
          {status !== "processing" && (
            <button
              type="button"
              onClick={handleRetry}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-alt"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-alt"
          >
            {status === "processing" ? "Cancel" : "Continue in editor"}
          </button>
        </div>
      </div>
    </div>
  );
}
