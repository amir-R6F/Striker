import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { runMigrations } from "./migrations";

export const BROWSER_DB_STORAGE_KEY = "striker-browser-db";

const PERSIST_DELAY_MS = 500;

let databasePromise: Promise<Database> | null = null;
let database: Database | null = null;
let persistTimer = 0;
let transactionDepth = 0;
let hooksInstalled = false;
let quotaWarned = false;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readStoredDatabase(): string | null {
  try {
    return window.localStorage.getItem(BROWSER_DB_STORAGE_KEY);
  } catch (error) {
    console.warn("[browser-db] localStorage is unavailable", error);
    return null;
  }
}

function writeStoredDatabase(value: string): void {
  try {
    window.localStorage.setItem(BROWSER_DB_STORAGE_KEY, value);
  } catch (error) {
    if (!quotaWarned) {
      quotaWarned = true;
      console.warn(
        "[browser-db] could not save to localStorage (quota or permissions)",
        error,
      );
    }
  }
}

function flushNow(): void {
  if (!database) return;
  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = 0;
  }
  if (transactionDepth > 0) return;
  try {
    writeStoredDatabase(bytesToBase64(database.export()));
  } catch (error) {
    if (!quotaWarned) {
      quotaWarned = true;
      console.warn("[browser-db] could not export the database", error);
    }
  }
}

function installFlushHooks(): void {
  if (hooksInstalled || typeof window === "undefined") return;
  hooksInstalled = true;
  window.addEventListener("beforeunload", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
}

/** Writes the current database to localStorage after a short debounce. */
export function persist(): void {
  if (!database || transactionDepth > 0) return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(flushNow, PERSIST_DELAY_MS);
}

/** Flushes immediately; used before reloads and on page teardown. */
export function flushPersistence(): void {
  flushNow();
}

/**
 * Tracks explicit transactions so a persist cannot snapshot a half-committed
 * entry (db.ts wraps entry edits in BEGIN IMMEDIATE / COMMIT).
 */
export function noteSqlForTransaction(sql: string): void {
  const statement = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (statement === "BEGIN" || statement === "SAVEPOINT") {
    transactionDepth += 1;
  } else if (
    statement === "COMMIT" ||
    statement === "END" ||
    statement === "ROLLBACK"
  ) {
    transactionDepth = Math.max(0, transactionDepth - 1);
  }
}

async function createDatabase(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const stored = readStoredDatabase();

  if (stored) {
    try {
      const next = new SQL.Database(base64ToBytes(stored));
      database = next;
      runMigrations(next);
      installFlushHooks();
      console.info("[browser-db] using sql.js");
      return next;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The browser database could not be opened (${detail}). Use "Reset browser DB" in Settings or remove "${BROWSER_DB_STORAGE_KEY}" from localStorage.`,
      );
    }
  }

  const next = new SQL.Database();
  runMigrations(next);
  database = next;
  installFlushHooks();
  flushNow();
  console.info("[browser-db] using sql.js");
  return next;
}

/** Returns the one sql.js connection used by every mock Database wrapper. */
export function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = createDatabase().catch((error: unknown) => {
      databasePromise = null;
      database = null;
      throw error;
    });
  }
  return databasePromise;
}

/** Clears the saved database bytes. The caller should reload the page. */
export function resetBrowserDatabase(): void {
  try {
    window.localStorage.removeItem(BROWSER_DB_STORAGE_KEY);
  } catch (error) {
    console.warn("[browser-db] could not clear localStorage", error);
  }
  databasePromise = null;
  database = null;
}
