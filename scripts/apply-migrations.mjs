import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const migration = await readFile(path.join(root, "db/migrations/0001_foundation.sql"), "utf8");
const sql = neon(process.env.DATABASE_URL);
await sql(migration);
console.log("QuickFill database migration applied");
