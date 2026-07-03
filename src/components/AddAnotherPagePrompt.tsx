"use client";

type AddAnotherPagePromptProps = {
  open: boolean;
  onAddAnother: () => void;
  onDone: () => void;
};

export function AddAnotherPagePrompt({ open, onAddAnother, onDone }: AddAnotherPagePromptProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:items-center sm:pb-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDone();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <p className="text-base font-bold text-text">Page added</p>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
          <button
            type="button"
            onClick={onAddAnother}
            className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Add another page
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text-muted transition-colors hover:bg-surface-alt"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
