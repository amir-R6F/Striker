import Database from "@tauri-apps/plugin-sql";
import type { NodeRow, Settings, TreeRow } from "./types";
import type { ParsedRoadmap, RoadmapResource } from "./roadmap";
import { treeSourceKey } from "./settings";

export const DB_URL = "sqlite:striker-mini.db";

let connection: Promise<Database> | null = null;

export function database(): Promise<Database> {
  if (!connection) {
    connection = Database.load(DB_URL).catch((error: unknown) => {
      connection = null;
      throw error;
    });
  }
  return connection;
}

export function newNodeId(): string {
  return crypto.randomUUID();
}

export function internalNodeId(treeId: string, externalId: string): string {
  return `${treeId}:${externalId}`;
}

export function externalNodeId(treeId: string, id: string): string {
  const prefix = `${treeId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

async function withTransaction<T>(work: (db: Database) => Promise<T>): Promise<T> {
  const db = await database();
  await db.execute("BEGIN IMMEDIATE");
  try {
    const result = await work(db);
    await db.execute("COMMIT");
    return result;
  } catch (error) {
    try {
      await db.execute("ROLLBACK");
    } catch {
      // The original error is more useful than a rollback failure.
    }
    throw error;
  }
}

export async function loadSettings(): Promise<Settings> {
  const db = await database();
  const rows = await db.select<Array<{ key: string; value: string }>>(
    "SELECT key, value FROM settings",
  );
  const settings: Settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const db = await database();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function loadTrees(today: string): Promise<TreeRow[]> {
  const db = await database();
  const rows = await db.select<
    Array<{
      id: string;
      title: string;
      description: string;
      created_at: string;
      updated_at: string;
      struck_today: number;
    }>
  >(
    `SELECT t.id, t.title, t.description, t.created_at, t.updated_at,
            EXISTS(
              SELECT 1 FROM strikes s
              WHERE s.tree_id = t.id AND s.date = ?
            ) AS struck_today
     FROM trees t
     ORDER BY t.created_at ASC, t.title ASC`,
    [today],
  );
  return rows.map((row) => ({
    ...row,
    struck_today: Number(row.struck_today ?? 0),
  }));
}

/**
 * One aggregate query per tree load: node rows plus all-time strike counts and
 * last-two-day / today flags used for expansion and edit mode.
 */
export async function loadTreeNodes(
  treeId: string,
  today: string,
  yesterday: string,
): Promise<NodeRow[]> {
  const db = await database();
  const rows = await db.select<
    Array<{
      id: string;
      tree_id: string;
      parent_id: string | null;
      title: string;
      description: string;
      order_index: number;
      estimated_hours: number;
      strike_count: number;
      struck_today: number;
      recent: number;
    }>
  >(
    `SELECT n.id, n.tree_id, n.parent_id, n.title, n.description,
            n.order_index, n.estimated_hours,
            (SELECT COUNT(*) FROM strike_nodes sn
             JOIN strikes s ON s.id = sn.strike_id
             WHERE sn.node_id = n.id) AS strike_count,
            EXISTS(
              SELECT 1 FROM strike_nodes sn
              JOIN strikes s ON s.id = sn.strike_id
              WHERE sn.node_id = n.id AND s.date = ?
            ) AS struck_today,
            EXISTS(
              SELECT 1 FROM strike_nodes sn
              JOIN strikes s ON s.id = sn.strike_id
              WHERE sn.node_id = n.id AND s.date IN (?, ?)
            ) AS recent
     FROM tree_nodes n
     WHERE n.tree_id = ?
     ORDER BY n.order_index ASC, n.title ASC`,
    [today, today, yesterday, treeId],
  );
  return rows.map((row) => ({
    ...row,
    order_index: Number(row.order_index ?? 0),
    estimated_hours: Number(row.estimated_hours ?? 0),
    strike_count: Number(row.strike_count ?? 0),
    struck_today: Number(row.struck_today ?? 0),
    recent: Number(row.recent ?? 0),
  }));
}

export async function loadStrikeDates(treeId: string): Promise<string[]> {
  const db = await database();
  const rows = await db.select<Array<{ date: string }>>(
    "SELECT date FROM strikes WHERE tree_id = ? ORDER BY date DESC",
    [treeId],
  );
  return rows.map((row) => row.date);
}

export async function loadTree(treeId: string): Promise<TreeRow | null> {
  const db = await database();
  const rows = await db.select<
    Array<{
      id: string;
      title: string;
      description: string;
      created_at: string;
      updated_at: string;
    }>
  >(
    `SELECT id, title, description, created_at, updated_at
     FROM trees WHERE id = ?`,
    [treeId],
  );
  return rows[0] ? { ...rows[0], struck_today: 0 } : null;
}

export async function createBlankTree(title: string): Promise<string> {
  const id = newNodeId();
  const now = new Date().toISOString();
  await withTransaction(async (db) => {
    await db.execute(
      `INSERT INTO trees (id, title, description, created_at, updated_at)
       VALUES (?, ?, '', ?, ?)`,
      [id, title.trim(), now, now],
    );
    await db.execute(
      `INSERT INTO settings (key, value) VALUES (?, 'manual')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [treeSourceKey(id)],
    );
  });
  return id;
}

interface InsertNode {
  id: string;
  parent_id: string | null;
  title: string;
  description: string;
  order: number;
  estimated_hours: number;
  tags: string[];
  resources: RoadmapResource[];
}

function parseJsonArray<T>(value: unknown): T[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function insertNodes(
  db: Database,
  treeId: string,
  nodes: InsertNode[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const node of nodes) {
    await db.execute(
      `INSERT INTO tree_nodes
         (id, tree_id, parent_id, title, description, order_index,
          estimated_hours, tags, resources_json, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         order_index = excluded.order_index,
         estimated_hours = excluded.estimated_hours,
         tags = excluded.tags,
         resources_json = excluded.resources_json,
         updated_at = excluded.updated_at`,
      [
        node.id,
        treeId,
        node.title,
        node.description,
        node.order,
        node.estimated_hours,
        JSON.stringify(node.tags),
        JSON.stringify(node.resources),
        now,
        now,
      ],
    );
  }
  // Parents exist by now, so this second pass can set real relationships.
  for (const node of nodes) {
    if (!node.parent_id) continue;
    await db.execute(
      "UPDATE tree_nodes SET parent_id = ? WHERE id = ?",
      [node.parent_id, node.id],
    );
  }
}

export type ImportMode = "merge" | "replace" | "append";

/**
 * Imports a validated roadmap. Merge and replace target the active tree;
 * append always creates a separate tree. Node ids are scoped by tree id in
 * SQLite, so the same portable JSON can live in two trees without collisions.
 */
export async function importRoadmap(
  mode: ImportMode,
  roadmap: ParsedRoadmap,
  targetTreeId: string | null,
): Promise<string> {
  const now = new Date().toISOString();
  const treeId =
    mode === "append" || !targetTreeId ? newNodeId() : targetTreeId;
  const nodes: InsertNode[] = roadmap.nodes.map((node) => ({
    id: internalNodeId(treeId, node.id),
    parent_id: node.parent_id
      ? internalNodeId(treeId, node.parent_id)
      : null,
    title: node.title,
    description: node.description,
    order: node.order,
    estimated_hours: node.estimated_hours,
    tags: node.tags,
    resources: node.resources,
  }));

  await withTransaction(async (db) => {
    if (mode === "append" || !targetTreeId) {
      await db.execute(
        `INSERT INTO trees (id, title, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [treeId, roadmap.title, roadmap.description, now, now],
      );
    } else if (mode === "replace") {
      await db.execute(
        `UPDATE trees SET title = ?, description = ?, updated_at = ?
         WHERE id = ?`,
        [roadmap.title, roadmap.description, now, treeId],
      );
      // Foreign keys are not guaranteed to be enforced by every SQL plugin
      // configuration, so remove links explicitly before the nodes.
      await db.execute(
        `DELETE FROM strike_nodes
         WHERE node_id IN (SELECT id FROM tree_nodes WHERE tree_id = ?)`,
        [treeId],
      );
      await db.execute("DELETE FROM tree_nodes WHERE tree_id = ?", [treeId]);
    } else {
      await db.execute("UPDATE trees SET updated_at = ? WHERE id = ?", [
        now,
        treeId,
      ]);
    }

    await insertNodes(db, treeId, nodes);
    await db.execute(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [treeSourceKey(treeId), roadmap.source],
    );
  });

  return treeId;
}

export async function exportNodes(treeId: string): Promise<InsertNode[]> {
  const db = await database();
  const rows = await db.select<
    Array<{
      id: string;
      parent_id: string | null;
      title: string;
      description: string;
      order_index: number;
      estimated_hours: number;
      tags: string | null;
      resources_json: string | null;
    }>
  >(
    `SELECT id, parent_id, title, description, order_index, estimated_hours,
            tags, resources_json
     FROM tree_nodes WHERE tree_id = ?
     ORDER BY order_index ASC, title ASC`,
    [treeId],
  );
  return rows.map((row) => ({
    id: externalNodeId(treeId, row.id),
    parent_id: row.parent_id ? externalNodeId(treeId, row.parent_id) : null,
    title: row.title,
    description: row.description ?? "",
    order: Number(row.order_index ?? 0),
    estimated_hours: Number(row.estimated_hours ?? 0),
    tags: parseJsonArray<string>(row.tags).filter(
      (tag): tag is string => typeof tag === "string",
    ),
    resources: parseJsonArray<RoadmapResource>(row.resources_json).filter(
      (resource): resource is RoadmapResource =>
        Boolean(resource) &&
        typeof resource === "object" &&
        !Array.isArray(resource),
    ),
  }));
}

export async function treeSource(treeId: string): Promise<string> {
  const db = await database();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = ?",
    [treeSourceKey(treeId)],
  );
  return rows[0]?.value === "ai" || rows[0]?.value === "manual"
    ? rows[0].value
    : "imported";
}

export async function writeStrike(
  treeId: string,
  date: string,
  minutes: number,
  nodeIds: string[],
): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      `DELETE FROM strike_nodes WHERE strike_id IN (
         SELECT id FROM strikes WHERE tree_id = ? AND date = ?
       )`,
      [treeId, date],
    );
    await db.execute("DELETE FROM strikes WHERE tree_id = ? AND date = ?", [
      treeId,
      date,
    ]);
    const strikeId = newNodeId();
    await db.execute(
      `INSERT INTO strikes (id, tree_id, date, minutes, note, created_at)
       VALUES (?, ?, ?, ?, '', ?)`,
      [strikeId, treeId, date, minutes, new Date().toISOString()],
    );
    for (const nodeId of nodeIds) {
      await db.execute(
        "INSERT INTO strike_nodes (strike_id, node_id) VALUES (?, ?)",
        [strikeId, nodeId],
      );
    }
  });
}

export async function removeStrike(
  treeId: string,
  date: string,
): Promise<void> {
  const db = await database();
  await db.execute(
    `DELETE FROM strike_nodes WHERE strike_id IN (
       SELECT id FROM strikes WHERE tree_id = ? AND date = ?
     )`,
    [treeId, date],
  );
  await db.execute("DELETE FROM strikes WHERE tree_id = ? AND date = ?", [
    treeId,
    date,
  ]);
}
