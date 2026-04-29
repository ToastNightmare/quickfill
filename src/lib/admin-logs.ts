import { getRedis } from "@/lib/redis";

export interface AdminDownloadLog {
  id: string;
  status: "success" | "failed" | "blocked";
  createdAt: string;
  userId?: string | null;
  guest?: boolean;
  filename?: string | null;
  fileSizeKb?: number;
  fieldCount?: number;
  pageCount?: number;
  hasAcroForm?: boolean;
  reason?: string | null;
  message?: string | null;
}

export interface AdminSupportMessage {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  userId?: string | null;
  source?: string | null;
  status: "new" | "open" | "closed";
}

const DOWNLOAD_LOG_KEY = "admin:download_logs";
const SUPPORT_KEY = "admin:support_messages";

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export async function recordDownloadLog(input: Omit<AdminDownloadLog, "id" | "createdAt">) {
  const entry: AdminDownloadLog = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: input.status,
    userId: cleanText(input.userId, 80) || null,
    guest: Boolean(input.guest),
    filename: cleanText(input.filename, 160) || null,
    fileSizeKb: cleanNumber(input.fileSizeKb),
    fieldCount: cleanNumber(input.fieldCount),
    pageCount: cleanNumber(input.pageCount),
    hasAcroForm: Boolean(input.hasAcroForm),
    reason: cleanText(input.reason, 120) || null,
    message: cleanText(input.message, 220) || null,
  };

  const redis = getRedis();
  await redis.lpush(DOWNLOAD_LOG_KEY, entry);
  await redis.ltrim(DOWNLOAD_LOG_KEY, 0, 299);
}

export async function getDownloadLogs(limit = 100) {
  return (await getRedis().lrange<AdminDownloadLog>(DOWNLOAD_LOG_KEY, 0, Math.max(0, limit - 1))) ?? [];
}

export async function recordSupportMessage(input: Omit<AdminSupportMessage, "id" | "createdAt" | "status">) {
  const entry: AdminSupportMessage = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: cleanText(input.name, 100) || "Unknown",
    email: cleanText(input.email, 160),
    subject: cleanText(input.subject, 140) || "Support request",
    message: cleanText(input.message, 2000),
    userId: cleanText(input.userId, 80) || null,
    source: cleanText(input.source, 80) || null,
    status: "new",
  };

  const redis = getRedis();
  await redis.lpush(SUPPORT_KEY, entry);
  await redis.ltrim(SUPPORT_KEY, 0, 299);
  return entry;
}

export async function getSupportMessages(limit = 100) {
  return (await getRedis().lrange<AdminSupportMessage>(SUPPORT_KEY, 0, Math.max(0, limit - 1))) ?? [];
}
