"use client";

import { FileText } from "lucide-react";

interface DownloadPreviewGateProps {
  open: boolean;
  onClose: () => void;
  previewDataUrl: string | null;
  fileName: string;
  /**
   * Checkout attribution source carried through the checkout links.
   * Any source starting with "download_preview_gate" cancels back to
   * /editor?download=cancelled so the user returns to the unlock moment.
   */
  checkoutSource?: string;
}

const valueItems = [
  "Clean PDF, no watermark",
  "Unlimited downloads",
  "Works with PDFs, photos and scans",
  "Secure checkout by Stripe, cancel anytime",
];

function PreviewWatermark() {
  return (
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="quickfill-preview-watermark"
          x="0"
          y="0"
          width="200"
          height="120"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-30)"
        >
          <text
            x="10"
            y="60"
            fontSize="14"
            fill="rgba(100,100,100,0.45)"
            fontFamily="sans-serif"
            fontWeight="bold"
          >
            QuickFill Preview
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#quickfill-preview-watermark)" />
    </svg>
  );
}

export function DownloadPreviewGate({
  open,
  onClose,
  previewDataUrl,
  fileName,
  checkoutSource = "download_preview_gate",
}: DownloadPreviewGateProps) {
  if (!open) return null;

  const sourceParam = encodeURIComponent(checkoutSource);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-preview-gate-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="bg-navy px-8 py-6 text-center text-white">
          <h2 id="download-preview-gate-title" className="text-2xl font-extrabold">
            Your document is ready
          </h2>
          <p className="mt-2 text-sm text-gray-300">
            Preview your finished file, then unlock the clean download.
          </p>
        </div>

        <div className="mx-6 mt-6 overflow-hidden rounded-xl border border-border">
          <div className="relative flex min-h-56 items-center justify-center bg-white p-3 sm:min-h-80">
            {previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt="Document preview"
                className="h-auto w-full max-h-56 object-contain sm:max-h-80"
              />
            ) : (
              <div
                className="flex h-56 w-full items-center justify-center rounded-xl bg-surface-alt sm:h-80"
                aria-label="Document preview loading"
              >
                <FileText className="h-10 w-10 text-text-muted" />
              </div>
            )}
            <PreviewWatermark />
          </div>
        </div>

        <p className="mx-6 mt-2 text-center text-xs text-text-muted">
          Preview only, unlock download to remove watermark.
        </p>

        <div className="px-8 py-6">
          <div className="text-center">
            <p className="text-xl font-bold text-text">Unlock your clean download for A$2</p>
            <p className="mt-1 text-sm text-text-muted">
              7-day intro, then A$25/month. Cancel anytime.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <a
              href={`/checkout?plan=pro&billing=monthly&source=${sourceParam}`}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Unlock download for A$2
            </a>
            <p className="text-center text-xs text-text-muted">
              We process your file to create the download, but we don&apos;t store your document file.
            </p>
          </div>

          <ul className="mt-4 rounded-xl bg-surface-alt p-4 text-sm text-text-muted">
            {valueItems.map((item) => (
              <li key={item} className="flex gap-2 py-1">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col items-center gap-3">
            <a
              href={`/checkout?plan=pro&billing=annual&source=${sourceParam}`}
              className="text-sm font-medium text-text-muted underline underline-offset-2 transition-colors hover:text-text"
            >
              Prefer annual? A$149/year
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-text-muted transition-colors hover:text-text"
            >
              Keep editing
            </button>
          </div>

          {fileName && (
            <p className="mt-4 truncate text-center text-xs text-text-muted" title={fileName}>
              {fileName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
