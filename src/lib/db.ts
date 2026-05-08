type SqlQuery = (query: string, params?: unknown[]) => Promise<unknown[]>;

let sqlPromise: Promise<SqlQuery> | null = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

async function getSql(): Promise<SqlQuery> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!sqlPromise) {
    sqlPromise = import("@neondatabase/serverless").then(({ neon }) => neon(process.env.DATABASE_URL!) as SqlQuery);
  }

  return sqlPromise;
}

export async function query<T = Record<string, unknown>>(sqlText: string, params: unknown[] = []): Promise<T[]> {
  const sql = await getSql();
  return (await sql(sqlText, params)) as T[];
}

export async function checkDatabaseConnection() {
  if (!isDatabaseConfigured()) {
    return { ok: false, configured: false, message: "DATABASE_URL is not configured" };
  }

  try {
    await query("select 1 as ok");
    return { ok: true, configured: true, message: "Database connection is healthy" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return { ok: false, configured: true, message };
  }
}
