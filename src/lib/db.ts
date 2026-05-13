type SqlQuery = (query: string, params?: unknown[]) => Promise<unknown[]>;
type SqlTaggedTemplate = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

type NeonClient = SqlTaggedTemplate & {
  query: SqlQuery;
};

type NeonFactory = (connectionString: string) => unknown;

let sqlPromise: Promise<NeonClient> | null = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function asNeonClient(client: unknown): NeonClient {
  return client as unknown as NeonClient;
}

async function getSql(): Promise<NeonClient> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!sqlPromise) {
    sqlPromise = import("@neondatabase/serverless").then(({ neon }) => {
      const createClient = neon as unknown as NeonFactory;
      return asNeonClient(createClient(process.env.DATABASE_URL!));
    });
  }

  return sqlPromise;
}

export async function query<T = Record<string, unknown>>(sqlText: string, params: unknown[] = []): Promise<T[]> {
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
    return { ok: true, configured: true, message: "Database connection is healthy" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return { ok: false, configured: true, message };
  }
}
