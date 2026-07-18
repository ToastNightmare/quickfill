"use client";

import { useState, useMemo } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import type { AnalyticsEventName } from "@/lib/analytics-events";

interface InteractiveTimelineProps {
  events: {
    name: AnalyticsEventName;
    properties?: Record<string, string | number | boolean | null>;
    signedIn?: boolean;
    createdAt?: string;
  }[];
  loading: boolean;
}

const CATEGORY_MAP: Record<AnalyticsEventName, { category: string; dotClass: string }> = {
  landing_page_view: { category: "Acquisition", dotClass: "bg-blue-500" },
  home_cta_click: { category: "Acquisition", dotClass: "bg-blue-500" },
  template_start: { category: "Acquisition", dotClass: "bg-blue-500" },
  editor_upload_started: { category: "Editor", dotClass: "bg-purple-500" },
  editor_pdf_loaded: { category: "Editor", dotClass: "bg-purple-500" },
  field_added: { category: "Editor", dotClass: "bg-purple-500" },
  field_detection_used: { category: "Editor", dotClass: "bg-purple-500" },
  field_suggestion_lifecycle: { category: "Editor", dotClass: "bg-purple-500" },
  profile_autofill_used: { category: "Editor", dotClass: "bg-purple-500" },
  download_attempt: { category: "Downloads", dotClass: "bg-green-500" },
  download_success: { category: "Downloads", dotClass: "bg-green-500" },
  download_failed: { category: "Downloads", dotClass: "bg-red-500" },
  download_gate_shown: { category: "Conversion", dotClass: "bg-orange-500" },
  free_limit_hit: { category: "Conversion", dotClass: "bg-amber-500" },
  upgrade_prompted: { category: "Conversion", dotClass: "bg-orange-500" },
  checkout_start: { category: "Conversion", dotClass: "bg-amber-500" },
  checkout_cancelled: { category: "Conversion", dotClass: "bg-rose-500" },
  billing_portal_open: { category: "Conversion", dotClass: "bg-amber-500" },
  subscription_started: { category: "Conversion", dotClass: "bg-amber-500" },
  subscription_cancelled: { category: "Conversion", dotClass: "bg-rose-500" },
  subscription_updated: { category: "Conversion", dotClass: "bg-amber-500" },
};

const EVENT_LABELS: Record<AnalyticsEventName, string> = {
  landing_page_view: "Landing page view",
  home_cta_click: "Home CTA click",
  template_start: "Template start",
  editor_upload_started: "Upload started",
  editor_pdf_loaded: "PDF loaded",
  field_added: "Field added",
  field_detection_used: "Auto-detect used",
  field_suggestion_lifecycle: "Field suggestion lifecycle",
  profile_autofill_used: "Profile auto-fill",
  download_attempt: "Download attempt",
  download_success: "Download success",
  download_failed: "Download failed",
  download_gate_shown: "Download gate shown",
  free_limit_hit: "Free limit hit",
  upgrade_prompted: "Upgrade prompted",
  checkout_start: "Checkout start",
  checkout_cancelled: "Checkout cancelled",
  billing_portal_open: "Billing portal open",
  subscription_started: "Subscription started",
  subscription_cancelled: "Subscription cancelled",
  subscription_updated: "Subscription updated",
};

const CATEGORY_PILL_CLASSES: Record<string, string> = {
  Acquisition: "bg-blue-500/20 text-blue-300",
  Editor: "bg-purple-500/20 text-purple-300",
  Downloads: "bg-green-500/20 text-green-300",
  Conversion: "bg-amber-500/20 text-amber-300",
};

function getTimeGroup(createdAt?: string): string {
  if (!createdAt) return "Unknown";
  const diff = Date.now() - new Date(createdAt).getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 1) return "Last hour";
  if (hours < 24) return "Earlier today";
  if (hours < 48) return "Yesterday";
  return "Older";
}

function getRelativeTime(createdAt?: string): string {
  if (!createdAt) return "Just now";
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function InteractiveTimeline({ events, loading }: InteractiveTimelineProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [signInFilter, setSignInFilter] = useState<"all" | "signed_in" | "guest">("all");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(40);

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    return events.filter((event) => {
      const categoryMatch =
        activeCategory === "All" || CATEGORY_MAP[event.name]?.category === activeCategory;
      const signInMatch =
        signInFilter === "all" ||
        (signInFilter === "signed_in" && event.signedIn === true) ||
        (signInFilter === "guest" && event.signedIn !== true);
      return categoryMatch && signInMatch;
    });
  }, [events, activeCategory, signInFilter]);

  const categories = ["All", "Acquisition", "Editor", "Downloads", "Conversion"];
  const signInOptions = [
    { value: "all", label: "All" },
    { value: "signed_in", label: "Signed in" },
    { value: "guest", label: "Guest" },
  ];

  return (
    <section className="mt-6 rounded-lg border border-slate-700/50 bg-slate-800 p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-semibold">Interactive Timeline</h2>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Recent events with exact timestamps and property detail.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => cat !== activeCategory && setActiveCategory(cat)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                activeCategory === cat
                  ? cat === "All"
                    ? "bg-accent text-white"
                    : CATEGORY_PILL_CLASSES[cat]
                  : "bg-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {signInOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => signInFilter !== opt.value && setSignInFilter(opt.value as "all" | "signed_in" | "guest")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                signInFilter === opt.value
                  ? "bg-accent text-white"
                  : "bg-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 relative">
        {loading ? (
          <>
            <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-700" />
            <div className="ml-8 divide-y divide-slate-700/50">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-700 animate-pulse" />
                  <div className="h-3 w-32 rounded bg-slate-700 animate-pulse" />
                  <div className="h-3 w-16 rounded bg-slate-700 animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          </>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No events match the selected filters.
          </p>
        ) : (
          <>
            <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-700" />
            <div className="ml-8 divide-y divide-slate-700/50">
              {(() => {
                let lastGroup = "";
                return filtered.slice(0, visibleCount).map((event) => {
                  const group = getTimeGroup(event.createdAt);
                  const expandKey = (event.createdAt ?? "") + event.name;
                  const hasProperties =
                    event.properties &&
                    Object.values(event.properties).some((v) => v !== null);
                  const dotClass = CATEGORY_MAP[event.name]?.dotClass ?? "bg-slate-700";
                  const showGroupSeparator = group !== lastGroup;
                  lastGroup = group;

                  return (
                    <div key={expandKey}>
                      {showGroupSeparator && (
                        <div className="py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {group}
                        </div>
                      )}
                      <div className="relative py-3">
                        <div
                          className={`absolute -left-5 top-3.5 h-2.5 w-2.5 rounded-full ${dotClass}`}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {EVENT_LABELS[event.name]}
                          </span>
                          <span
                            className="text-xs text-text-muted"
                            title={
                              event.createdAt
                                ? new Date(event.createdAt).toLocaleString("en-AU")
                                : undefined
                            }
                          >
                            {getRelativeTime(event.createdAt)}
                          </span>
                          {event.signedIn === true ? (
                            <span className="rounded-full border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                              Signed in
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-600 bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                              Guest
                            </span>
                          )}
                          {hasProperties && (
                            <button
                              onClick={() => toggleExpand(expandKey)}
                              className="text-slate-400 hover:text-slate-200"
                            >
                              {expandedKeys.has(expandKey) ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                        {expandedKeys.has(expandKey) && (
                          <div className="ml-4 mt-2 mb-3 rounded-lg bg-slate-900 p-3">
                            {event.properties &&
                            Object.values(event.properties).some((v) => v !== null) ? (
                              Object.entries(event.properties)
                                .filter(([, value]) => value !== null)
                                .map(([key, value]) => (
                                  <div key={key} className="flex gap-2 text-xs">
                                    <span className="font-mono text-slate-500">{key}</span>
                                    <span>{String(value)}</span>
                                  </div>
                                ))
                            ) : (
                              <p className="text-xs text-slate-500">
                                No details available.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            {filtered.length > visibleCount && (
              <button
                onClick={() =>
                  setVisibleCount((c) => Math.min(c + 40, filtered.length))
                }
                className="mt-4 text-sm font-semibold text-blue-400 hover:text-blue-300 hover:underline"
              >
                Show more ({filtered.length - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
