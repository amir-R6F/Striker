import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/**
 * Minimal stand-in for `@tauri-apps/plugin-sql` used by the DB suite. It runs
 * the real migration SQL extracted from `src-tauri/src/lib.rs` against an
 * in-memory SQLite database, then converts `$1` placeholders to `?`.
 */

function migrationStatements(): string[] {
  const source = readFileSync(
    fileURLToPath(new URL("../../src-tauri/src/lib.rs", import.meta.url)),
    "utf8",
  );
  const statements: string[] = [];
  const pattern = /sql:\s*"((?:[^"\\]|\\.)*)"/g;
  for (const match of source.matchAll(pattern)) {
    statements.push(
      match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\"),
    );
  }
  return statements;
}

let shared: DatabaseSync | null = null;

function database(): DatabaseSync {
  if (shared) return shared;
  shared = new DatabaseSync(":memory:");
  shared.exec("PRAGMA foreign_keys = ON;");
  const statements = migrationStatements();
  if (statements.length < 40) {
    throw new Error(
      `Expected at least 40 migrations, found ${statements.length}. The extraction regex may be stale.`,
    );
  }
  for (const statement of statements) {
    shared.exec(statement);
  }
  return shared;
}

function rewrite(
  query: string,
  params: unknown[],
): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const text = query.replace(/\$(\d+)/g, (_match, index: string) => {
    values.push(params[Number(index) - 1]);
    return "?";
  });
  return { text, values };
}

class ShimDatabase {
  async select<T>(query: string, params: unknown[] = []): Promise<T> {
    const { text, values } = rewrite(query, params);
    const statement = database().prepare(text);
    return statement.all(...(values as never[])) as T;
  }

  async execute(
    query: string,
    params: unknown[] = [],
  ): Promise<{ lastInsertId: number; rowsAffected: number }> {
    const { text, values } = rewrite(query, params);
    const statement = database().prepare(text);
    const result = statement.run(...(values as never[]));
    return {
      lastInsertId: Number(result.lastInsertRowid ?? 0),
      rowsAffected: Number(result.changes ?? 0),
    };
  }

  async close(): Promise<void> {
    // The in-memory database lives for the whole test file.
  }
}

export default class Database {
  static async load(_url: string): Promise<ShimDatabase> {
    database();
    return new ShimDatabase();
  }

  static async get(_url: string): Promise<ShimDatabase> {
    database();
    return new ShimDatabase();
  }
}

const TABLES = [
  "flashcards",
  "milestone_entries",
  "milestones",
  "entry_evidence",
  "entry_skill_nodes",
  "entry_skills",
  "weekly_reviews",
  "entries",
  "skill_nodes",
  "skill_trees",
  "skills",
  "goals",
];

/** Clears user data so each test starts from the migrated schema. */
export function resetTestDatabase(): void {
  const db = database();
  for (const table of TABLES) {
    db.exec(`DELETE FROM ${table};`);
  }
  db.exec("DELETE FROM settings;");
}

/** Raw access for assertions that should not go through db.ts. */
export function testDatabase(): DatabaseSync {
  return database();
}

export function migrationSql(): string[] {
  return migrationStatements();
}
