export type UsageSnapshot = {
  used?: number;
  limit?: number;
  isPro?: boolean;
  tier?: string;
  guest?: boolean;
  qa?: boolean;
};

export async function loadUsageSnapshot(): Promise<UsageSnapshot | null> {
  try {
    const response = await fetch("/api/usage", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as UsageSnapshot;
  } catch {
    return null;
  }
}

export function isGuestUsage(usage: UsageSnapshot | null | undefined) {
  return usage?.guest === true || usage?.tier === "guest";
}

export function shouldTryBillingSync(usage: UsageSnapshot | null | undefined) {
  return Boolean(usage && !usage.isPro && !usage.qa && !isGuestUsage(usage));
}

export async function refreshUsageAfterBillingSync(fallback: UsageSnapshot) {
  try {
    await fetch("/api/billing/sync", { method: "POST", cache: "no-store" });
  } catch {
    // The server-side download path also has a billing refresh fallback.
  }

  return (await loadUsageSnapshot()) ?? fallback;
}

function previewResponseBody(buffer: ArrayBuffer) {
  const preview = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 500))).trim();
  if (!preview) return "Download failed before a PDF was created.";
  if (preview.startsWith("<")) return "Download failed before a PDF was created.";

  try {
    const parsed = JSON.parse(preview) as { error?: string; message?: string };
    return parsed.error || parsed.message || "Download failed before a PDF was created.";
  } catch {
    return preview;
  }
}

export function assertPdfDownload(response: Response, buffer: ArrayBuffer) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const signature = new TextDecoder().decode(buffer.slice(0, 5));
  const looksLikePdf = signature === "%PDF-";
  const hasWrongContentType = contentType.length > 0 && !contentType.includes("application/pdf");

  if (!looksLikePdf || hasWrongContentType) {
    throw new Error(previewResponseBody(buffer));
  }
}

export function downloadPdfBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
