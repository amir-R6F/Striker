import type { Database } from "sql.js";
import { GENERATED_MIGRATIONS } from "./migrations.generated";

export interface BrowserMigration {
  name: string;
  sql: string;
}

/**
 * Prefers numbered .sql files when the Rust side keeps migrations on disk;
 * Striker currently defines them inline, so the committed generated snapshot is
 * used. Sorting by filename keeps numeric prefixes authoritative.
 */
const sqlFiles = import.meta.glob("../../../src-tauri/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const fileMigrations: BrowserMigration[] = Object.keys(sqlFiles)
  .sort((left, right) => left.localeCompare(right))
  .map((path) => ({
    name: path.split("/").pop() ?? path,
    sql: sqlFiles[path],
  }));

export const MIGRATIONS: BrowserMigration[] =
  fileMigrations.length > 0 ? fileMigrations : GENERATED_MIGRATIONS;

const MIGRATION_TABLE = "__mock_migrations";

export function runMigrations(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );

  const applied = new Set<string>();
  const rows = db.exec(`SELECT name FROM ${MIGRATION_TABLE}`);
  for (const row of rows[0]?.values ?? []) {
    if (typeof row[0] === "string") applied.add(row[0]);
  }

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    try {
      db.run(migration.sql);
      db.run(`INSERT INTO ${MIGRATION_TABLE} (name) VALUES (?)`, [
        migration.name,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Browser migration "${migration.name}" failed: ${message}`,
      );
    }
  }
}
