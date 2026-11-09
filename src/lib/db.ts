import Database from "@tauri-apps/plugin-sql";
import {
  addDays,
  daysBetween,
  formatMinutes,
  formatShort,
  startOfIsoWeek,
  todayKey,
} from "./dates";
import { scheduleCard } from "./srs";
import type { ParsedRoadmap } from "./skillTree";
import { SETTING_KEYS, isSensitiveSettingKey } from "./settings";
import type {
  DailyRow,
  DashboardData,
  Entry,
  EntryInput,
  EntryOption,
  EntrySkillLink,
  EntrySkillNodeLink,
  Evidence,
  EvidenceWithEntry,
  ExportBundle,
  Goal,
  GoalInput,
  Milestone,
  MilestoneEntryLink,
  MilestoneInput,
  MilestoneWithProgress,
  ReviewInput,
  SearchEntry,
  SearchFilters,
  Skill,
  SkillConfidenceRow,
  SkillNodeInput,
  SkillNodeUpdate,
  SkillResource,
  SkillTimeRow,
  SkillTree,
  SkillTreeInput,
  SkillWithStats,
  Flashcard,
  FlashcardGrade,
  FlashcardInput,
  FlashcardSuggestion,
  FlashcardWithEntry,
  ReminderSnapshot,
  RestoreSummary,
  WeeklyReview,
  WeeklyReviewDraft,
  WeeklySkillStat,
} from "./types";

/**
 * The database file and its migrations are declared in `src-tauri/src/lib.rs`.
 * `Database.load` must use the exact same URL as the Rust migration target.
 */
const DB_URL = "sqlite:striker.db";

let connection: Promise<Database> | null = null;

function db(): Promise<Database> {
  if (!connection) {
    connection = Database.load(DB_URL).catch((error: unknown) => {
      connection = null;
      throw error;
    });
  }
  return connection;
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))];
}

function placeholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(", ");
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function loadSettings(): Promise<Record<string, string>> {
  const database = await db();
  const rows = await database.select<Array<{ key: string; value: string }>>(
    "SELECT key, value FROM settings",
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const database = await db();
  await database.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

function parseStoredId(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

/**
 * The explicit active goal wins, then the configured default, then the newest
 * goal that is not archived.
 */
export async function getActiveGoal(): Promise<Goal | null> {
  const database = await db();
  const settings = await loadSettings();
  const candidates = [
    parseStoredId(settings[SETTING_KEYS.activeGoal]),
    parseStoredId(settings[SETTING_KEYS.defaultGoal]),
  ];
  for (const id of candidates) {
    if (id == null) continue;
    const rows = await database.select<Goal[]>(
      "SELECT * FROM goals WHERE id = $1 AND archived_at IS NULL",
      [id],
    );
    if (rows[0]) return rows[0];
  }
  const rows = await database.select<Goal[]>(
    "SELECT * FROM goals WHERE archived_at IS NULL ORDER BY id DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function getGoals(includeArchived = false): Promise<Goal[]> {
  const database = await db();
  return database.select<Goal[]>(
    `SELECT * FROM goals
     ${includeArchived ? "" : "WHERE archived_at IS NULL"}
     ORDER BY id DESC`,
  );
}

export async function getGoal(id: number): Promise<Goal | null> {
  const database = await db();
  const rows = await database.select<Goal[]>("SELECT * FROM goals WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** Hides a goal from the switcher without deleting its entries or trees. */
export async function archiveGoal(id: number): Promise<void> {
  const database = await db();
  await database.execute(
    "UPDATE goals SET archived_at = date('now', 'localtime') WHERE id = $1 AND archived_at IS NULL",
    [id],
  );
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  const database = await db();
  const result = await database.execute(
    `INSERT INTO goals (title, description, start_date, weekly_hours_goal, success_criteria)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.title.trim(),
      optionalText(input.description),
      input.startDate,
      Number.isFinite(input.weeklyHoursGoal) ? input.weeklyHoursGoal : 0,
      optionalText(input.successCriteria),
    ],
  );

  const insertedId = Number(result.lastInsertId ?? 0);
  if (insertedId > 0) {
    const rows = await database.select<Goal[]>("SELECT * FROM goals WHERE id = $1", [
      insertedId,
    ]);
    if (rows[0]) return rows[0];
  }

  const newest = await getActiveGoal();
  if (!newest) throw new Error("The goal could not be created.");
  return newest;
}

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

export async function addEntry(input: EntryInput): Promise<number> {
  const database = await db();
  const evidence = input.evidenceItems.filter(
    (item, index, items) =>
      item.path.trim() !== "" &&
      items.findIndex((candidate) => candidate.path === item.path) === index,
  );
  const typedEvidence = input.evidence?.trim();
  const primaryEvidence = typedEvidence || evidence[0]?.path || null;
  const result = await database.execute(
    `INSERT INTO entries
       (goal_id, date, text, action, learned, difficulty, source, evidence, minutes, confidence, skill_tag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.goalId,
      input.date,
      input.learned ?? input.action ?? "",
      input.action,
      input.learned,
      input.difficulty,
      input.source,
      primaryEvidence,
      input.minutes,
      input.confidence,
      input.skillTag,
    ],
  );

  const entryId = Number(result.lastInsertId ?? 0);
  if (entryId <= 0) return entryId;

  try {
    for (const skillId of uniqueNumbers(input.skillIds)) {
      await database.execute(
        "INSERT OR IGNORE INTO entry_skill_nodes (entry_id, node_id) VALUES ($1, $2)",
        [entryId, skillId],
      );
    }
    for (const [index, item] of evidence.entries()) {
      await database.execute(
        `INSERT INTO entry_evidence (entry_id, kind, path, original_name, position)
         VALUES ($1, $2, $3, $4, $5)`,
        [entryId, item.kind, item.path.trim(), item.originalName, index],
      );
    }
  } catch (error) {
    // Do not keep a half-written entry if linking failed.
    await database
      .execute("DELETE FROM entry_evidence WHERE entry_id = $1", [entryId])
      .catch(() => undefined);
    await database
      .execute("DELETE FROM entry_skill_nodes WHERE entry_id = $1", [entryId])
      .catch(() => undefined);
    await database
      .execute("DELETE FROM entries WHERE id = $1", [entryId])
      .catch(() => undefined);
    throw error;
  }

  return entryId;
}

export async function getDaySummary(
  goalId: number,
  date: string,
): Promise<{ entries: number; minutes: number }> {
  const database = await db();
  const rows = await database.select<Array<{ entries: number; minutes: number | null }>>(
    `SELECT COUNT(*) AS entries, COALESCE(SUM(minutes), 0) AS minutes
     FROM entries WHERE goal_id = $1 AND date = $2`,
    [goalId, date],
  );
  return {
    entries: Number(rows[0]?.entries ?? 0),
    minutes: Number(rows[0]?.minutes ?? 0),
  };
}

export async function getDashboard(goalId: number, since: string): Promise<DashboardData> {
  const database = await db();
  const [totals, daily, dates] = await Promise.all([
    database.select<Array<{ minutes: number | null; entries: number; xp: number | null }>>(
      `SELECT COALESCE(SUM(minutes), 0) AS minutes,
              COUNT(*) AS entries,
              COALESCE(SUM(CAST(ROUND(COALESCE(minutes, 0) / 10.0 + COALESCE(confidence, 0)) AS INTEGER)), 0) AS xp
       FROM entries WHERE goal_id = $1`,
      [goalId],
    ),
    database.select<DailyRow[]>(
      `SELECT date,
              COALESCE(SUM(minutes), 0) AS minutes,
              AVG(confidence) AS confidence,
              COUNT(*) AS entries
       FROM entries
       WHERE goal_id = $1 AND date >= $2
       GROUP BY date
       ORDER BY date ASC`,
      [goalId, since],
    ),
    database.select<Array<{ date: string }>>(
      "SELECT DISTINCT date FROM entries WHERE goal_id = $1 ORDER BY date ASC",
      [goalId],
    ),
  ]);

  return {
    totalMinutes: Number(totals[0]?.minutes ?? 0),
    totalXp: Number(totals[0]?.xp ?? 0),
    entryCount: Number(totals[0]?.entries ?? 0),
    daily: daily.map((row) => ({
      date: row.date,
      minutes: Number(row.minutes ?? 0),
      confidence: row.confidence == null ? null : Number(row.confidence),
      entries: Number(row.entries ?? 0),
    })),
    dates: dates.map((row) => row.date),
  };
}

export async function getRecentEntries(
  goalId: number,
  limit = 50,
): Promise<EntryOption[]> {
  const database = await db();
  return database.select<EntryOption[]>(
    `SELECT id, date, action, learned, text, minutes
     FROM entries
     WHERE goal_id = $1
     ORDER BY date DESC, id DESC
     LIMIT $2`,
    [goalId, limit],
  );
}

/** The most recent entry for a day; focus-timer minutes are added to it. */
export async function getLatestEntry(
  goalId: number,
  date: string,
): Promise<EntryOption | null> {
  const database = await db();
  const rows = await database.select<EntryOption[]>(
    `SELECT id, date, action, learned, text, minutes
     FROM entries
     WHERE goal_id = $1 AND date = $2
     ORDER BY id DESC
     LIMIT 1`,
    [goalId, date],
  );
  return rows[0] ?? null;
}

export async function addMinutesToEntry(
  entryId: number,
  minutes: number,
): Promise<void> {
  const database = await db();
  const amount = Math.max(0, Math.round(minutes));
  if (!Number.isFinite(amount) || amount <= 0) return;
  await database.execute(
    "UPDATE entries SET minutes = COALESCE(minutes, 0) + $1 WHERE id = $2",
    [amount, entryId],
  );
}

export async function getEntry(id: number): Promise<Entry | null> {
  const database = await db();
  const rows = await database.select<Entry[]>("SELECT * FROM entries WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function getEntryEvidence(entryId: number): Promise<Evidence[]> {
  const database = await db();
  return database.select<Evidence[]>(
    `SELECT * FROM entry_evidence
     WHERE entry_id = $1
     ORDER BY position ASC, id ASC`,
    [entryId],
  );
}

export async function getEntrySkillIds(entryId: number): Promise<number[]> {
  const database = await db();
  const rows = await database.select<Array<{ node_id: number }>>(
    "SELECT node_id FROM entry_skill_nodes WHERE entry_id = $1 ORDER BY node_id ASC",
    [entryId],
  );
  return rows.map((row) => Number(row.node_id));
}

/** Recent entries with their full fields, for the Log tab list. */
export async function getRecentEntriesForEdit(
  goalId: number,
  limit = 20,
): Promise<Entry[]> {
  const database = await db();
  return database.select<Entry[]>(
    `SELECT * FROM entries
     WHERE goal_id = $1
     ORDER BY date DESC, id DESC
     LIMIT $2`,
    [goalId, limit],
  );
}

/**
 * Updates an entry and re-links skill nodes and evidence in one SQLite
 * transaction, so a failure never leaves half-updated links behind.
 */
export async function updateEntry(id: number, input: EntryInput): Promise<void> {
  const database = await db();
  const evidence = input.evidenceItems.filter(
    (item, index, items) =>
      item.path.trim() !== "" &&
      items.findIndex((candidate) => candidate.path === item.path) === index,
  );
  const typedEvidence = input.evidence?.trim();
  const primaryEvidence = typedEvidence || evidence[0]?.path || null;

  await database.execute("BEGIN IMMEDIATE");
  try {
    await database.execute(
      `UPDATE entries
       SET action = $1, learned = $2, difficulty = $3, source = $4,
           evidence = $5, minutes = $6, confidence = $7, skill_tag = $8,
           text = $9
       WHERE id = $10`,
      [
        input.action,
        input.learned,
        input.difficulty,
        input.source,
        primaryEvidence,
        input.minutes,
        input.confidence,
        input.skillTag,
        input.learned ?? input.action ?? "",
        id,
      ],
    );

    await database.execute("DELETE FROM entry_skill_nodes WHERE entry_id = $1", [id]);
    for (const skillId of uniqueNumbers(input.skillIds)) {
      await database.execute(
        "INSERT OR IGNORE INTO entry_skill_nodes (entry_id, node_id) VALUES ($1, $2)",
        [id, skillId],
      );
    }

    const keepIds = new Set(
      evidence
        .map((item) => item.id)
        .filter((value): value is number => Boolean(value && value > 0)),
    );
    const existing = await database.select<Array<{ id: number }>>(
      "SELECT id FROM entry_evidence WHERE entry_id = $1",
      [id],
    );
    for (const row of existing) {
      if (!keepIds.has(row.id)) {
        await database.execute("DELETE FROM entry_evidence WHERE id = $1", [row.id]);
      }
    }

    for (const [index, item] of evidence.entries()) {
      if (item.id != null && keepIds.has(item.id)) {
        await database.execute(
          `UPDATE entry_evidence
           SET kind = $1, path = $2, original_name = $3, position = $4
           WHERE id = $5 AND entry_id = $6`,
          [item.kind, item.path.trim(), item.originalName, index, item.id, id],
        );
      } else {
        await database.execute(
          `INSERT INTO entry_evidence
             (entry_id, kind, path, original_name, position)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, item.kind, item.path.trim(), item.originalName, index],
        );
      }
    }

    await database.execute("COMMIT");
  } catch (error) {
    await database.execute("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/**
 * Deletes an entry and its links. Evidence files stay on disk; the returned
 * rows let the caller delete the ones the user explicitly confirmed.
 */
export async function deleteEntry(id: number): Promise<Evidence[]> {
  const database = await db();
  const evidence = await getEntryEvidence(id);
  await database.execute("BEGIN IMMEDIATE");
  try {
    await database.execute("DELETE FROM milestone_entries WHERE entry_id = $1", [id]);
    await database.execute("UPDATE flashcards SET entry_id = NULL WHERE entry_id = $1", [id]);
    await database.execute("DELETE FROM entry_skill_nodes WHERE entry_id = $1", [id]);
    await database.execute("DELETE FROM entry_skills WHERE entry_id = $1", [id]);
    await database.execute("DELETE FROM entry_evidence WHERE entry_id = $1", [id]);
    await database.execute("DELETE FROM entries WHERE id = $1", [id]);
    await database.execute("COMMIT");
  } catch (error) {
    await database.execute("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return evidence;
}

export async function renameEvidence(
  id: number,
  label: string | null,
): Promise<void> {
  const database = await db();
  await database.execute(
    "UPDATE entry_evidence SET original_name = $1 WHERE id = $2",
    [optionalText(label), id],
  );
}

export async function reorderEvidence(orderedIds: number[]): Promise<void> {
  const database = await db();
  for (const [index, id] of uniqueNumbers(orderedIds).entries()) {
    await database.execute(
      "UPDATE entry_evidence SET position = $1 WHERE id = $2",
      [index, id],
    );
  }
}

/* ------------------------------------------------------------------ */
/* Skill trees and nodes                                               */
/* ------------------------------------------------------------------ */

interface SkillRow {
  id: number;
  tree_id: number;
  external_id: string | null;
  parent_id: number | null;
  name: string;
  description: string | null;
  order_index: number;
  tags: string;
  estimated_hours: number;
  resources_json: string;
  created_at: string;
  updated_at: string;
}

const SKILL_COLUMNS = `id, tree_id, external_id, parent_id, title AS name,
       description, order_index, tags, estimated_hours, resources_json,
       created_at, updated_at`;

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseResources(value: string): SkillResource[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        if (typeof record.url !== "string" || !record.url.trim()) return null;
        return {
          title:
            typeof record.title === "string" && record.title.trim()
              ? record.title.trim()
              : record.url.trim(),
          url: record.url.trim(),
        };
      })
      .filter((item): item is SkillResource => Boolean(item));
  } catch {
    return [];
  }
}

function mapSkillRow(row: SkillRow): Skill {
  return {
    ...row,
    order_index: Number(row.order_index ?? 0),
    estimated_hours: Number(row.estimated_hours ?? 0),
    tags: parseStringArray(row.tags),
    resources: parseResources(row.resources_json),
  };
}

function newNodeExternalId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `node-${uuid}`
    : `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** All nodes across all trees; callers filter by tree when needed. */
export async function getSkills(): Promise<Skill[]> {
  const database = await db();
  const rows = await database.select<SkillRow[]>(
    `SELECT ${SKILL_COLUMNS} FROM skill_nodes
     ORDER BY tree_id ASC, (parent_id IS NOT NULL) ASC, order_index ASC,
              name COLLATE NOCASE ASC, id ASC`,
  );
  return rows.map(mapSkillRow);
}

export async function getSkill(id: number): Promise<Skill | null> {
  const database = await db();
  const rows = await database.select<SkillRow[]>(
    `SELECT ${SKILL_COLUMNS} FROM skill_nodes WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapSkillRow(rows[0]) : null;
}

export async function getSkillTrees(goalId: number | null = null): Promise<SkillTree[]> {
  const database = await db();
  if (goalId == null) {
    return database.select<SkillTree[]>(
      "SELECT * FROM skill_trees ORDER BY id ASC",
    );
  }
  return database.select<SkillTree[]>(
    `SELECT * FROM skill_trees
     WHERE goal_id IS NULL OR goal_id = $1
     ORDER BY (goal_id = $1) DESC, id ASC`,
    [goalId],
  );
}

export async function ensureSkillTree(
  goalId: number | null,
  title = "My roadmap",
): Promise<SkillTree> {
  const trees = await getSkillTrees(goalId);
  if (trees[0]) return trees[0];
  const id = await createSkillTree({
    goalId,
    title,
    description: "A living map of what to learn next.",
    source: "manual",
  });
  const created = (await getSkillTrees(goalId)).find((tree) => tree.id === id);
  if (!created) throw new Error("The skill tree could not be created.");
  return created;
}

export async function createSkillTree(input: SkillTreeInput): Promise<number> {
  const database = await db();
  const result = await database.execute(
    `INSERT INTO skill_trees (goal_id, title, description, source, schema_version)
     VALUES ($1, $2, $3, $4, 1)`,
    [
      input.goalId,
      input.title.trim() || "Untitled roadmap",
      optionalText(input.description),
      input.source,
    ],
  );
  const id = Number(result.lastInsertId ?? 0);
  if (id <= 0) throw new Error("The skill tree could not be created.");
  return id;
}

export async function updateSkillTree(
  id: number,
  input: Pick<SkillTreeInput, "title" | "description" | "source">,
): Promise<void> {
  const database = await db();
  await database.execute(
    `UPDATE skill_trees
     SET title = $1, description = $2, source = $3,
         updated_at = datetime('now')
     WHERE id = $4`,
    [
      input.title.trim() || "Untitled roadmap",
      optionalText(input.description),
      input.source,
      id,
    ],
  );
}

export async function deleteSkillTree(id: number): Promise<void> {
  const database = await db();
  const nodes = await database.select<Array<{ id: number }>>(
    "SELECT id FROM skill_nodes WHERE tree_id = $1",
    [id],
  );
  const ids = nodes.map((node) => node.id);
  if (ids.length > 0) {
    const list = placeholders(ids.length);
    await database.execute(
      `DELETE FROM entry_skill_nodes WHERE node_id IN (${list})`,
      ids,
    );
  }
  await database.execute("DELETE FROM skill_nodes WHERE tree_id = $1", [id]);
  await database.execute("DELETE FROM skill_trees WHERE id = $1", [id]);
}

export async function createSkill(input: SkillNodeInput): Promise<number> {
  const database = await db();
  const parent =
    input.parentId != null ? await getSkill(input.parentId) : null;
  if (input.parentId != null && !parent) {
    throw new Error("The parent node no longer exists.");
  }
  if (parent && parent.tree_id !== input.treeId) {
    throw new Error("A child must stay in the same tree as its parent.");
  }

  let order = input.orderIndex;
  if (order == null) {
    const rows = await database.select<Array<{ next: number }>>(
      `SELECT COALESCE(MAX(order_index), 0) + 1 AS next
       FROM skill_nodes
       WHERE tree_id = $1 AND ${
         input.parentId == null ? "parent_id IS NULL" : "parent_id = $2"
       }`,
      input.parentId == null
        ? [input.treeId]
        : [input.treeId, input.parentId],
    );
    order = Number(rows[0]?.next ?? 1);
  }

  const result = await database.execute(
    `INSERT INTO skill_nodes
       (tree_id, external_id, parent_id, title, description, order_index,
        tags, estimated_hours, resources_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.treeId,
      newNodeExternalId(),
      input.parentId,
      input.title.trim(),
      optionalText(input.description),
      order,
      JSON.stringify(input.tags),
      Math.max(0, input.estimatedHours || 0),
      JSON.stringify(input.resources),
    ],
  );
  const id = Number(result.lastInsertId ?? 0);
  if (id <= 0) throw new Error("The skill node could not be created.");
  await database.execute(
    "UPDATE skill_trees SET updated_at = datetime('now') WHERE id = $1",
    [input.treeId],
  );
  return id;
}

export async function updateSkill(
  id: number,
  input: SkillNodeUpdate,
): Promise<void> {
  const database = await db();
  await database.execute(
    `UPDATE skill_nodes
     SET title = $1, description = $2, tags = $3, estimated_hours = $4,
         resources_json = $5, updated_at = datetime('now')
     WHERE id = $6`,
    [
      input.title.trim(),
      optionalText(input.description),
      JSON.stringify(input.tags),
      Math.max(0, input.estimatedHours || 0),
      JSON.stringify(input.resources),
      id,
    ],
  );
  const node = await getSkill(id);
  if (node) {
    await database.execute(
      "UPDATE skill_trees SET updated_at = datetime('now') WHERE id = $1",
      [node.tree_id],
    );
  }
}

export async function renameSkill(id: number, name: string): Promise<void> {
  const database = await db();
  await database.execute(
    "UPDATE skill_nodes SET title = $1, updated_at = datetime('now') WHERE id = $2",
    [name.trim(), id],
  );
}

/** Moves a node under a new parent, rejecting cycles. */
export async function moveSkill(
  id: number,
  parentId: number | null,
  orderIndex?: number,
): Promise<void> {
  const database = await db();
  const node = await getSkill(id);
  if (!node) throw new Error("That skill node no longer exists.");

  if (parentId != null) {
    const parent = await getSkill(parentId);
    if (!parent || parent.tree_id !== node.tree_id) {
      throw new Error("A node can only move inside its own tree.");
    }
    let cursor: Skill | null = parent;
    while (cursor) {
      if (cursor.id === id) {
        throw new Error("A node cannot be moved inside its own descendants.");
      }
      cursor = cursor.parent_id != null ? await getSkill(cursor.parent_id) : null;
    }
  }

  let order = orderIndex;
  if (order == null) {
    const rows = await database.select<Array<{ next: number }>>(
      `SELECT COALESCE(MAX(order_index), 0) + 1 AS next
       FROM skill_nodes
       WHERE tree_id = $1 AND ${
         parentId == null ? "parent_id IS NULL" : "parent_id = $2"
       }`,
      parentId == null ? [node.tree_id] : [node.tree_id, parentId],
    );
    order = Number(rows[0]?.next ?? 1);
  }

  await database.execute(
    `UPDATE skill_nodes
     SET parent_id = $1, order_index = $2, updated_at = datetime('now')
     WHERE id = $3`,
    [parentId, order, id],
  );
  await database.execute(
    "UPDATE skill_trees SET updated_at = datetime('now') WHERE id = $1",
    [node.tree_id],
  );
}

export async function reorderSiblings(
  treeId: number,
  parentId: number | null,
  orderedIds: number[],
): Promise<void> {
  const database = await db();
  for (const [index, id] of orderedIds.entries()) {
    await database.execute(
      `UPDATE skill_nodes SET order_index = $1, updated_at = datetime('now')
       WHERE id = $2 AND tree_id = $3 AND ${
         parentId == null ? "parent_id IS NULL" : "parent_id = $4"
       }`,
      parentId == null
        ? [index + 1, id, treeId]
        : [index + 1, id, treeId, parentId],
    );
  }
}

/** Deletes a node, its descendants and every entry link to them. */
export async function deleteSkill(id: number): Promise<void> {
  const database = await db();
  const skills = await getSkills();
  const ids = new Set<number>([id]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const skill of skills) {
      if (
        skill.parent_id != null &&
        ids.has(skill.parent_id) &&
        !ids.has(skill.id)
      ) {
        ids.add(skill.id);
        expanded = true;
      }
    }
  }

  const values = [...ids];
  const list = placeholders(values.length);
  await database.execute(
    `DELETE FROM entry_skill_nodes WHERE node_id IN (${list})`,
    values,
  );
  await database.execute(
    `DELETE FROM skill_nodes WHERE id IN (${list})`,
    values,
  );
}

export async function getSkillStats(goalId: number): Promise<SkillWithStats[]> {
  const database = await db();
  const rows = await database.select<Array<SkillRow & { minutes: number | null; entries: number }>>(
    `SELECT ${SKILL_COLUMNS.split(",").map((part) => `n.${part.trim()}`).join(", ")},
            COALESCE(SUM(e.minutes), 0) AS minutes,
            COUNT(DISTINCT e.id) AS entries
     FROM skill_nodes n
     LEFT JOIN entry_skill_nodes es ON es.node_id = n.id
     LEFT JOIN entries e ON e.id = es.entry_id AND e.goal_id = $1
     GROUP BY n.id
     ORDER BY n.title COLLATE NOCASE ASC`,
    [goalId],
  );
  return rows.map((row) => ({
    ...mapSkillRow(row),
    minutes: Number(row.minutes ?? 0),
    entries: Number(row.entries ?? 0),
  }));
}

export async function getSkillTimeSeries(
  goalId: number,
  since: string,
): Promise<SkillTimeRow[]> {
  const database = await db();
  const rows = await database.select<SkillTimeRow[]>(
    `SELECT e.date AS date,
            n.title AS skill,
            COALESCE(SUM(e.minutes), 0) AS minutes
     FROM entries e
     JOIN entry_skill_nodes es ON es.entry_id = e.id
     JOIN skill_nodes n ON n.id = es.node_id
     WHERE e.goal_id = $1 AND e.date >= $2
     GROUP BY e.date, n.id
     ORDER BY e.date ASC`,
    [goalId, since],
  );
  return rows.map((row) => ({ ...row, minutes: Number(row.minutes ?? 0) }));
}

export async function getSkillConfidenceSeries(
  goalId: number,
  since: string,
): Promise<SkillConfidenceRow[]> {
  const database = await db();
  const rows = await database.select<SkillConfidenceRow[]>(
    `SELECT n.title AS skill,
            e.date AS date,
            AVG(e.confidence) AS confidence
     FROM entries e
     JOIN entry_skill_nodes es ON es.entry_id = e.id
     JOIN skill_nodes n ON n.id = es.node_id
     WHERE e.goal_id = $1 AND e.date >= $2 AND e.confidence IS NOT NULL
     GROUP BY n.id, e.date
     ORDER BY e.date ASC`,
    [goalId, since],
  );
  return rows.map((row) => ({ ...row, confidence: Number(row.confidence) }));
}

export async function getSkillEntryIds(nodeId: number): Promise<number[]> {
  const database = await db();
  const rows = await database.select<Array<{ entry_id: number }>>(
    "SELECT entry_id FROM entry_skill_nodes WHERE node_id = $1 ORDER BY entry_id ASC",
    [nodeId],
  );
  return rows.map((row) => Number(row.entry_id));
}

export async function setSkillEntryLinks(
  nodeId: number,
  entryIds: number[],
): Promise<void> {
  const database = await db();
  await database.execute("DELETE FROM entry_skill_nodes WHERE node_id = $1", [
    nodeId,
  ]);
  for (const entryId of uniqueNumbers(entryIds)) {
    await database.execute(
      "INSERT OR IGNORE INTO entry_skill_nodes (entry_id, node_id) VALUES ($1, $2)",
      [entryId, nodeId],
    );
  }
}

async function assertNoTreeCycles(treeId: number): Promise<void> {
  const database = await db();
  const rows = await database.select<Array<{ id: number; parent_id: number | null }>>(
    "SELECT id, parent_id FROM skill_nodes WHERE tree_id = $1",
    [treeId],
  );
  const parents = new Map(rows.map((row) => [row.id, row.parent_id]));
  for (const row of rows) {
    const seen = new Set<number>([row.id]);
    let cursor = row.parent_id;
    while (cursor != null) {
      if (seen.has(cursor)) {
        throw new Error("That import would create a cycle in the tree.");
      }
      seen.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
}

async function writeRoadmapNodes(
  treeId: number,
  roadmap: ParsedRoadmap,
  replace: boolean,
): Promise<number> {
  const database = await db();
  if (replace) {
    await database.execute(
      `DELETE FROM entry_skill_nodes
       WHERE node_id IN (SELECT id FROM skill_nodes WHERE tree_id = $1)`,
      [treeId],
    );
    await database.execute("DELETE FROM skill_nodes WHERE tree_id = $1", [treeId]);
  }

  const existing = await database.select<Array<{ id: number; external_id: string }>>(
    `SELECT id, external_id FROM skill_nodes
     WHERE tree_id = $1 AND external_id IS NOT NULL`,
    [treeId],
  );
  const byExternal = new Map(existing.map((row) => [row.external_id, row.id]));
  const idByExternal = new Map<string, number>();

  for (const node of roadmap.nodes) {
    const existingId = byExternal.get(node.id);
    if (existingId != null) {
      await database.execute(
        `UPDATE skill_nodes
         SET title = $1, description = $2, parent_id = NULL, order_index = $3,
             tags = $4, estimated_hours = $5, resources_json = $6,
             updated_at = datetime('now')
         WHERE id = $7`,
        [
          node.title,
          node.description || null,
          node.order,
          JSON.stringify(node.tags),
          node.estimated_hours,
          JSON.stringify(node.resources),
          existingId,
        ],
      );
      idByExternal.set(node.id, existingId);
    } else {
      const result = await database.execute(
        `INSERT INTO skill_nodes
           (tree_id, external_id, parent_id, title, description, order_index,
            tags, estimated_hours, resources_json)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8)`,
        [
          treeId,
          node.id,
          node.title,
          node.description || null,
          node.order,
          JSON.stringify(node.tags),
          node.estimated_hours,
          JSON.stringify(node.resources),
        ],
      );
      const id = Number(result.lastInsertId ?? 0);
      if (id <= 0) throw new Error("An imported node could not be saved.");
      idByExternal.set(node.id, id);
    }
  }

  for (const node of roadmap.nodes) {
    const id = idByExternal.get(node.id);
    if (id == null) continue;
    let parentId: number | null = null;
    if (node.parent_id) {
      parentId = idByExternal.get(node.parent_id) ?? byExternal.get(node.parent_id) ?? null;
      if (parentId == null) {
        throw new Error(`The parent of "${node.title}" could not be resolved.`);
      }
    }
    await database.execute(
      "UPDATE skill_nodes SET parent_id = $1 WHERE id = $2",
      [parentId, id],
    );
  }

  await assertNoTreeCycles(treeId);
  await database.execute(
    "UPDATE skill_trees SET updated_at = datetime('now') WHERE id = $1",
    [treeId],
  );
  return idByExternal.size;
}

export async function replaceSkillTreeFromRoadmap(
  treeId: number,
  roadmap: ParsedRoadmap,
): Promise<number> {
  await updateSkillTree(treeId, {
    title: roadmap.title,
    description: roadmap.description,
    source: roadmap.source,
  });
  return writeRoadmapNodes(treeId, roadmap, true);
}

export async function mergeSkillTreeFromRoadmap(
  treeId: number,
  roadmap: ParsedRoadmap,
): Promise<number> {
  await updateSkillTree(treeId, {
    title: roadmap.title,
    description: roadmap.description,
    source: roadmap.source,
  });
  return writeRoadmapNodes(treeId, roadmap, false);
}

export async function appendSkillTreeFromRoadmap(
  goalId: number | null,
  roadmap: ParsedRoadmap,
): Promise<number> {
  const treeId = await createSkillTree({
    goalId,
    title: roadmap.title,
    description: roadmap.description,
    source: roadmap.source,
  });
  await writeRoadmapNodes(treeId, roadmap, true);
  return treeId;
}

/* ------------------------------------------------------------------ */
/* Milestones                                                          */
/* ------------------------------------------------------------------ */

interface MilestoneRow extends Milestone {
  minutes: number | null;
  entry_count: number;
  entry_ids: string | null;
}

export async function getMilestones(goalId: number): Promise<MilestoneWithProgress[]> {
  const database = await db();
  const rows = await database.select<MilestoneRow[]>(
    `SELECT m.*,
            (SELECT COALESCE(SUM(e.minutes), 0)
               FROM milestone_entries me
               JOIN entries e ON e.id = me.entry_id
              WHERE me.milestone_id = m.id) AS minutes,
            (SELECT COUNT(*) FROM milestone_entries me WHERE me.milestone_id = m.id) AS entry_count,
            (SELECT GROUP_CONCAT(me.entry_id) FROM milestone_entries me WHERE me.milestone_id = m.id) AS entry_ids
     FROM milestones m
     WHERE m.goal_id = $1
     ORDER BY (m.target_date IS NULL) ASC, m.target_date ASC, m.id ASC`,
    [goalId],
  );

  return rows.map((row) => ({
    ...row,
    minutes: Number(row.minutes ?? 0),
    entry_count: Number(row.entry_count ?? 0),
    entry_ids: (row.entry_ids ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  }));
}

export async function saveMilestone(input: MilestoneInput): Promise<number> {
  const database = await db();
  let milestoneId = input.id ?? 0;

  if (milestoneId > 0) {
    await database.execute(
      `UPDATE milestones
       SET title = $1, description = $2, target_date = $3, target_minutes = $4
       WHERE id = $5`,
      [
        input.title.trim(),
        optionalText(input.description),
        input.targetDate,
        input.targetMinutes,
        milestoneId,
      ],
    );
  } else {
    const result = await database.execute(
      `INSERT INTO milestones (goal_id, title, description, target_date, target_minutes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.goalId,
        input.title.trim(),
        optionalText(input.description),
        input.targetDate,
        input.targetMinutes,
      ],
    );
    milestoneId = Number(result.lastInsertId ?? 0);
  }

  if (milestoneId <= 0) throw new Error("The milestone could not be saved.");

  await database.execute("DELETE FROM milestone_entries WHERE milestone_id = $1", [
    milestoneId,
  ]);
  for (const entryId of uniqueNumbers(input.entryIds)) {
    await database.execute(
      "INSERT OR IGNORE INTO milestone_entries (milestone_id, entry_id) VALUES ($1, $2)",
      [milestoneId, entryId],
    );
  }

  return milestoneId;
}

export async function deleteMilestone(id: number): Promise<void> {
  const database = await db();
  await database.execute("DELETE FROM milestone_entries WHERE milestone_id = $1", [id]);
  await database.execute("DELETE FROM milestones WHERE id = $1", [id]);
}

export async function setMilestoneCompleted(
  id: number,
  completed: boolean,
): Promise<void> {
  const database = await db();
  if (completed) {
    await database.execute(
      "UPDATE milestones SET completed_at = date('now', 'localtime') WHERE id = $1",
      [id],
    );
  } else {
    await database.execute("UPDATE milestones SET completed_at = NULL WHERE id = $1", [
      id,
    ]);
  }
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export async function getEvidence(
  goalId: number,
  milestoneId: number | null = null,
): Promise<EvidenceWithEntry[]> {
  const database = await db();
  const params: number[] = [goalId];
  let milestoneFilter = "";
  if (milestoneId != null) {
    params.push(milestoneId);
    milestoneFilter = `AND EXISTS (
      SELECT 1 FROM milestone_entries me
      WHERE me.milestone_id = $2 AND me.entry_id = e.id
    )`;
  }

  return database.select<EvidenceWithEntry[]>(
    `SELECT ev.*, e.date AS entry_date, e.action AS entry_action
     FROM entry_evidence ev
     JOIN entries e ON e.id = ev.entry_id
     WHERE e.goal_id = $1
       ${milestoneFilter}
     ORDER BY e.date DESC, ev.id DESC`,
    params,
  );
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

interface SearchRow extends Entry {
  skill_ids: string | null;
}

export async function searchEntries(filters: SearchFilters): Promise<SearchEntry[]> {
  const database = await db();
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  const bind = (value: string | number): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const query = filters.query.trim();
  if (query) {
    const pattern = bind(likePattern(query));     conditions.push(
      `(e.action LIKE ${pattern} ESCAPE '\\'
        OR e.learned LIKE ${pattern} ESCAPE '\\'
        OR e.difficulty LIKE ${pattern} ESCAPE '\\'
        OR e.text LIKE ${pattern} ESCAPE '\\'
        OR e.source LIKE ${pattern} ESCAPE '\\'
        OR e.evidence LIKE ${pattern} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM entry_evidence ev
          WHERE ev.entry_id = e.id
            AND (ev.path LIKE ${pattern} ESCAPE '\\'
              OR ev.original_name LIKE ${pattern} ESCAPE '\\')
        ))`,
    );
  }

  if (filters.skillId != null) {
    const skill = bind(filters.skillId);
    conditions.push(
      `EXISTS (
         SELECT 1 FROM entry_skill_nodes es
         WHERE es.entry_id = e.id
           AND es.node_id IN (
             WITH RECURSIVE descendants(id) AS (
               SELECT id FROM skill_nodes WHERE id = ${skill}
               UNION ALL
               SELECT n.id FROM skill_nodes n
               JOIN descendants d ON n.parent_id = d.id
             )
             SELECT id FROM descendants
           )
       )`,
    );
  }

  if (filters.goalId != null) {
    conditions.push(`e.goal_id = ${bind(filters.goalId)}`);
  }
  if (filters.from) {
    conditions.push(`e.date >= ${bind(filters.from)}`);
  }
  if (filters.to) {
    conditions.push(`e.date <= ${bind(filters.to)}`);
  }
  if (filters.minConfidence != null) {
    conditions.push(
      `e.confidence IS NOT NULL AND e.confidence >= ${bind(filters.minConfidence)}`,
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await database.select<SearchRow[]>(
    `SELECT e.*,
            (SELECT GROUP_CONCAT(es.node_id) FROM entry_skill_nodes es WHERE es.entry_id = e.id) AS skill_ids
     FROM entries e
     ${where}
     ORDER BY e.date DESC, e.id DESC`,
    params,
  );

  const skills = await getSkills();
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));

  return rows.map((row) => ({
    ...row,
    skills: (row.skill_ids ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((id) => skillsById.get(id))
      .filter((skill): skill is Skill => Boolean(skill)),
  }));
}

/* ------------------------------------------------------------------ */
/* Weekly review                                                       */
/* ------------------------------------------------------------------ */

export async function getReview(
  goalId: number,
  weekStart: string,
): Promise<WeeklyReview | null> {
  const database = await db();
  const rows = await database.select<WeeklyReview[]>(
    "SELECT * FROM weekly_reviews WHERE goal_id = $1 AND week_start = $2 LIMIT 1",
    [goalId, weekStart],
  );
  return rows[0] ?? null;
}

export async function saveReview(input: ReviewInput): Promise<void> {
  const database = await db();
  await database.execute(
    `INSERT INTO weekly_reviews (goal_id, week_start, summary, next_week_plan, open_questions)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(goal_id, week_start) DO UPDATE SET
       summary = excluded.summary,
       next_week_plan = excluded.next_week_plan,
       open_questions = excluded.open_questions`,
    [
      input.goalId,
      input.weekStart,
      optionalText(input.summary),
      optionalText(input.nextWeekPlan),
      optionalText(input.openQuestions),
    ],
  );
}

/* ------------------------------------------------------------------ */
/* Flashcards                                                          */
/* ------------------------------------------------------------------ */

const PASSIVE_PATTERN =
  /\b(watch(?:ed|ing)?|read(?:ing)?|listen(?:ed|ing)?|view(?:ed|ing)?|course|video|tutorial|podcast|book)\b/i;

const CARD_SELECT = `SELECT f.*,
       e.date AS entry_date,
       e.action AS entry_action,
       e.learned AS entry_learned
  FROM flashcards f
  LEFT JOIN entries e ON e.id = f.entry_id`;

export async function getFlashcards(goalId: number): Promise<FlashcardWithEntry[]> {
  const database = await db();
  const rows = await database.select<FlashcardWithEntry[]>(
    `${CARD_SELECT}
     WHERE f.goal_id = $1
     ORDER BY f.due_date ASC, f.id ASC`,
    [goalId],
  );
  return rows.map((row) => ({
    ...row,
    interval_days: Number(row.interval_days ?? 0),
    ease: Number(row.ease ?? 2.5),
    repetitions: Number(row.repetitions ?? 0),
    lapses: Number(row.lapses ?? 0),
  }));
}

export async function saveFlashcard(input: FlashcardInput): Promise<number> {
  const database = await db();
  const front = input.front.trim();
  const back = input.back.trim();
  if (!front || !back) {
    throw new Error("A card needs both a front and a back.");
  }

  if (input.id != null && input.id > 0) {
    await database.execute(
      "UPDATE flashcards SET front = $1, back = $2, entry_id = $3 WHERE id = $4",
      [front, back, input.entryId, input.id],
    );
    return input.id;
  }

  const result = await database.execute(
    `INSERT INTO flashcards (goal_id, entry_id, front, back, due_date)
     VALUES ($1, $2, $3, $4, date('now', 'localtime'))`,
    [input.goalId, input.entryId, front, back],
  );
  const insertedId = Number(result.lastInsertId ?? 0);
  if (insertedId <= 0) throw new Error("The card could not be saved.");
  return insertedId;
}

export async function deleteFlashcard(id: number): Promise<void> {
  const database = await db();
  await database.execute("DELETE FROM flashcards WHERE id = $1", [id]);
}

export async function reviewFlashcard(
  id: number,
  grade: FlashcardGrade,
): Promise<FlashcardWithEntry> {
  const database = await db();
  const rows = await database.select<Flashcard[]>(
    "SELECT * FROM flashcards WHERE id = $1",
    [id],
  );
  const card = rows[0];
  if (!card) throw new Error("That card no longer exists.");

  const next = scheduleCard(
    {
      ...card,
      interval_days: Number(card.interval_days),
      ease: Number(card.ease),
      repetitions: Number(card.repetitions),
      lapses: Number(card.lapses),
    },
    grade,
    todayKey(),
  );

  await database.execute(
    `UPDATE flashcards
     SET due_date = $1, interval_days = $2, ease = $3, repetitions = $4,
         lapses = $5, last_reviewed_at = datetime('now')
     WHERE id = $6`,
    [next.dueDate, next.intervalDays, next.ease, next.repetitions, next.lapses, id],
  );

  const updated = await database.select<FlashcardWithEntry[]>(
    `${CARD_SELECT} WHERE f.id = $1`,
    [id],
  );
  const row = updated[0];
  if (!row) throw new Error("The reviewed card could not be loaded.");
  return {
    ...row,
    interval_days: Number(row.interval_days ?? 0),
    ease: Number(row.ease ?? 2.5),
    repetitions: Number(row.repetitions ?? 0),
    lapses: Number(row.lapses ?? 0),
  };
}

/** Entries with a learned note that do not have a card yet. */
export async function getFlashcardSuggestions(
  goalId: number,
  limit = 6,
): Promise<FlashcardSuggestion[]> {
  const database = await db();
  return database.select<FlashcardSuggestion[]>(
    `SELECT e.id AS entry_id,
            e.date AS entry_date,
            COALESCE(NULLIF(trim(e.action), ''), NULLIF(trim(e.text), '')) AS front,
            trim(e.learned) AS back
     FROM entries e
     WHERE e.goal_id = $1
       AND e.learned IS NOT NULL AND trim(e.learned) <> ''
       AND COALESCE(NULLIF(trim(e.action), ''), NULLIF(trim(e.text), '')) IS NOT NULL
       AND (NULLIF(trim(e.action), '') IS NOT NULL
            OR lower(trim(COALESCE(e.text, ''))) <> lower(trim(e.learned)))
       AND NOT EXISTS (SELECT 1 FROM flashcards f WHERE f.entry_id = e.id)
     ORDER BY e.date DESC, e.id DESC
     LIMIT $2`,
    [goalId, limit],
  );
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

interface PassiveRow {
  date: string;
  action: string | null;
  learned: string | null;
  text: string | null;
  source: string | null;
}

function isPassiveEntry(row: PassiveRow): boolean {
  const haystack = [row.action, row.learned, row.text, row.source]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return PASSIVE_PATTERN.test(haystack);
}

/** Data needed to pick at most one smart reminder for today. */
export async function getReminderSnapshot(
  goalId: number,
  today: string,
): Promise<ReminderSnapshot> {
  const database = await db();
  const weekStart = startOfIsoWeek(today);
  const weekEnd = addDays(weekStart, 6);

  const [dates, passiveRows, dueRows, reviewRows, weekRows] = await Promise.all([
    database.select<Array<{ date: string }>>(
      "SELECT DISTINCT date FROM entries WHERE goal_id = $1 ORDER BY date DESC LIMIT 1",
      [goalId],
    ),
    database.select<PassiveRow[]>(
      `SELECT date, action, learned, text, source
       FROM entries
       WHERE goal_id = $1 AND date >= $2 AND date <= $3`,
      [goalId, addDays(today, -7), today],
    ),
    database.select<Array<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM flashcards WHERE goal_id = $1 AND due_date <= $2",
      [goalId, today],
    ),
    database.select<Array<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM weekly_reviews WHERE goal_id = $1 AND week_start = $2",
      [goalId, weekStart],
    ),
    database.select<Array<{ entries: number; minutes: number | null }>>(
      `SELECT COUNT(*) AS entries, COALESCE(SUM(minutes), 0) AS minutes
       FROM entries
       WHERE goal_id = $1 AND date >= $2 AND date <= $3`,
      [goalId, weekStart, weekEnd],
    ),
  ]);

  const lastEntryDate = dates[0]?.date ?? null;
  const daysSinceEntry = lastEntryDate ? daysBetween(lastEntryDate, today) : null;

  const passiveByDate = new Map<string, boolean>();
  for (const row of passiveRows) {
    const passive = isPassiveEntry(row);
    const current = passiveByDate.get(row.date);
    passiveByDate.set(row.date, current === undefined ? passive : current && passive);
  }

  let passiveOnlyDays = 0;
  if (
    lastEntryDate &&
    daysSinceEntry != null &&
    daysSinceEntry <= 1
  ) {
    let cursor = lastEntryDate;
    for (let index = 0; index < 7; index += 1) {
      const day = passiveByDate.get(cursor);
      if (day !== true) break;
      passiveOnlyDays += 1;
      cursor = addDays(cursor, -1);
    }
  }

  return {
    lastEntryDate,
    daysSinceEntry,
    passiveOnlyDays,
    weekStart,
    weekEntries: Number(weekRows[0]?.entries ?? 0),
    weekMinutes: Number(weekRows[0]?.minutes ?? 0),
    weeklyReviewSaved: Number(reviewRows[0]?.count ?? 0) > 0,
    dueCards: Number(dueRows[0]?.count ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Weekly review drafting                                              */
/* ------------------------------------------------------------------ */

interface WeekStatsRow {
  entries: number;
  minutes: number | null;
  days: number;
  confidence: number | null;
}

interface WeekSkillRow {
  name: string;
  minutes: number | null;
  entries: number;
}

interface WeekEntryRow {
  date: string;
  action: string | null;
  learned: string | null;
  difficulty: string | null;
  text: string;
}

function clipText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Stats plus suggested review text built from this week and the six before it. */
export async function getWeeklyDraft(
  goalId: number,
  weekStart: string,
): Promise<WeeklyReviewDraft> {
  const database = await db();
  const weekEnd = addDays(weekStart, 6);
  const historyStart = addDays(weekStart, -42);

  const [statsRows, skillRows, entryRows, historySkillRows, historyRows, goalRows] =
    await Promise.all([
      database.select<WeekStatsRow[]>(
        `SELECT COUNT(*) AS entries,
                COALESCE(SUM(minutes), 0) AS minutes,
                COUNT(DISTINCT date) AS days,
                AVG(confidence) AS confidence
         FROM entries
         WHERE goal_id = $1 AND date >= $2 AND date <= $3`,
        [goalId, weekStart, weekEnd],
      ),
      database.select<WeekSkillRow[]>(
        `SELECT n.title AS name,
                COALESCE(SUM(e.minutes), 0) AS minutes,
                COUNT(DISTINCT e.id) AS entries
         FROM entries e
         JOIN entry_skill_nodes es ON es.entry_id = e.id
         JOIN skill_nodes n ON n.id = es.node_id
         WHERE e.goal_id = $1 AND e.date >= $2 AND e.date <= $3
         GROUP BY n.id
         ORDER BY minutes DESC, entries DESC, n.title COLLATE NOCASE ASC
         LIMIT 4`,
        [goalId, weekStart, weekEnd],
      ),
      database.select<WeekEntryRow[]>(
        `SELECT date, action, learned, difficulty, text
         FROM entries
         WHERE goal_id = $1 AND date >= $2 AND date <= $3
         ORDER BY date ASC, id ASC`,
        [goalId, weekStart, weekEnd],
      ),
      database.select<WeekSkillRow[]>(
        `SELECT n.title AS name,
                COALESCE(SUM(e.minutes), 0) AS minutes,
                COUNT(DISTINCT e.id) AS entries
         FROM entries e
         JOIN entry_skill_nodes es ON es.entry_id = e.id
         JOIN skill_nodes n ON n.id = es.node_id
         WHERE e.goal_id = $1 AND e.date >= $2 AND e.date < $3
         GROUP BY n.id
         ORDER BY minutes DESC, entries DESC, n.title COLLATE NOCASE ASC
         LIMIT 3`,
        [goalId, historyStart, weekStart],
      ),
      database.select<Array<{ minutes: number | null }>>(
        `SELECT COALESCE(SUM(minutes), 0) AS minutes
         FROM entries
         WHERE goal_id = $1 AND date >= $2 AND date < $3`,
        [goalId, historyStart, weekStart],
      ),
      database.select<Array<{ weekly_hours_goal: number | null }>>(
        "SELECT weekly_hours_goal FROM goals WHERE id = $1",
        [goalId],
      ),
    ]);

  const stats = statsRows[0];
  const entries = Number(stats?.entries ?? 0);
  const minutes = Number(stats?.minutes ?? 0);
  const days = Number(stats?.days ?? 0);
  const confidence =
    stats?.confidence == null ? null : Number(stats.confidence);

  const topSkills: WeeklySkillStat[] = skillRows.map((row) => ({
    name: row.name,
    minutes: Number(row.minutes ?? 0),
    entries: Number(row.entries ?? 0),
  }));

  const summaryParts: string[] = [];
  if (entries === 0) {
    summaryParts.push("No entries logged this week yet.");
  } else {
    summaryParts.push(
      `Logged ${entries} ${entries === 1 ? "entry" : "entries"} and ${formatMinutes(
        minutes,
      )} across ${days} ${days === 1 ? "day" : "days"}.`,
    );
  }
  if (topSkills.length > 0) {
    summaryParts.push(
      `Top skills: ${topSkills
        .slice(0, 3)
        .map((skill) => `${skill.name} (${formatMinutes(skill.minutes)})`)
        .join(", ")}.`,
    );
  }
  if (confidence != null) {
    summaryParts.push(`Average confidence ${confidence.toFixed(1)}/5.`);
  }

  const openQuestions: string[] = [];
  for (const entry of entryRows) {
    const difficulty = entry.difficulty?.trim();
    if (difficulty) {
      openQuestions.push(`${formatShort(entry.date)}: ${clipText(difficulty, 140)}`);
    }
    const learned = entry.learned ?? "";
    const question = learned
      .split(/\n+/)
      .map((line) => line.trim())
      .find((line) => line.includes("?"));
    if (question) {
      openQuestions.push(`${formatShort(entry.date)}: ${clipText(question, 140)}`);
    }
  }
  const uniqueQuestions = [...new Set(openQuestions)].slice(0, 8);

  const focus = historySkillRows.length > 0 ? historySkillRows : skillRows;
  const focusSkills: WeeklySkillStat[] = focus.map((row) => ({
    name: row.name,
    minutes: Number(row.minutes ?? 0),
    entries: Number(row.entries ?? 0),
  }));

  const recentWeeklyAverage = Number(historyRows[0]?.minutes ?? 0) / 6;
  const goalMinutes = Number(goalRows[0]?.weekly_hours_goal ?? 0) * 60;
  let targetMinutes =
    recentWeeklyAverage > 0 ? recentWeeklyAverage : goalMinutes;
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) targetMinutes = 60;
  targetMinutes = Math.max(30, Math.round(targetMinutes / 30) * 30);

  const planParts = [
    `Aim for about ${formatMinutes(targetMinutes)} of focused practice next week.`,
  ];
  if (focusSkills.length > 0) {
    planParts.push(
      `Prioritise ${focusSkills
        .slice(0, 2)
        .map((skill) => skill.name)
        .join(" and ")}.`,
    );
    planParts.push(
      `Finish with one hands-on exercise on ${focusSkills[0].name} and attach the result as evidence.`,
    );
  } else {
    planParts.push(
      "Finish with one hands-on exercise so you have something concrete to log.",
    );
  }

  return {
    weekStart,
    entries,
    minutes,
    days,
    confidence,
    topSkills,
    summary: summaryParts.join(" "),
    nextWeekPlan: planParts.join(" "),
    openQuestions: uniqueQuestions.join("\n"),
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export async function getExportBundle(
  options: { includeSecrets?: boolean } = {},
): Promise<ExportBundle> {
  const database = await db();
  const [
    goals,
    entries,
    reviews,
    flashcards,
    skills,
    entrySkills,
    milestones,
    milestoneEntries,
    evidence,
    allSettings,
  ] = await Promise.all([
    database.select<Goal[]>("SELECT * FROM goals ORDER BY id ASC"),
    database.select<Entry[]>("SELECT * FROM entries ORDER BY date ASC, id ASC"),
    database.select<WeeklyReview[]>(
      "SELECT * FROM weekly_reviews ORDER BY week_start ASC, id ASC",
    ),
    database.select<Flashcard[]>("SELECT * FROM flashcards ORDER BY id ASC"),
    database.select<Skill[]>("SELECT * FROM skills ORDER BY id ASC"),
    database.select<EntrySkillLink[]>(
      "SELECT entry_id, skill_id FROM entry_skills ORDER BY entry_id ASC",
    ),
    database.select<Milestone[]>("SELECT * FROM milestones ORDER BY id ASC"),
    database.select<MilestoneEntryLink[]>(
      "SELECT milestone_id, entry_id FROM milestone_entries ORDER BY milestone_id ASC",
    ),
    database.select<Evidence[]>(
      "SELECT * FROM entry_evidence ORDER BY entry_id ASC, id ASC",
    ),
    loadSettings(),
  ]);

  const settings = options.includeSecrets
    ? allSettings
    : Object.fromEntries(
        Object.entries(allSettings).filter(
          ([key]) => !isSensitiveSettingKey(key),
        ),
      );

  const [skillTrees, skillNodes, entrySkillNodes] = await Promise.all([
    database.select<SkillTree[]>("SELECT * FROM skill_trees ORDER BY id ASC"),
    getSkills(),
    database.select<EntrySkillNodeLink[]>(
      "SELECT entry_id, node_id FROM entry_skill_nodes ORDER BY entry_id ASC, node_id ASC",
    ),
  ]);

  return {
    app: "Striker",
    schema_version: 5,
    exported_at: new Date().toISOString(),
    goals,
    entries,
    weekly_reviews: reviews,
    flashcards,
    skills,
    entry_skills: entrySkills,
    skill_trees: skillTrees,
    skill_nodes: skillNodes,
    entry_skill_nodes: entrySkillNodes,
    milestones,
    milestone_entries: milestoneEntries,
    entry_evidence: evidence,
    settings,
  };
}

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Replaces the local learning data with a validated backup. Settings are
 * upserted, so keys that are not in the backup are kept. Restore is only ever
 * called after an explicit confirmation in Settings.
 */
export async function restoreBundle(
  bundle: ExportBundle,
): Promise<RestoreSummary> {
  if (!bundle || bundle.app !== "Striker") {
    throw new Error("That file is not a Striker backup.");
  }

  const database = await db();
  const goals = asArray(bundle.goals);
  const entries = asArray(bundle.entries);
  const skills = asArray(bundle.skills);
  const entrySkills = asArray(bundle.entry_skills);
  const skillTrees = asArray(bundle.skill_trees);
  const skillNodes = asArray(bundle.skill_nodes);
  const entrySkillNodes = asArray(bundle.entry_skill_nodes);
  const milestones = asArray(bundle.milestones);
  const milestoneEntries = asArray(bundle.milestone_entries);
  const evidence = asArray(bundle.entry_evidence);
  const reviews = asArray(bundle.weekly_reviews);
  const flashcards = asArray(bundle.flashcards);
  const settings = bundle.settings ?? {};

  for (const statement of [
    "DELETE FROM flashcards",
    "DELETE FROM milestone_entries",
    "DELETE FROM milestones",
    "DELETE FROM entry_evidence",
    "DELETE FROM entry_skill_nodes",
    "DELETE FROM entry_skills",
    "DELETE FROM weekly_reviews",
    "DELETE FROM entries",
    "DELETE FROM skill_nodes",
    "DELETE FROM skill_trees",
    "DELETE FROM skills",
    "DELETE FROM goals",
  ]) {
    await database.execute(statement);
  }

  const goalIds = new Set<number>();
  for (const goal of goals) {
    await database.execute(
      `INSERT INTO goals
         (id, title, description, start_date, weekly_hours_goal, success_criteria,
          archived_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        goal.id,
        goal.title,
        goal.description,
        goal.start_date,
        goal.weekly_hours_goal,
        goal.success_criteria,
        goal.archived_at ?? null,
        goal.created_at,
      ],
    );
    goalIds.add(goal.id);
  }

  const orderedSkills = [
    ...skills.filter((skill) => skill.parent_id == null),
    ...skills.filter((skill) => skill.parent_id != null),
  ];
  const skillIds = new Set<number>();
  for (const skill of orderedSkills) {
    const parentId =
      skill.parent_id != null && skillIds.has(skill.parent_id)
        ? skill.parent_id
        : null;
    await database.execute(
      "INSERT INTO skills (id, name, parent_id, created_at) VALUES ($1, $2, $3, $4)",
      [skill.id, skill.name, parentId, skill.created_at],
    );
    skillIds.add(skill.id);
  }

  const treeIds = new Set<number>();
  for (const tree of skillTrees) {
    await database.execute(
      `INSERT INTO skill_trees
         (id, goal_id, title, description, source, schema_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tree.id,
        tree.goal_id != null && goalIds.has(tree.goal_id) ? tree.goal_id : null,
        tree.title,
        tree.description,
        tree.source,
        tree.schema_version ?? 1,
        tree.created_at,
        tree.updated_at ?? tree.created_at,
      ],
    );
    treeIds.add(tree.id);
  }

  let fallbackTreeId = skillTrees[0]?.id ?? 0;
  if (treeIds.size === 0) {
    const treeResult = await database.execute(
      `INSERT INTO skill_trees (title, description, source, schema_version)
       VALUES ('Imported roadmap', 'Restored from a Striker backup.', 'imported', 1)`,
    );
    fallbackTreeId = Number(treeResult.lastInsertId ?? 0);
    treeIds.add(fallbackTreeId);
  }

  const nodesToRestore = skillNodes.length > 0
    ? skillNodes
    : skills.map((skill) => ({
        ...skill,
        tree_id: fallbackTreeId,
        external_id: `legacy-${skill.id}`,
        description: null,
        order_index: skill.id,
        tags: [],
        estimated_hours: 0,
        resources: [],
        updated_at: skill.created_at,
      }));

  const nodeIds = new Set<number>();
  for (const node of nodesToRestore) {
    const treeId = treeIds.has(node.tree_id) ? node.tree_id : fallbackTreeId;
    await database.execute(
      `INSERT INTO skill_nodes
         (id, tree_id, external_id, parent_id, title, description, order_index,
          tags, estimated_hours, resources_json, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        node.id,
        treeId,
        node.external_id ?? `legacy-${node.id}`,
        node.name,
        node.description ?? null,
        node.order_index ?? 0,
        JSON.stringify(Array.isArray(node.tags) ? node.tags : []),
        Number(node.estimated_hours ?? 0),
        JSON.stringify(Array.isArray(node.resources) ? node.resources : []),
        node.created_at,
        node.updated_at ?? node.created_at,
      ],
    );
    nodeIds.add(node.id);
  }
  for (const node of nodesToRestore) {
    if (node.parent_id != null && nodeIds.has(node.parent_id)) {
      await database.execute(
        "UPDATE skill_nodes SET parent_id = $1 WHERE id = $2",
        [node.parent_id, node.id],
      );
    }
  }

  const entryIds = new Set<number>();
  for (const entry of entries) {
    if (!goalIds.has(entry.goal_id)) continue;
    await database.execute(
      `INSERT INTO entries
         (id, goal_id, date, text, action, learned, difficulty, source, evidence,
          minutes, confidence, skill_tag, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        entry.id,
        entry.goal_id,
        entry.date,
        entry.text,
        entry.action,
        entry.learned,
        entry.difficulty,
        entry.source,
        entry.evidence,
        entry.minutes,
        entry.confidence,
        entry.skill_tag,
        entry.created_at,
      ],
    );
    entryIds.add(entry.id);
  }

  for (const link of entrySkills) {
    if (!entryIds.has(link.entry_id) || !skillIds.has(link.skill_id)) continue;
    await database.execute(
      "INSERT OR IGNORE INTO entry_skills (entry_id, skill_id) VALUES ($1, $2)",
      [link.entry_id, link.skill_id],
    );
  }

  const nodeLinks = entrySkillNodes.length > 0
    ? entrySkillNodes
    : entrySkills.map((link) => ({
        entry_id: link.entry_id,
        node_id: link.skill_id,
      }));
  for (const link of nodeLinks) {
    if (!entryIds.has(link.entry_id) || !nodeIds.has(link.node_id)) continue;
    await database.execute(
      "INSERT OR IGNORE INTO entry_skill_nodes (entry_id, node_id) VALUES ($1, $2)",
      [link.entry_id, link.node_id],
    );
  }

  const milestoneIds = new Set<number>();
  for (const milestone of milestones) {
    if (!goalIds.has(milestone.goal_id)) continue;
    await database.execute(
      `INSERT INTO milestones
         (id, goal_id, title, description, target_date, target_minutes, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        milestone.id,
        milestone.goal_id,
        milestone.title,
        milestone.description,
        milestone.target_date,
        milestone.target_minutes,
        milestone.completed_at,
        milestone.created_at,
      ],
    );
    milestoneIds.add(milestone.id);
  }

  for (const link of milestoneEntries) {
    if (!milestoneIds.has(link.milestone_id) || !entryIds.has(link.entry_id)) {
      continue;
    }
    await database.execute(
      "INSERT OR IGNORE INTO milestone_entries (milestone_id, entry_id) VALUES ($1, $2)",
      [link.milestone_id, link.entry_id],
    );
  }

  const evidenceCountByEntry = new Map<number, number>();
  for (const item of evidence) {
    if (!entryIds.has(item.entry_id)) continue;
    const nextPosition = evidenceCountByEntry.get(item.entry_id) ?? 0;
    evidenceCountByEntry.set(item.entry_id, nextPosition + 1);
    await database.execute(
      `INSERT INTO entry_evidence
         (id, entry_id, kind, path, original_name, position, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        item.id,
        item.entry_id,
        item.kind,
        item.path,
        item.original_name,
        Number.isFinite(item.position) ? item.position : nextPosition,
        item.created_at,
      ],
    );
  }

  for (const review of reviews) {
    if (!goalIds.has(review.goal_id)) continue;
    await database.execute(
      `INSERT INTO weekly_reviews
         (id, goal_id, week_start, summary, next_week_plan, open_questions)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        review.id,
        review.goal_id,
        review.week_start,
        review.summary,
        review.next_week_plan,
        review.open_questions,
      ],
    );
  }

  for (const card of flashcards) {
    if (!goalIds.has(card.goal_id)) continue;
    await database.execute(
      `INSERT INTO flashcards
         (id, goal_id, entry_id, front, back, due_date, interval_days, ease,
          repetitions, lapses, last_reviewed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        card.id,
        card.goal_id,
        card.entry_id != null && entryIds.has(card.entry_id)
          ? card.entry_id
          : null,
        card.front,
        card.back,
        card.due_date,
        card.interval_days,
        card.ease,
        card.repetitions,
        card.lapses,
        card.last_reviewed_at,
        card.created_at,
      ],
    );
  }

  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === "string") await saveSetting(key, value);
  }

  return {
    goals: goals.length,
    entries: entryIds.size,
    skills: nodeIds.size,
    milestones: milestoneIds.size,
    evidence: evidence.filter((item) => entryIds.has(item.entry_id)).length,
    reviews: reviews.filter((review) => goalIds.has(review.goal_id)).length,
    flashcards: flashcards.filter((card) => goalIds.has(card.goal_id)).length,
  };
}
