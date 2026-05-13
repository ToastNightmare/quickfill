import { neon } from "@neondatabase/serverless";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const migrationsDir = path.join(root, "db/migrations");
const migrationFiles = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

const sql = neon(process.env.DATABASE_URL);
let statementCount = 0;

for (const file of migrationFiles) {
  const migration = await readFile(path.join(migrationsDir, file), "utf8");
  const statements = migration
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql(`${statement};`);
    statementCount += 1;
  }

  console.log(`Applied ${file} (${statements.length} statements)`);
}

console.log(`QuickFill database migrations applied (${migrationFiles.length} files, ${statementCount} statements)`);
