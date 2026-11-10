import { readFileSync } from "node:fs";
import initSqlJs, { type Database } from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import { GENERATED_MIGRATIONS } from "../src/lib/browser/migrations.generated";

const migrationSql = readFileSync(
  new URL("../src-tauri/migrations/001_init.sql", import.meta.url),
  "utf8",
);
const nodeMetaSql = readFileSync(
  new URL("../src-tauri/migrations/002_node_meta.sql", import.meta.url),
  "utf8",
);

function rows(db: Database, sql: string): Array<Record<string, unknown>> {
  const statement = db.prepare(sql);
  const result: Array<Record<string, unknown>> = [];
  try {
    while (statement.step()) result.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  return result;
}

function tableColumns(db: Database, table: string): string[] {
  return rows(db, `PRAGMA table_info(${table})`).map((row) => String(row.name));
}

describe("Mini migrations", () => {
  let db: Database;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    for (const migration of GENERATED_MIGRATIONS) db.run(migration.sql);
  });

  it("matches the committed browser snapshot", () => {
    expect(GENERATED_MIGRATIONS).toHaveLength(2);
    expect(GENERATED_MIGRATIONS[0]).toEqual({
      name: "001_init",
      sql: migrationSql.trim(),
    });
    expect(GENERATED_MIGRATIONS[1]).toEqual({
      name: "002_node_meta",
      sql: nodeMetaSql.trim(),
    });
  });

  it("creates only the five Mini tables", () => {
    const tables = rows(
      db,
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    ).map((row) => row.name);

    expect(tables).toEqual([
      "settings",
      "strike_nodes",
      "strikes",
      "tree_nodes",
      "trees",
    ]);
  });

  it("creates the required indexes", () => {
    const indexes = rows(
      db,
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name LIKE 'idx_%'
       ORDER BY name`,
    ).map((row) => row.name);

    expect(indexes).toEqual([
      "idx_strike_nodes_node",
      "idx_strikes_tree_date",
      "idx_tree_nodes_parent",
      "idx_tree_nodes_tree",
    ]);
  });

  it("defines the columns the app queries", () => {
    expect(tableColumns(db, "trees")).toEqual([
      "id",
      "title",
      "description",
      "created_at",
      "updated_at",
    ]);
    expect(tableColumns(db, "tree_nodes")).toEqual([
      "id",
      "tree_id",
      "parent_id",
      "title",
      "description",
      "order_index",
      "estimated_hours",
      "created_at",
      "updated_at",
      "tags",
      "resources_json",
    ]);
    expect(tableColumns(db, "strikes")).toEqual([
      "id",
      "tree_id",
      "date",
      "minutes",
      "note",
      "created_at",
    ]);
    expect(tableColumns(db, "strike_nodes")).toEqual(["strike_id", "node_id"]);
    expect(tableColumns(db, "settings")).toEqual(["key", "value"]);
  });

  it("allows one strike per tree per day, independently per tree", () => {
    db.run("INSERT INTO trees (id, title) VALUES ('t1', 'One')");
    db.run("INSERT INTO trees (id, title) VALUES ('t2', 'Two')");
    db.run(
      "INSERT INTO strikes (id, tree_id, date, minutes) VALUES ('s1', 't1', '2026-11-10', 60)",
    );

    expect(() =>
      db.run(
        "INSERT INTO strikes (id, tree_id, date, minutes) VALUES ('s2', 't1', '2026-11-10', 30)",
      ),
    ).toThrow(/UNIQUE constraint failed/);

    expect(() =>
      db.run(
        "INSERT INTO strikes (id, tree_id, date, minutes) VALUES ('s3', 't2', '2026-11-10', 30)",
      ),
    ).not.toThrow();
  });

  it("stores structured tree nodes and links strike nodes", () => {
    db.run("INSERT INTO trees (id, title) VALUES ('t1', 'One')");
    db.run(
      "INSERT INTO strikes (id, tree_id, date, minutes) VALUES ('s1', 't1', '2026-11-10', 60)",
    );
    db.run(
      `INSERT INTO tree_nodes
         (id, tree_id, parent_id, title, order_index, estimated_hours)
       VALUES ('t1:root', 't1', NULL, 'Modeling', 1, 10)`,
    );
    db.run(
      `INSERT INTO tree_nodes
         (id, tree_id, parent_id, title, order_index, estimated_hours)
       VALUES ('t1:bevel', 't1', 't1:root', 'Bevel', 1, 2)`,
    );
    db.run(
      "INSERT INTO strike_nodes (strike_id, node_id) VALUES ('s1', 't1:bevel')",
    );

    const linked = rows(
      db,
      `SELECT n.title, s.date, s.minutes
       FROM strike_nodes sn
       JOIN tree_nodes n ON n.id = sn.node_id
       JOIN strikes s ON s.id = sn.strike_id`,
    );

    expect(linked).toEqual([
      { title: "Bevel", date: "2026-11-10", minutes: 60 },
    ]);
  });
});
