import { describe, expect, it } from "vitest";
import {
  RoadmapValidationError,
  buildRoadmap,
  parseRoadmap,
} from "../../src/lib/skillTree";
import type { Skill, SkillTree } from "../../src/lib/types";

interface NodeOverrides {
  id?: string;
  title?: string;
  parent_id?: string | null;
  children?: string[];
  order?: number;
}

function node(id: string, overrides: NodeOverrides = {}) {
  return {
    id,
    title: id,
    description: "",
    parent_id: null,
    order: 1,
    tags: [],
    estimated_hours: 1,
    resources: [],
    children: [],
    ...overrides,
  };
}

function roadmap(nodes: unknown[]) {
  return JSON.stringify({
    schema_version: 1,
    title: "Roadmap",
    description: "",
    source: "manual",
    created_at: "2026-01-01T00:00:00.000Z",
    nodes,
  });
}

function errorsFrom(input: string): string[] {
  try {
    parseRoadmap(input);
  } catch (error) {
    if (error instanceof RoadmapValidationError) return error.errors;
    throw error;
  }
  throw new Error("Expected the roadmap to be rejected");
}

describe("roadmap parsing and validation", () => {
  it("accepts a valid tree with roots and children", () => {
    const parsed = parseRoadmap(
      roadmap([
        node("root", { order: 1, children: ["child"] }),
        node("child", { parent_id: "root", order: 2 }),
      ]),
    );
    expect(parsed.title).toBe("Roadmap");
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes.find((item) => item.id === "child")?.parent_id).toBe("root");
  });

  it("rejects duplicate ids", () => {
    const errors = errorsFrom(roadmap([node("a"), node("a")]));
    expect(errors.join(" ")).toMatch(/Duplicate node id "a"/);
  });

  it("rejects cycles", () => {
    const errors = errorsFrom(
      roadmap([
        node("a", { parent_id: "b", children: [] }),
        node("b", { parent_id: "a", children: ["a"] }),
      ]),
    );
    expect(errors.join(" ")).toMatch(/Cycle detected/);
  });

  it("rejects a children list that disagrees with parent_id", () => {
    const errors = errorsFrom(
      roadmap([
        node("root", { children: ["child"] }),
        node("child", { parent_id: null }),
      ]),
    );
    expect(errors.join(" ")).toMatch(/parent_id differs/);
  });

  it("rejects children missing from a parent's list", () => {
    const errors = errorsFrom(
      roadmap([node("root"), node("child", { parent_id: "root" })]),
    );
    expect(errors.join(" ")).toMatch(/missing from "root" children/);
  });

  it("rejects missing parents and invalid sources", () => {
    const errors = errorsFrom(
      JSON.stringify({
        schema_version: 1,
        title: "Bad",
        description: "",
        source: "robot",
        created_at: "2026-01-01T00:00:00.000Z",
        nodes: [node("child", { parent_id: "ghost" })],
      }),
    );
    expect(errors.join(" ")).toMatch(/references missing parent/);
    expect(errors.join(" ")).toMatch(/source must be/);
  });

  it("rejects a non-v1 schema", () => {
    const errors = errorsFrom(
      JSON.stringify({
        schema_version: 2,
        title: "Future",
        description: "",
        source: "manual",
        created_at: "2026-01-01T00:00:00.000Z",
        nodes: [],
      }),
    );
    expect(errors.join(" ")).toMatch(/schema_version must be 1/);
  });
});

describe("buildRoadmap", () => {
  const tree: SkillTree = {
    id: 1,
    goal_id: 1,
    title: "Art",
    description: "Desc",
    source: "manual",
    schema_version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  const baseSkill: Omit<Skill, "id" | "name"> = {
    tree_id: 1,
    external_id: null,
    parent_id: null,
    description: null,
    order_index: 1,
    tags: [],
    estimated_hours: 0,
    resources: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("round-trips through parseRoadmap with reciprocal children", () => {
    const skills: Skill[] = [
      { ...baseSkill, id: 1, external_id: "root", name: "Root", order_index: 1 },
      {
        ...baseSkill,
        id: 2,
        external_id: "child",
        name: "Child",
        parent_id: 1,
        order_index: 2,
      },
    ];
    const built = buildRoadmap(tree, skills);
    expect(built.nodes.find((item) => item.id === "root")?.children).toEqual(["child"]);
    expect(built.meta?.node_count).toBe(2);

    const parsed = parseRoadmap(JSON.stringify(built));
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.source).toBe("manual");
  });

  it("includes aggregate stats when provided", () => {
    const skills: Skill[] = [
      { ...baseSkill, id: 1, external_id: "root", name: "Root" },
    ];
    const built = buildRoadmap(
      tree,
      skills,
      new Map([[1, { minutes: 90, entries: 3 }]]),
    );
    expect(built.meta?.total_minutes).toBe(90);
    expect(built.meta?.total_entries).toBe(3);
  });
});
