"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import {
  PRICING_V2,
  pricingV2Enabled,
  saleWindowOpen,
  type PricingV2Billing,
} from "@/lib/pricing-v2";

interface DownloadPreviewGateProps {
  open: boolean;
  onClose: () => void;
  /**
   * Optional pre-generated preview for page 1 (index 0). Callers that
   * provide renderPagePreview can omit this.
   */
  previewDataUrl?: string | null;
  fileName: string;
  /** Total document pages. Page navigation renders only when above 1. */
  pageCount?: number;
  /**
   * Lazily renders the locked preview image for one page (0-based index).
   * Called when the user reaches a page with no cached preview. Must never
   * call /api/fill-pdf or produce the clean unlocked document.
   */
  renderPagePreview?: (pageIndex: number) => Promise<string | null>;
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

const pricingV2PlanCards: Array<{
  billing: PricingV2Billing;
  title: string;
  price: string;
  sublabel?: string;
  badge?: string;
  highlighted?: boolean;
}> = [
  {
    billing: "annual",
    title: "Yearly",
    price: PRICING_V2.annual.cardPrice,
    sublabel: PRICING_V2.annual.sublabel,
    badge: PRICING_V2.annual.badge,
  },
  {
    billing: "monthly",
    title: "Monthly",
    price: PRICING_V2.monthly.cardPrice,
  },
  {
    billing: "sale",
    title: "Sale",
    price: PRICING_V2.sale.cardPrice,
    sublabel: PRICING_V2.sale.sublabel,
    badge: PRICING_V2.sale.badge,
    highlighted: true,
  },
];

function PricingV2CheckoutAction({
  billing,
  sourceParam,
}: {
  billing: PricingV2Billing;
  sourceParam: string;
}) {
  const plan = PRICING_V2[billing];

  return (
    <div className="mt-5">
      <a
        data-testid="pricing-v2-cta"
        href={`/checkout?plan=pro&billing=${billing}&source=${sourceParam}`}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        {plan.cta}
      </a>
      <p data-testid="pricing-v2-fine-print" className="mt-3 text-center text-xs leading-5 text-text-muted">
        {plan.finePrint}
      </p>
      <div className="mt-3 space-y-1 text-center text-xs leading-5 text-text-muted">
        <p>Cancel anytime. Manage your subscription in the Stripe customer portal.</p>
        <p>
          <a href="/terms" className="underline underline-offset-2 hover:text-text">Terms of Service</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacy" className="underline underline-offset-2 hover:text-text">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

function PricingV2Content({
  sourceParam,
  fileName,
  onClose,
}: {
  sourceParam: string;
  fileName: string;
  onClose: () => void;
}) {
  const [selectedBilling, setSelectedBilling] = useState<PricingV2Billing>("annual");
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const saleOpen = saleWindowOpen(new Date(), process.env.NEXT_PUBLIC_QUICKFILL_SALE_ENDS);
  const availablePlans = saleOpen
    ? pricingV2PlanCards
    : pricingV2PlanCards.filter((plan) => plan.billing !== "sale");

  return (
    <div className="px-6 py-6 sm:px-8">
      <div className="text-center">
        <p className="text-xl font-bold text-text">{PRICING_V2.hero}</p>
        <button
          type="button"
          onClick={() => setPlanPickerOpen(true)}
          aria-haspopup="dialog"
          className="mt-2 text-sm font-semibold text-accent underline underline-offset-2 transition-colors hover:text-accent-hover"
        >
          View all plans
        </button>
      </div>

      {!planPickerOpen && (
        <PricingV2CheckoutAction billing={selectedBilling} sourceParam={sourceParam} />
      )}

      <p className="mt-4 text-center text-xs text-text-muted">
        We process your file to create the download, but we don&apos;t store your document file.
      </p>

      <ul className="mt-4 rounded-xl bg-surface-alt p-4 text-sm text-text-muted">
        {valueItems.map((item) => (
          <li key={item} className="flex gap-2 py-1">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex justify-center">
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

      {planPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-4 sm:py-8">
          <button
            type="button"
            aria-label="Close plan picker"
            onClick={() => setPlanPickerOpen(false)}
            className="absolute inset-0 bg-black/55"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pricing-v2-plan-picker-title"
            className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-5 pb-7 pt-4 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-7"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="pricing-v2-plan-picker-title" className="text-xl font-bold text-text">
                  Choose your plan
                </h3>
                <p className="mt-1 text-sm text-text-muted">Select the option that suits you best.</p>
              </div>
              <button
                type="button"
                onClick={() => setPlanPickerOpen(false)}
                aria-label="Close plan picker"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-xl leading-none text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {availablePlans.map((plan) => {
                const selected = selectedBilling === plan.billing;
                return (
                  <button
                    key={plan.billing}
                    type="button"
                    data-testid={`pricing-v2-plan-${plan.billing}`}
                    aria-pressed={selected}
                    onClick={() => setSelectedBilling(plan.billing)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      selected
                        ? "border-accent bg-accent/10 ring-1 ring-accent"
                        : plan.highlighted
                          ? "border-accent/50 bg-accent/5 hover:border-accent"
                          : "border-border bg-surface hover:border-accent/60"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-base font-bold text-text">{plan.title}</span>
                      {plan.badge && (
                        <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white">
                          {plan.badge}
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block text-lg font-extrabold text-text">{plan.price}</span>
                    {plan.sublabel && (
                      <span className="mt-1 block text-xs font-semibold text-text-muted">{plan.sublabel}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <PricingV2CheckoutAction billing={selectedBilling} sourceParam={sourceParam} />
          </div>
        </div>
      )}
    </div>
  );
}

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
  previewDataUrl = null,
  fileName,
  pageCount = 1,
  renderPagePreview,
  checkoutSource = "download_preview_gate",
}: DownloadPreviewGateProps) {
  const [pageIndex, setPageIndex] = useState(0);
  // Per-gate-session cache: previously viewed pages return instantly.
  const [previews, setPreviews] = useState<Record<number, string>>({});
  // Monotonic id per gate opening. Async results from a previous opening
  // (or a previous document) are discarded when they arrive late.
  const [sessionId, setSessionId] = useState(0);
  const sessionIdRef = useRef(sessionId);
  const pendingPagesRef = useRef<Set<number>>(new Set());

  // Fresh session on every open (render-time state adjustment): back to
  // page 1 with an empty cache, so a changed document or edited fields
  // never show stale previews.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSessionId((id) => id + 1);
      setPageIndex(0);
      setPreviews({});
    }
  }

  // Keep the async-guard refs in step with the committed session.
  useEffect(() => {
    sessionIdRef.current = sessionId;
    pendingPagesRef.current = new Set();
  }, [sessionId]);

  // Lazy generation: only the page being viewed is ever rendered. Page 1
  // generates when the gate opens; later pages generate on first visit.
  useEffect(() => {
    if (!open || !renderPagePreview) return;
    if (previews[pageIndex]) return;
    if (pageIndex === 0 && previewDataUrl) return;
    if (pendingPagesRef.current.has(pageIndex)) return;

    const session = sessionId;
    const page = pageIndex;
    // A page is requested at most once per session. Successful pages stay
    // marked (the cache serves them); only failures clear the mark so a
    // revisit can retry. Deleting on success would let an intermediate
    // commit re-request a page whose result had not rendered yet.
    pendingPagesRef.current.add(page);
    void renderPagePreview(page)
      .then((url) => {
        if (sessionIdRef.current !== session) return;
        if (url) {
          setPreviews((prev) => (prev[page] ? prev : { ...prev, [page]: url }));
        } else {
          pendingPagesRef.current.delete(page);
        }
      })
      .catch(() => {
        if (sessionIdRef.current === session) pendingPagesRef.current.delete(page);
      });
  }, [open, sessionId, pageIndex, previews, previewDataUrl, renderPagePreview]);

  const goToPage = useCallback(
    (delta: number) => {
      setPageIndex((current) =>
        Math.min(Math.max(current + delta, 0), Math.max(pageCount - 1, 0))
      );
    },
    [pageCount]
  );

  if (!open) return null;

  const sourceParam = encodeURIComponent(checkoutSource);
  const currentPreview = previews[pageIndex] ?? (pageIndex === 0 ? previewDataUrl : null);
  const showPageNav = pageCount > 1;
  const usePricingV2 = pricingV2Enabled(process.env.NEXT_PUBLIC_QUICKFILL_PRICING_V2);

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
          <div className="relative flex h-56 items-center justify-center bg-white p-3 sm:h-80">
            {currentPreview ? (
              <img
                src={currentPreview}
                alt="Document preview"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div
                className="flex h-full w-full animate-pulse items-center justify-center rounded-xl bg-surface-alt"
                aria-label="Document preview loading"
              >
                <FileText className="h-10 w-10 text-text-muted" />
              </div>
            )}
            <PreviewWatermark />
          </div>
        </div>

        {showPageNav && (
          <div className="mx-6 mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToPage(-1)}
              disabled={pageIndex === 0}
              className="h-10 rounded-lg border border-border px-2.5 text-xs font-semibold text-text transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:px-4 sm:text-sm"
            >
              Previous
            </button>
            <span
              className="whitespace-nowrap text-xs font-medium text-text-muted sm:text-sm"
              aria-live="polite"
            >
              Page {pageIndex + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={pageIndex >= pageCount - 1}
              className="h-10 rounded-lg border border-border px-2.5 text-xs font-semibold text-text transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:px-4 sm:text-sm"
            >
              Next
            </button>
          </div>
        )}

        <p className="mx-6 mt-2 text-center text-xs text-text-muted">
          Preview only, unlock download to remove watermark.
        </p>

        {usePricingV2 ? (
          <PricingV2Content sourceParam={sourceParam} fileName={fileName} onClose={onClose} />
        ) : (
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
        )}
      </div>
    </div>
  );
}
