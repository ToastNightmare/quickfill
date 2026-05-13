const mockTaggedSql = jest.fn();
const mockSqlQuery = jest.fn();
const mockNeon = jest.fn(() => {
  const sql = mockTaggedSql as unknown as typeof mockTaggedSql & { query: typeof mockSqlQuery };
  sql.query = mockSqlQuery;
  return sql;
});

jest.mock("@neondatabase/serverless", () => ({
  neon: mockNeon,
}));

describe("database helper", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.resetModules();
    mockTaggedSql.mockReset();
    mockSqlQuery.mockReset();
    mockNeon.mockClear();
    process.env.DATABASE_URL = "postgres://user:pass@example.neon.tech/db";
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("uses Neon's tagged-template API for database health checks", async () => {
    mockTaggedSql.mockResolvedValue([{ ok: 1 }]);
    const { checkDatabaseConnection } = await import("../db");

    await expect(checkDatabaseConnection()).resolves.toEqual({
      ok: true,
      configured: true,
      message: "Database connection is healthy",
    });

    expect(mockTaggedSql).toHaveBeenCalledTimes(1);
    expect(mockTaggedSql.mock.calls[0][0]).toEqual(["select 1 as ok"]);
    expect(mockSqlQuery).not.toHaveBeenCalled();
  });

  it("keeps normal app queries on the Neon query helper", async () => {
    mockSqlQuery.mockResolvedValue([{ id: "cus_123" }]);
    const { query } = await import("../db");

    await expect(query("select * from customers where id = $1", ["cus_123"])).resolves.toEqual([{ id: "cus_123" }]);

    expect(mockSqlQuery).toHaveBeenCalledWith("select * from customers where id = $1", ["cus_123"]);
    expect(mockTaggedSql).not.toHaveBeenCalled();
  });
});
