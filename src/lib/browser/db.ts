import type {
  BindParams,
  Database as SqlJsDatabaseType,
  SqlValue,
} from "sql.js";
import { runMigrations } from "./migrations";
import {
  getDatabase,
  noteSqlForTransaction,
  persist,
} from "./sqljs";

function normalizeParams(values?: unknown[]): BindParams {
  if (!values || values.length === 0) return [];
  return values.map((value): SqlValue => {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number" || typeof value === "string") return value;
    if (value instanceof Uint8Array) return value;
    return String(value);
  });
}

function rowsToObjects<T>(database: SqlJsDatabaseType, sql: string, params: BindParams): T[] {
  const results = database.exec(sql, params);
  if (results.length === 0) return [];
  const { columns, values } = results[0];
  return values.map((row) => {
    const record: Record<string, SqlValue> = {};
    columns.forEach((column, index) => {
      record[column] = row[index] ?? null;
    });
    return record as T;
  });
}

let migrationsRan = false;

/**
 * Drop-in replacement for `@tauri-apps/plugin-sql`'s Database, backed by the
 * shared sql.js connection. Only resolved by Vite in non-Tauri builds.
 */
export default class Database {
  private constructor(private readonly connection: SqlJsDatabaseType) {}

  static async load(_path: string): Promise<Database> {
    const connection = await getDatabase();
    if (!migrationsRan) {
      runMigrations(connection);
      migrationsRan = true;
    }
    return new Database(connection);
  }

  async execute(
    query: string,
    values?: unknown[],
  ): Promise<{ rowsAffected: number; lastInsertId?: number }> {
    const params = normalizeParams(values);
    noteSqlForTransaction(query);

    try {
      this.connection.run(query, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/returns data|not a statement that returns data/i.test(message)) {
        throw error;
      }
      // INSERT ... RETURNING and similar need exec(); data is still written.
      this.connection.exec(query, params);
    }

    const rowsAffected = this.connection.getRowsModified();
    let lastInsertId: number | undefined;
    try {
      const result = this.connection.exec(
        "SELECT last_insert_rowid() AS id",
      );
      const value = result[0]?.values[0]?.[0];
      if (typeof value === "number" && Number.isFinite(value)) {
        lastInsertId = value;
      }
    } catch {
      lastInsertId = undefined;
    }

    persist();
    return { rowsAffected, lastInsertId };
  }

  async select<T>(query: string, values?: unknown[]): Promise<T> {
    const params = normalizeParams(values);
    const rows = rowsToObjects(this.connection, query, params);
    return rows as T;
  }

  async close(): Promise<void> {
    // The connection is shared across wrappers for the whole page lifetime.
  }
}
