import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const migration = await readFile(path.join(root, "db/migrations/0001_foundation.sql"), "utf8");
const statements = migration
  .split(/;\s*\n/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const sql = neon(process.env.DATABASE_URL);
for (const statement of statements) {
  await sql(`${statement};`);
}

console.log(`QuickFill database migration applied (${statements.length} statements)`);
