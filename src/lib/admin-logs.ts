import { query } from "@/lib/db";
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

export type AdminSupportStatus = "new" | "open" | "closed";
export type AdminSupportPriority = "low" | "normal" | "high" | "urgent";
export type AdminSupportCategory = "general" | "pdf" | "billing" | "account" | "bug";

export interface AdminSupportMessage {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  userId?: string | null;
  source?: string | null;
  status: AdminSupportStatus;
  priority: AdminSupportPriority;
  category: AdminSupportCategory;
}

type SupportMessageInput = Omit<
  AdminSupportMessage,
  "id" | "createdAt" | "updatedAt" | "status" | "priority" | "category"
> & {
  priority?: AdminSupportPriority;
  category?: AdminSupportCategory;
};

type SupportMessageRow = {
  id: string;
  created_at: string | Date;
  updated_at: string | Date;
  name: string;
  email: string;
  subject: string;
  message: string;
  user_id: string | null;
  source: string | null;
  status: string;
  priority: string;
  category: string;
};

const DOWNLOAD_LOG_KEY = "admin:download_logs";
const LEGACY_SUPPORT_KEY = "admin:support_messages";
const SUPPORT_STATUSES = new Set<AdminSupportStatus>(["new", "open", "closed"]);
const SUPPORT_PRIORITIES = new Set<AdminSupportPriority>(["low", "normal", "high", "urgent"]);
const SUPPORT_CATEGORIES = new Set<AdminSupportCategory>(["general", "pdf", "billing", "account", "bug"]);

let supportSchemaPromise: Promise<void> | null = null;

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function cleanSupportStatus(value: unknown): AdminSupportStatus {
  return typeof value === "string" && SUPPORT_STATUSES.has(value as AdminSupportStatus)
    ? (value as AdminSupportStatus)
    : "new";
}

function cleanSupportPriority(value: unknown): AdminSupportPriority {
  return typeof value === "string" && SUPPORT_PRIORITIES.has(value as AdminSupportPriority)
    ? (value as AdminSupportPriority)
    : "normal";
}

function cleanSupportCategory(value: unknown): AdminSupportCategory {
  return typeof value === "string" && SUPPORT_CATEGORIES.has(value as AdminSupportCategory)
    ? (value as AdminSupportCategory)
    : "general";
}

function toIsoDate(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeSupportMessage(message: Partial<AdminSupportMessage>): AdminSupportMessage {
  return {
    id: cleanText(message.id, 120),
    createdAt: message.createdAt ? toIsoDate(message.createdAt) : new Date().toISOString(),
    updatedAt: message.updatedAt ? toIsoDate(message.updatedAt) : message.createdAt ? toIsoDate(message.createdAt) : new Date().toISOString(),
    name: cleanText(message.name, 100) || "Unknown",
    email: cleanText(message.email, 160),
    subject: cleanText(message.subject, 140) || "Support request",
    message: cleanText(message.message, 2000),
    userId: cleanText(message.userId, 80) || null,
    source: cleanText(message.source, 160) || null,
    status: cleanSupportStatus(message.status),
    priority: cleanSupportPriority(message.priority),
    category: cleanSupportCategory(message.category),
  };
}

function mapSupportRow(row: SupportMessageRow): AdminSupportMessage {
  return {
    id: String(row.id),
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    userId: row.user_id,
    source: row.source,
    status: cleanSupportStatus(row.status),
    priority: cleanSupportPriority(row.priority),
    category: cleanSupportCategory(row.category),
  };
}

async function ensureSupportMessagesTable() {
  if (!supportSchemaPromise) {
    supportSchemaPromise = (async () => {
      await query("create extension if not exists pgcrypto");
      await query(`
        create table if not exists support_messages (
          id uuid primary key default gen_random_uuid(),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          name text not null,
          email text not null,
          subject text not null,
          message text not null,
          user_id text,
          source text,
          status text not null default 'new',
          priority text not null default 'normal',
          category text not null default 'general'
        )
      `);
      await query(
        "create index if not exists support_messages_status_created_at_idx on support_messages(status, created_at desc)",
      );
      await query(
        "create index if not exists support_messages_email_created_at_idx on support_messages(email, created_at desc)",
      );
      await query(
        "create index if not exists support_messages_user_created_at_idx on support_messages(user_id, created_at desc)",
      );
    })().catch((error) => {
      supportSchemaPromise = null;
      throw error;
    });
  }

  return supportSchemaPromise;
}

async function getLegacySupportMessages(limit = 100) {
  try {
    const messages =
      (await getRedis().lrange<Partial<AdminSupportMessage>>(LEGACY_SUPPORT_KEY, 0, Math.max(0, limit - 1))) ?? [];
    return messages.map(normalizeSupportMessage).filter((message) => message.id);
  } catch {
    return [];
  }
}

async function updateLegacySupportMessageStatus(id: string, status: AdminSupportStatus) {
  const redis = getRedis();
  const messages = await getLegacySupportMessages(300);
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) return null;

  const updated: AdminSupportMessage = {
    ...messages[index],
    status,
    updatedAt: new Date().toISOString(),
  };

  await redis.lset(LEGACY_SUPPORT_KEY, index, updated);
  return updated;
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

export async function recordSupportMessage(input: SupportMessageInput) {
  await ensureSupportMessagesTable();

  const priority = cleanSupportPriority(input.priority);
  const category = cleanSupportCategory(input.category);
  const rows = await query<SupportMessageRow>(
    `
      insert into support_messages (name, email, subject, message, user_id, source, status, priority, category)
      values ($1, $2, $3, $4, $5, $6, 'new', $7, $8)
      returning id, created_at, updated_at, name, email, subject, message, user_id, source, status, priority, category
    `,
    [
      cleanText(input.name, 100) || "Unknown",
      cleanText(input.email, 160),
      cleanText(input.subject, 140) || "Support request",
      cleanText(input.message, 2000),
      cleanText(input.userId, 80) || null,
      cleanText(input.source, 160) || null,
      priority,
      category,
    ],
  );

  return mapSupportRow(rows[0]);
}

export async function getSupportMessages(limit = 100) {
  await ensureSupportMessagesTable();

  const cappedLimit = Math.min(Math.max(1, limit), 500);
  const rows = await query<SupportMessageRow>(
    `
      select id, created_at, updated_at, name, email, subject, message, user_id, source, status, priority, category
      from support_messages
      order by
        case status when 'new' then 0 when 'open' then 1 else 2 end,
        created_at desc
      limit $1
    `,
    [cappedLimit],
  );

  const legacyMessages = await getLegacySupportMessages(Math.max(0, cappedLimit - rows.length));
  return [...rows.map(mapSupportRow), ...legacyMessages].slice(0, cappedLimit);
}

export async function updateSupportMessageStatus(id: string, status: AdminSupportStatus) {
  const cleanId = cleanText(id, 120);
  const cleanStatus = cleanSupportStatus(status);
  if (!cleanId) return null;

  await ensureSupportMessagesTable();
  const rows = await query<SupportMessageRow>(
    `
      update support_messages
      set status = $2, updated_at = now()
      where id::text = $1
      returning id, created_at, updated_at, name, email, subject, message, user_id, source, status, priority, category
    `,
    [cleanId, cleanStatus],
  );

  if (rows[0]) return mapSupportRow(rows[0]);
  return updateLegacySupportMessageStatus(cleanId, cleanStatus);
}
