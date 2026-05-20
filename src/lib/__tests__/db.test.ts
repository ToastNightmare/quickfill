const mockTaggedSql = jest.fn();
const mockSqlQuery = jest.fn();
const mockNeon = jest.fn(() => {
  const sql = mockTaggedSql as unknown as typeof mockTaggedSql & { query: typeof mockSqlQuery };
  sql.query = mockSqlQuery;
  return sql;
});

describe("database helper", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.resetModules();
    mockTaggedSql.mockReset();
    mockSqlQuery.mockReset();
    mockNeon.mockClear();
    mockTaggedSql.mockResolvedValue([{ ok: 1 }]);
    mockSqlQuery.mockResolvedValue([]);
    globalThis.__quickfillNeonFactoryForTest = mockNeon;
    process.env.DATABASE_URL = "postgres://user:pass@example.neon.tech/db";
  });

  afterAll(() => {
    delete globalThis.__quickfillNeonFactoryForTest;

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("uses Neon's tagged-template API for database health checks and verifies core schema", async () => {
    const { checkDatabaseConnection } = await import("../db");

    await expect(checkDatabaseConnection()).resolves.toEqual({
      ok: true,
      configured: true,
      message: "Database connection and core schema are healthy",
    });

    expect(mockTaggedSql).toHaveBeenCalledTimes(1);
    expect(mockTaggedSql.mock.calls[0][0]).toEqual(["select 1 as ok"]);
    expect(mockSqlQuery.mock.calls[0][0]).toBe("create extension if not exists pgcrypto");
    expect(mockSqlQuery.mock.calls.some((call) => String(call[0]).includes("create table if not exists subscriptions"))).toBe(true);
  });

  it("keeps normal app queries on the Neon query helper after schema verification", async () => {
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([]);
    mockSqlQuery.mockResolvedValueOnce([{ id: "cus_123" }]);
    const { query } = await import("../db");

    await expect(query("select * from customers where id = $1", ["cus_123"])).resolves.toEqual([{ id: "cus_123" }]);

    expect(mockSqlQuery).toHaveBeenLastCalledWith("select * from customers where id = $1", ["cus_123"]);
    expect(mockTaggedSql).not.toHaveBeenCalled();
  });
});
