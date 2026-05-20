type SqlQuery = (query: string, params?: unknown[]) => Promise<unknown[]>;
type SqlTaggedTemplate = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

type NeonClient = SqlTaggedTemplate & {
  query: SqlQuery;
};

type NeonFactory = (connectionString: string) => unknown;

let sqlPromise: Promise<NeonClient> | null = null;
let coreSchemaPromise: Promise<void> | null = null;

declare global {
  var __quickfillNeonFactoryForTest: NeonFactory | undefined;
}

const CORE_SCHEMA_QUERIES = [
  "create extension if not exists pgcrypto",
  `create table if not exists app_users (
    id uuid primary key default gen_random_uuid(),
    clerk_user_id text not null unique,
    email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id text not null unique,
    stripe_customer_id text,
    stripe_subscription_id text,
    tier text not null default 'free',
    status text not null default 'unknown',
    current_period_end timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists stripe_events (
    id uuid primary key default gen_random_uuid(),
    stripe_event_id text not null unique,
    event_type text not null,
    processed_at timestamptz not null default now()
  )`,
  `create table if not exists usage_events (
    id uuid primary key default gen_random_uuid(),
    user_id text,
    anonymous_id text,
    event_type text not null,
    quantity integer not null default 1,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists audit_events (
    id uuid primary key default gen_random_uuid(),
    user_id text,
    event_type text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`,
  "alter table app_users add column if not exists id uuid default gen_random_uuid()",
  "alter table app_users add column if not exists clerk_user_id text",
  "alter table app_users add column if not exists email text",
  "alter table app_users add column if not exists created_at timestamptz default now()",
  "alter table app_users add column if not exists updated_at timestamptz default now()",
  "alter table subscriptions add column if not exists id uuid default gen_random_uuid()",
  "alter table subscriptions add column if not exists user_id text",
  "alter table subscriptions add column if not exists stripe_customer_id text",
  "alter table subscriptions add column if not exists stripe_subscription_id text",
  "alter table subscriptions add column if not exists tier text default 'free'",
  "alter table subscriptions add column if not exists status text default 'unknown'",
  "alter table subscriptions add column if not exists current_period_end timestamptz",
  "alter table subscriptions add column if not exists created_at timestamptz default now()",
  "alter table subscriptions add column if not exists updated_at timestamptz default now()",
  "alter table stripe_events add column if not exists id uuid default gen_random_uuid()",
  "alter table stripe_events add column if not exists stripe_event_id text",
  "alter table stripe_events add column if not exists event_type text",
  "alter table stripe_events add column if not exists processed_at timestamptz default now()",
  "alter table usage_events add column if not exists id uuid default gen_random_uuid()",
  "alter table usage_events add column if not exists user_id text",
  "alter table usage_events add column if not exists anonymous_id text",
  "alter table usage_events add column if not exists event_type text",
  "alter table usage_events add column if not exists quantity integer default 1",
  "alter table usage_events add column if not exists metadata jsonb default '{}'::jsonb",
  "alter table usage_events add column if not exists created_at timestamptz default now()",
  "alter table audit_events add column if not exists id uuid default gen_random_uuid()",
  "alter table audit_events add column if not exists user_id text",
  "alter table audit_events add column if not exists event_type text",
  "alter table audit_events add column if not exists metadata jsonb default '{}'::jsonb",
  "alter table audit_events add column if not exists created_at timestamptz default now()",
  "alter table subscriptions alter column tier set default 'free'",
  "alter table subscriptions alter column status set default 'unknown'",
  "alter table usage_events alter column quantity set default 1",
  "alter table usage_events alter column metadata set default '{}'::jsonb",
  "alter table audit_events alter column metadata set default '{}'::jsonb",
  "create unique index if not exists app_users_clerk_user_id_unique_idx on app_users(clerk_user_id)",
  "create unique index if not exists subscriptions_user_id_unique_idx on subscriptions(user_id)",
  "create unique index if not exists stripe_events_stripe_event_id_unique_idx on stripe_events(stripe_event_id)",
  "create index if not exists subscriptions_customer_idx on subscriptions(stripe_customer_id)",
  "create index if not exists subscriptions_subscription_idx on subscriptions(stripe_subscription_id)",
  "create index if not exists usage_events_user_created_at_idx on usage_events(user_id, created_at desc)",
  "create index if not exists usage_events_event_created_at_idx on usage_events(event_type, created_at desc)",
  "create index if not exists audit_events_event_type_created_at_idx on audit_events(event_type, created_at desc)",
];

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function asNeonClient(client: unknown): NeonClient {
  return client as unknown as NeonClient;
}

async function loadNeonFactory(): Promise<NeonFactory> {
  if (globalThis.__quickfillNeonFactoryForTest) {
    return globalThis.__quickfillNeonFactoryForTest;
  }

  const { neon } = await import("@neondatabase/serverless");
  return neon as NeonFactory;
}

async function getSql(): Promise<NeonClient> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!sqlPromise) {
    sqlPromise = loadNeonFactory().then((createClient) => {
      return asNeonClient(createClient(process.env.DATABASE_URL!));
    });
  }

  return sqlPromise;
}

export async function ensureCoreDatabaseSchema() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!coreSchemaPromise) {
    coreSchemaPromise = (async () => {
      const sql = await getSql();
      for (const sqlText of CORE_SCHEMA_QUERIES) {
        await sql.query(sqlText);
      }
    })().catch((error) => {
      coreSchemaPromise = null;
      throw error;
    });
  }

  return coreSchemaPromise;
}

export async function query<T = Record<string, unknown>>(sqlText: string, params: unknown[] = []): Promise<T[]> {
  await ensureCoreDatabaseSchema();
  const sql = await getSql();
  return (await sql.query(sqlText, params)) as T[];
}

export async function checkDatabaseConnection() {
  if (!isDatabaseConfigured()) {
    return { ok: false, configured: false, message: "DATABASE_URL is not configured" };
  }

  try {
    const sql = await getSql();
    await sql`select 1 as ok`;
    await ensureCoreDatabaseSchema();
    return { ok: true, configured: true, message: "Database connection and core schema are healthy" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return { ok: false, configured: true, message };
  }
}
