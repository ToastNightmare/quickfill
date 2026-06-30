"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, ImagePlus, LifeBuoy, Send, X } from "lucide-react";
import {
  SUPPORT_SCREENSHOT_MAX_BYTES,
  SUPPORT_SCREENSHOT_MAX_FILES,
  SUPPORT_SCREENSHOT_TOTAL_MAX_BYTES,
  SUPPORT_SCREENSHOT_TYPES,
  type SupportAttachment,
} from "@/lib/support-attachments";

type SupportCategory = "billing" | "account" | "pdf" | "bug" | "general";

const CATEGORY_OPTIONS: { value: SupportCategory; label: string }[] = [
  { value: "billing", label: "Billing" },
  { value: "account", label: "Account" },
  { value: "pdf", label: "PDF download issue" },
  { value: "bug", label: "Bug report" },
  { value: "general", label: "General" },
];

interface SupportFormProps {
  source: string;
  title?: string;
  description?: string;
  defaultCategory?: SupportCategory;
  defaultSubject?: string;
  defaultMessage?: string;
  compact?: boolean;
  onSent?: () => void;
}

type UsageContext = {
  used?: number;
  limit?: number | null;
  isPro?: boolean;
  tier?: string;
  degraded?: boolean;
  billing?: {
    status?: string | null;
    entitled?: boolean;
  } | null;
};

function usageContextLabel(usage: UsageContext | null) {
  if (!usage) return "";

  const tier = usage.tier || (usage.isPro ? "pro" : "free");
  const limit = typeof usage.limit === "number" && Number.isFinite(usage.limit) ? usage.limit : "unlimited";
  const used = typeof usage.used === "number" ? usage.used : "unknown";
  const plan = usage.isPro ? "pro" : tier;
  const billing = usage.billing?.status ? `billing=${usage.billing.status}` : "billing=unknown";

  return `plan=${plan}; tier=${tier}; usage=${used}/${limit}; ${billing}`;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function validateScreenshotFiles(files: File[]) {
  if (files.length > SUPPORT_SCREENSHOT_MAX_FILES) {
    return `Attach up to ${SUPPORT_SCREENSHOT_MAX_FILES} screenshots.`;
  }

  let totalBytes = 0;
  for (const file of files) {
    const contentType = file.type.toLowerCase();
    if (!SUPPORT_SCREENSHOT_TYPES.has(contentType)) return "Screenshots must be PNG, JPG, or WebP images.";
    if (file.size > SUPPORT_SCREENSHOT_MAX_BYTES) return "Each screenshot must be 5 MB or smaller.";
    totalBytes += file.size;
  }

  if (totalBytes > SUPPORT_SCREENSHOT_TOTAL_MAX_BYTES) return "Screenshots must be 10 MB total or smaller.";
  return "";
}

function imageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read screenshot."));
    image.src = url;
  });
}

async function sanitizeImageFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await imageFromUrl(objectUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return file;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.9));
    if (!blob) return file;

    const filename = outputType === file.type ? file.name : file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], filename, { type: outputType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function SupportForm({
  source,
  title = "Need help?",
  description = "Send a message to support and we will look into it.",
  defaultCategory = "general",
  defaultSubject = "",
  defaultMessage = "",
  compact = false,
  onSent,
}: SupportFormProps) {
  const { user } = useUser();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<SupportCategory>(defaultCategory);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [screenshotError, setScreenshotError] = useState("");
  const [company, setCompany] = useState("");
  const [usageContext, setUsageContext] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const fullName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ");
    const primaryEmail = user?.primaryEmailAddress?.emailAddress || "";
    if (fullName) setName(fullName);
    if (primaryEmail) setEmail(primaryEmail);
  }, [user]);

  useEffect(() => {
    setCategory(defaultCategory);
  }, [defaultCategory]);

  useEffect(() => {
    setSubject(defaultSubject);
  }, [defaultSubject]);

  useEffect(() => {
    setMessage(defaultMessage);
  }, [defaultMessage]);

  useEffect(() => {
    let cancelled = false;

    const loadUsage = async () => {
      try {
        const res = await fetch("/api/usage", { cache: "no-store" });
        if (!res.ok) return;
        const usage = (await res.json()) as UsageContext;
        if (!cancelled) setUsageContext(usageContextLabel(usage));
      } catch {
        if (!cancelled) setUsageContext("");
      }
    };

    void loadUsage();

    return () => {
      cancelled = true;
    };
  }, []);

  const sourceDetails = useMemo(() => {
    return [source, pathname ? `page=${pathname}` : "", usageContext]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 160);
  }, [pathname, source, usageContext]);

  function handleScreenshotChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    const validationError = validateScreenshotFiles(files);
    if (validationError) {
      setScreenshots([]);
      setScreenshotError(validationError);
      event.currentTarget.value = "";
      return;
    }

    setScreenshots(files);
    setScreenshotError("");
  }

  function removeScreenshot(index: number) {
    setScreenshots((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setScreenshotError("");
  }

  async function uploadScreenshots(): Promise<SupportAttachment[]> {
    if (screenshots.length === 0) return [];

    const sanitizedFiles = await Promise.all(screenshots.map(sanitizeImageFile));
    const validationError = validateScreenshotFiles(sanitizedFiles);
    if (validationError) throw new Error(validationError);

    const formData = new FormData();
    for (const file of sanitizedFiles) {
      formData.append("screenshots", file, file.name);
    }

    const response = await fetch("/api/support/attachments", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : "Could not upload screenshots.");
    }

    return Array.isArray(payload.attachments) ? (payload.attachments as SupportAttachment[]) : [];
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !message.trim()) {
      setError("Email and message are required.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setError("");
    setScreenshotError("");

    try {
      const attachments = await uploadScreenshots();
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          category,
          subject,
          message,
          attachments,
          source: sourceDetails,
          page: pathname,
          context: usageContext,
          company,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send support message.");
      setStatus("sent");
      setCompany("");
      setScreenshots([]);
      if (!defaultMessage) setMessage("");
      onSent?.();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Could not send support message.";
      setStatus("error");
      setError(nextError);
      if (/screenshot|upload|png|jpg|webp/i.test(nextError)) setScreenshotError(nextError);
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

      <div className="hidden" aria-hidden="true">
        <label>
          Company
          <input
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
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

      <div className="mt-3 grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
        <label className="block">
          <span className="text-xs font-semibold text-text-muted">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportCategory)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-muted">Subject</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
            placeholder="What can we help with?"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-muted">Message</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 min-h-28 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Tell us what happened."
        />
      </label>

      <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent">
            <ImagePlus className="h-4 w-4" />
            Attach screenshots
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleScreenshotChange}
              className="sr-only"
            />
          </label>
          <p className="text-xs text-text-muted">
            PNG, JPG, or WebP. Up to {SUPPORT_SCREENSHOT_MAX_FILES} images, {formatBytes(SUPPORT_SCREENSHOT_MAX_BYTES)} each.
          </p>
        </div>

        {screenshots.length > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {screenshots.map((file, index) => (
              <li key={`${file.name}-${file.size}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-text-muted">
                  {file.name} ({formatBytes(file.size)})
                </span>
                <button
                  type="button"
                  onClick={() => removeScreenshot(index)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-muted hover:text-text"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {screenshotError && <p className="mt-2 text-sm font-medium text-red-600">{screenshotError}</p>}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {status === "sent" ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {status === "sending" ? (screenshots.length > 0 ? "Uploading..." : "Sending...") : status === "sent" ? "Sent" : "Send message"}
        </button>
        {status === "sent" && <p className="text-sm font-medium text-emerald-600">Support request sent.</p>}
        {status === "error" && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    </form>
  );
}
