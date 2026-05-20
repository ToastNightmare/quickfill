import { query } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { cleanSupportAttachments, type SupportAttachment } from "@/lib/support-attachments";

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
export type AdminSupportStatusFilter = AdminSupportStatus | "all";

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
  attachments: SupportAttachment[];
  assignee?: string | null;
  internalNotes: string;
  lastReplyAt?: string | null;
}

export interface AdminSupportMessageFilters {
  limit?: number;
  offset?: number;
  status?: AdminSupportStatusFilter;
  search?: string;
}

export interface AdminSupportMessagePage {
  messages: AdminSupportMessage[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminSupportMessagePatch {
  status?: AdminSupportStatus;
  assignee?: string | null;
  internalNotes?: string;
  replySent?: boolean;
}

export interface AdminSupportQueueHealth {
  status: "ok" | "warn" | "fail";
  message: string;
  newCount: number;
  openCount: number;
  unresolvedCount: number;
  unassignedCount: number;
  staleCount: number;
  staleHours: number;
  oldestUnresolvedAt: string | null;
  oldestUnresolvedHours: number | null;
}

type SupportMessageInput = Omit<
  AdminSupportMessage,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "status"
  | "priority"
  | "category"
  | "attachments"
  | "assignee"
  | "internalNotes"
  | "lastReplyAt"
> & {
  priority?: AdminSupportPriority;
  category?: AdminSupportCategory;
  attachments?: SupportAttachment[];
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
  attachments?: unknown;
  assignee?: string | null;
  internal_notes?: string | null;
  last_reply_at?: string | Date | null;
};

type SupportQueueHealthRow = {
  new_count: number | string;
  open_count: number | string;
  unresolved_count: number | string;
  unassigned_count: number | string;
  stale_count: number | string;
  oldest_unresolved_at: string | Date | null;
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

function cleanLongText(value: unknown, max = 4000) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
    .trim()
    .slice(0, max);
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

function cleanSupportStatusFilter(value: unknown): AdminSupportStatusFilter {
  if (value === "all" || value === undefined || value === null || value === "") return "all";
  return cleanSupportStatus(value);
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

function cleanLimit(value: unknown) {
  const next = Number(value ?? 100);
  return Math.min(Math.max(Number.isFinite(next) ? Math.trunc(next) : 100, 1), 100);
}

function cleanOffset(value: unknown) {
  const next = Number(value ?? 0);
  return Math.max(Number.isFinite(next) ? Math.trunc(next) : 0, 0);
}

function parseCount(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function toIsoDate(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIsoDate(value: string | Date | null | undefined) {
  return value ? toIsoDate(value) : null;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeSupportMessage(message: Partial<AdminSupportMessage>): AdminSupportMessage {
  return {
    id: cleanText(message.id, 120),
    createdAt: message.createdAt ? toIsoDate(message.createdAt) : new Date().toISOString(),
    updatedAt: message.updatedAt ? toIsoDate(message.updatedAt) : message.createdAt ? toIsoDate(message.createdAt) : new Date().toISOString(),
    name: cleanText(message.name, 100) || "Unknown",
    email: cleanText(message.email, 160),
    subject: cleanText(message.subject, 140) || "Support request",
    message: cleanLongText(message.message, 2000),
    userId: cleanText(message.userId, 80) || null,
    source: cleanText(message.source, 160) || null,
    status: cleanSupportStatus(message.status),
    priority: cleanSupportPriority(message.priority),
    category: cleanSupportCategory(message.category),
    attachments: cleanSupportAttachments(message.attachments),
    assignee: cleanText(message.assignee, 120) || null,
    internalNotes: cleanLongText(message.internalNotes, 4000),
    lastReplyAt: message.lastReplyAt ? toIsoDate(message.lastReplyAt) : null,
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
    attachments: cleanSupportAttachments(row.attachments),
    assignee: cleanText(row.assignee, 120) || null,
    internalNotes: cleanLongText(row.internal_notes, 4000),
    lastReplyAt: nullableIsoDate(row.last_reply_at),
  };
}

function supportWhere(filters: AdminSupportMessageFilters) {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const status = cleanSupportStatusFilter(filters.status);
  const search = cleanText(filters.search, 120);

  if (status !== "all") {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    clauses.push(
      `(name ilike $${index} or email ilike $${index} or subject ilike $${index} or message ilike $${index} or assignee ilike $${index} or internal_notes ilike $${index})`,
    );
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(" and ")}` : "",
    params,
    search,
    status,
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
          category text not null default 'general',
          attachments jsonb not null default '[]'::jsonb
        )
      `);
      await query("alter table support_messages add column if not exists assignee text");
      await query("alter table support_messages add column if not exists internal_notes text not null default ''");
      await query("alter table support_messages add column if not exists last_reply_at timestamptz");
      await query("alter table support_messages add column if not exists attachments jsonb not null default '[]'::jsonb");
      await query(
        "create index if not exists support_messages_status_created_at_idx on support_messages(status, created_at desc)",
      );
      await query(
        "create index if not exists support_messages_email_created_at_idx on support_messages(email, created_at desc)",
      );
      await query(
        "create index if not exists support_messages_user_created_at_idx on support_messages(user_id, created_at desc)",
      );
      await query(
        "create index if not exists support_messages_assignee_status_idx on support_messages(assignee, status, updated_at desc)",
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
  const attachments = cleanSupportAttachments(input.attachments);
  const rows = await query<SupportMessageRow>(
    `
      insert into support_messages (name, email, subject, message, user_id, source, status, priority, category, attachments)
      values ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9::jsonb)
      returning id, created_at, updated_at, name, email, subject, message, user_id, source, status, priority, category,
        attachments, assignee, internal_notes, last_reply_at
    `,
    [
      cleanText(input.name, 100) || "Unknown",
      cleanText(input.email, 160),
      cleanText(input.subject, 140) || "Support request",
      cleanLongText(input.message, 2000),
      cleanText(input.userId, 80) || null,
      cleanText(input.source, 160) || null,
      priority,
      category,
      JSON.stringify(attachments),
    ],
  );

  return mapSupportRow(rows[0]);
}

export async function getSupportMessagePage(filters: AdminSupportMessageFilters = {}): Promise<AdminSupportMessagePage> {
  await ensureSupportMessagesTable();

  const limit = cleanLimit(filters.limit);
  const offset = cleanOffset(filters.offset);
  const { whereSql, params, search, status } = supportWhere(filters);
  const includeLegacyMessages = offset === 0 && !search && status === "all";

  const countRows = await query<{ count: number | string }>(
    `select count(*)::int as count from support_messages ${whereSql}`,
    params,
  );
  const totalFromDatabase = parseCount(countRows[0]?.count);

  const rows = await query<SupportMessageRow>(
    `
      select id, created_at, updated_at, name, email, subject, message, user_id, source, status, priority, category,
        attachments, assignee, internal_notes, last_reply_at
      from support_messages
      ${whereSql}
      order by
        case status when 'new' then 0 when 'open' then 1 else 2 end,
        created_at desc
      limit $${params.length + 1}
      offset $${params.length + 2}
    `,
    [...params, limit, offset],
  );

  const messages = rows.map(mapSupportRow);
  const legacyMessages = includeLegacyMessages ? await getLegacySupportMessages(Math.max(0, limit - messages.length)) : [];
  const visibleMessages = [...messages, ...legacyMessages].slice(0, limit);

  return {
    messages: visibleMessages,
    total: totalFromDatabase + (includeLegacyMessages ? legacyMessages.length : 0),
    limit,
    offset,
  };
}

export async function getSupportMessages(limit = 100) {
  const page = await getSupportMessagePage({ limit });
  return page.messages;
}

export async function getSupportQueueHealth(options: { staleHours?: number; warnAt?: number; failAt?: number } = {}): Promise<AdminSupportQueueHealth> {
  await ensureSupportMessagesTable();

  const staleHours = Math.max(1, Math.trunc(options.staleHours ?? 24));
  const warnAt = Math.max(1, Math.trunc(options.warnAt ?? 25));
  const failAt = Math.max(warnAt + 1, Math.trunc(options.failAt ?? 100));
  const rows = await query<SupportQueueHealthRow>(
    `
      select
        count(*) filter (where status = 'new')::int as new_count,
        count(*) filter (where status = 'open')::int as open_count,
        count(*) filter (where status <> 'closed')::int as unresolved_count,
        count(*) filter (where status <> 'closed' and assignee is null)::int as unassigned_count,
        count(*) filter (where status <> 'closed' and created_at < now() - make_interval(hours => $1::int))::int as stale_count,
        min(created_at) filter (where status <> 'closed') as oldest_unresolved_at
      from support_messages
    `,
    [staleHours],
  );

  const row = rows[0];
  const newCount = parseCount(row?.new_count);
  const openCount = parseCount(row?.open_count);
  const unresolvedCount = parseCount(row?.unresolved_count);
  const unassignedCount = parseCount(row?.unassigned_count);
  const staleCount = parseCount(row?.stale_count);
  const oldestUnresolvedAt = nullableIsoDate(row?.oldest_unresolved_at);
  const oldestUnresolvedDate = oldestUnresolvedAt ? new Date(oldestUnresolvedAt) : null;
  const oldestUnresolvedHours =
    oldestUnresolvedDate && !Number.isNaN(oldestUnresolvedDate.getTime())
      ? Math.max(0, Math.round((Date.now() - oldestUnresolvedDate.getTime()) / (60 * 60 * 1000)))
      : null;

  const status: AdminSupportQueueHealth["status"] =
    unresolvedCount >= failAt ? "fail" : unresolvedCount >= warnAt || staleCount > 0 ? "warn" : "ok";
  const message =
    unresolvedCount === 0
      ? "No unresolved support requests."
      : staleCount > 0
        ? `${pluralize(unresolvedCount, "unresolved request")} with ${pluralize(staleCount, "request")} older than ${staleHours} hours.`
        : `${pluralize(unresolvedCount, "unresolved support request")} in the queue.`;

  return {
    status,
    message,
    newCount,
    openCount,
    unresolvedCount,
    unassignedCount,
    staleCount,
    staleHours,
    oldestUnresolvedAt,
    oldestUnresolvedHours,
  };
}

export async function updateSupportMessageStatus(id: string, status: AdminSupportStatus) {
  return updateSupportMessage(id, { status });
}

export async function updateSupportMessage(id: string, patch: AdminSupportMessagePatch) {
  const cleanId = cleanText(id, 120);
  if (!cleanId) return null;

  const hasStatus = typeof patch.status === "string" && SUPPORT_STATUSES.has(patch.status);
  const hasAssignee = Object.prototype.hasOwnProperty.call(patch, "assignee");
  const hasInternalNotes = typeof patch.internalNotes === "string";
  const replySent = Boolean(patch.replySent);

  if (!hasStatus && !hasAssignee && !hasInternalNotes && !replySent) return null;

  await ensureSupportMessagesTable();

  const updates: string[] = [];
  const params: unknown[] = [cleanId];

  if (hasStatus) {
    params.push(patch.status);
    updates.push(`status = $${params.length}`);
  } else if (replySent) {
    updates.push("status = case when status = 'closed' then status else 'open' end");
  }

  if (hasAssignee) {
    params.push(cleanText(patch.assignee, 120) || null);
    updates.push(`assignee = $${params.length}`);
  }

  if (hasInternalNotes) {
    params.push(cleanLongText(patch.internalNotes, 4000));
    updates.push(`internal_notes = $${params.length}`);
  }

  if (replySent) {
    updates.push("last_reply_at = now()");
  }

  updates.push("updated_at = now()");

  const rows = await query<SupportMessageRow>(
    `
      update support_messages
      set ${updates.join(", ")}
      where id::text = $1
      returning id, created_at, updated_at, name, email, subject, message, user_id, source, status, priority, category,
        attachments, assignee, internal_notes, last_reply_at
    `,
    params,
  );

  if (rows[0]) return mapSupportRow(rows[0]);

  if (hasStatus) {
    return updateLegacySupportMessageStatus(cleanId, patch.status as AdminSupportStatus);
  }

  return null;
}
