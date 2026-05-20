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

  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{ neon: unknown }>;
  const { neon } = await dynamicImport("@neondatabase/serverless");
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
