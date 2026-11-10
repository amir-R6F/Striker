import { describe, expect, it } from "vitest";
import { buildViews, computeStreak, strikeMinutes } from "../src/lib/progress";
import type { NodeRow } from "../src/lib/types";

const TREE = "tree-1";

function node(
  externalId: string,
  overrides: Partial<NodeRow> = {},
): NodeRow {
  return {
    id: `${TREE}:${externalId}`,
    tree_id: TREE,
    parent_id: null,
    title: externalId,
    description: "",
    order_index: 1,
    estimated_hours: 0,
    strike_count: 0,
    struck_today: 0,
    recent: 0,
    ...overrides,
  };
}

function child(
  externalId: string,
  parent: string,
  overrides: Partial<NodeRow> = {},
): NodeRow {
  return node(externalId, {
    parent_id: `${TREE}:${parent}`,
    ...overrides,
  });
}

describe("buildViews", () => {
  it("builds ordered roots and leaves with depths and portable ids", () => {
    const { roots, flat } = buildViews([
      child("bevel", "modeling", { order_index: 2 }),
      node("materials", { order_index: 2 }),
      child("modifiers", "modeling", { order_index: 1 }),
      node("modeling", { order_index: 1 }),
    ]);

    expect(roots.map((item) => item.externalId)).toEqual([
      "modeling",
      "materials",
    ]);
    expect(flat.map((item) => [item.externalId, item.depth])).toEqual([
      ["modeling", 0],
      ["modifiers", 1],
      ["bevel", 1],
      ["materials", 0],
    ]);
  });

  it("fills 25% per strike and caps leaves at 100%", () => {
    const { flat } = buildViews([
      node("none", { strike_count: 0 }),
      node("one", { strike_count: 1 }),
      node("three", { strike_count: 3 }),
      node("over", { strike_count: 7 }),
    ]);

    expect(
      Object.fromEntries(flat.map((item) => [item.externalId, item.percent])),
    ).toEqual({ none: 0, one: 25, three: 75, over: 100 });
  });

  it("averages each parent's direct children recursively and rounds", () => {
    const { flat } = buildViews([
      node("root", { strike_count: 0 }),
      child("branch", "root", { strike_count: 0 }),
      child("a", "branch", { strike_count: 3 }),
      child("b", "branch", { strike_count: 0 }),
      child("leaf", "root", { strike_count: 1 }),
      node("other", { strike_count: 2 }),
    ]);

    const percent = Object.fromEntries(
      flat.map((item) => [item.externalId, item.percent]),
    );

    // branch = (75 + 0) / 2 = 37.5 -> 38
    expect(percent.branch).toBe(38);
    // root = (38 + 25) / 2 = 31.5 -> 32
    expect(percent.root).toBe(32);
    expect(percent.other).toBe(50);
  });
});

describe("computeStreak", () => {
  const today = "2026-11-10";

  it("counts consecutive days ending today", () => {
    expect(
      computeStreak(["2026-11-10", "2026-11-09", "2026-11-08"], today),
    ).toBe(3);
  });

  it("counts a streak ending yesterday before today is struck", () => {
    expect(computeStreak(["2026-11-09", "2026-11-08"], today)).toBe(2);
  });

  it("stops at a gap and ignores duplicates", () => {
    expect(
      computeStreak(
        ["2026-11-10", "2026-11-10", "2026-11-09", "2026-11-07"],
        today,
      ),
    ).toBe(2);
  });

  it("returns zero with no strike today or yesterday", () => {
    expect(computeStreak([], today)).toBe(0);
    expect(computeStreak(["2026-11-06"], today)).toBe(0);
  });
});

describe("strikeMinutes", () => {
  it("rounds the total estimated hours of checked leaves", () => {
    expect(strikeMinutes([{ estimated_hours: 2 }, { estimated_hours: 3 }])).toBe(
      300,
    );
    expect(
      strikeMinutes([{ estimated_hours: 1.25 }, { estimated_hours: 0.5 }]),
    ).toBe(105);
    expect(strikeMinutes([{ estimated_hours: 1.333 }])).toBe(80);
  });

  it("falls back to 15 minutes when nothing has an estimate", () => {
    expect(strikeMinutes([])).toBe(15);
    expect(strikeMinutes([{ estimated_hours: 0 }])).toBe(15);
  });

  it("never records zero minutes for a tiny estimate", () => {
    expect(strikeMinutes([{ estimated_hours: 0.001 }])).toBe(1);
  });
});
