export const SUPPORT_SCREENSHOT_MAX_FILES = 3;
export const SUPPORT_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_SCREENSHOT_TOTAL_MAX_BYTES = 10 * 1024 * 1024;

export const SUPPORT_SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface SupportAttachment {
  id: string;
  filename: string;
  pathname: string;
  url?: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export function cleanAttachmentFilename(value: unknown, fallback = "screenshot") {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

export function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export function isAllowedSupportScreenshotType(contentType: string) {
  return SUPPORT_SCREENSHOT_TYPES.has(contentType.toLowerCase());
}

function cleanText(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function cleanSize(value: unknown) {
  const size = Number(value ?? 0);
  return Number.isFinite(size) && size > 0 ? Math.trunc(size) : 0;
}

export function cleanSupportAttachment(value: unknown): SupportAttachment | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const id = cleanText(input.id, 80);
  const filename = cleanAttachmentFilename(input.filename, "screenshot");
  const pathname = cleanText(input.pathname, 220);
  const url = cleanText(input.url, 500);
  const contentType = cleanText(input.contentType, 80).toLowerCase();
  const size = cleanSize(input.size);
  const uploadedAt = cleanText(input.uploadedAt, 80) || new Date().toISOString();

  if (!id || !pathname || !isAllowedSupportScreenshotType(contentType) || size <= 0 || size > SUPPORT_SCREENSHOT_MAX_BYTES) {
    return null;
  }

  return {
    id,
    filename,
    pathname,
    url: url || undefined,
    contentType,
    size,
    uploadedAt,
  };
}

export function cleanSupportAttachments(value: unknown): SupportAttachment[] {
  if (!Array.isArray(value)) return [];

  const attachments: SupportAttachment[] = [];
  let totalBytes = 0;

  for (const item of value) {
    if (attachments.length >= SUPPORT_SCREENSHOT_MAX_FILES) break;
    const attachment = cleanSupportAttachment(item);
    if (!attachment) continue;
    if (totalBytes + attachment.size > SUPPORT_SCREENSHOT_TOTAL_MAX_BYTES) break;
    attachments.push(attachment);
    totalBytes += attachment.size;
  }

  return attachments;
}
