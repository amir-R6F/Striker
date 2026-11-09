import { beforeEach, describe, expect, it } from "vitest";
import {
  addEntry,
  archiveGoal,
  createGoal,
  createSkill,
  createSkillTree,
  deleteEntry,
  getActiveGoal,
  getEntry,
  getEntryEvidence,
  getEntrySkillIds,
  getExportBundle,
  getGoals,
  getMilestones,
  getSkills,
  mergeSkillTreeFromRoadmap,
  renameEvidence,
  reorderEvidence,
  replaceSkillTreeFromRoadmap,
  appendSkillTreeFromRoadmap,
  restoreBundle,
  saveMilestone,
  saveSetting,
  searchEntries,
  setMilestoneCompleted,
  updateEntry,
} from "../../src/lib/db";
import { SETTING_KEYS } from "../../src/lib/settings";
import { parseRoadmap } from "../../src/lib/skillTree";
import type { Goal, SkillTree } from "../../src/lib/types";
import { resetTestDatabase } from "./pluginSqlShim";

beforeEach(() => {
  resetTestDatabase();
});

async function seedTree() {
  const goal = await createGoal({
    title: "Test goal",
    description: null,
    startDate: "2026-03-01",
    weeklyHoursGoal: 5,
    successCriteria: null,
  });
  const treeId = await createSkillTree({
    goalId: goal.id,
    title: "Test tree",
    description: null,
    source: "manual",
  });
  const rootId = await createSkill({
    treeId,
    parentId: null,
    title: "Root",
    description: null,
    tags: [],
    estimatedHours: 0,
    resources: [],
  });
  const childId = await createSkill({
    treeId,
    parentId: rootId,
    title: "Child",
    description: null,
    tags: [],
    estimatedHours: 0,
    resources: [],
  });
  return { goal, treeId, rootId, childId };
}

async function seedEntry(goal: Goal, childId?: number): Promise<number> {
  return addEntry({
    goalId: goal.id,
    date: "2026-03-01",
    action: "Practice",
    learned: "Learned something",
    difficulty: null,
    source: "https://example.com",
    evidence: "C:\\shots\\a.png",
    evidenceItems: [
      { kind: "image", path: "C:\\shots\\a.png", originalName: "a.png" },
      { kind: "link", path: "https://example.com", originalName: "Example" },
    ],
    minutes: 45,
    confidence: 4,
    skillIds: childId != null ? [childId] : [],
    skillTag: childId != null ? "Child" : null,
  });
}

describe("entry CRUD with links", () => {
  it("edits an entry in place and replaces skill and evidence links", async () => {
    const { goal, childId } = await seedTree();
    const entryId = await seedEntry(goal, childId);

    expect((await getEntry(entryId))?.action).toBe("Practice");
    const evidence = await getEntryEvidence(entryId);
    expect(evidence.map((item) => item.position)).toEqual([0, 1]);
    expect(await getEntrySkillIds(entryId)).toEqual([childId]);

    await updateEntry(entryId, {
      goalId: goal.id,
      date: "2026-03-01",
      action: "Practice v2",
      learned: "Learned more",
      difficulty: "Hard part",
      source: null,
      evidence: "https://example.com",
      evidenceItems: [
        {
          id: evidence[1].id,
          kind: "link",
          path: "https://example.com",
          originalName: "Renamed link",
        },
      ],
      minutes: 60,
      confidence: 5,
      skillIds: [],
      skillTag: null,
    });

    const updated = await getEntry(entryId);
    expect(updated?.action).toBe("Practice v2");
    expect(updated?.minutes).toBe(60);
    expect(updated?.confidence).toBe(5);

    const updatedEvidence = await getEntryEvidence(entryId);
    expect(updatedEvidence).toHaveLength(1);
    expect(updatedEvidence[0].original_name).toBe("Renamed link");
    expect(await getEntrySkillIds(entryId)).toEqual([]);
  });

  it("renames and reorders evidence attachments", async () => {
    const { goal } = await seedTree();
    const entryId = await addEntry({
      goalId: goal.id,
      date: "2026-03-02",
      action: "Three files",
      learned: null,
      difficulty: null,
      source: null,
      evidence: null,
      evidenceItems: [
        { kind: "image", path: "C:\\shots\\one.png", originalName: "one" },
        { kind: "image", path: "C:\\shots\\two.png", originalName: "two" },
        { kind: "image", path: "C:\\shots\\three.png", originalName: "three" },
      ],
      minutes: null,
      confidence: null,
      skillIds: [],
      skillTag: null,
    });

    const rows = await getEntryEvidence(entryId);
    await renameEvidence(rows[0].id, "First");
    await reorderEvidence([rows[2].id, rows[0].id, rows[1].id]);

    const reordered = await getEntryEvidence(entryId);
    expect(reordered.map((item) => item.original_name)).toEqual([
      "three",
      "First",
      "two",
    ]);
    expect(reordered.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("deletes an entry, its links and milestone membership", async () => {
    const { goal, childId } = await seedTree();
    const entryId = await seedEntry(goal, childId);
    const milestoneId = await saveMilestone({
      goalId: goal.id,
      title: "Milestone",
      description: null,
      targetDate: null,
      targetMinutes: null,
      entryIds: [entryId],
    });

    let milestones = await getMilestones(goal.id);
    expect(milestones[0].completed_at).toBeNull();
    expect(milestones[0].entry_count).toBe(1);

    await setMilestoneCompleted(milestoneId, true);
    milestones = await getMilestones(goal.id);
    expect(milestones[0].completed_at).toBeTruthy();

    const removedEvidence = await deleteEntry(entryId);
    expect(removedEvidence).toHaveLength(2);
    expect(await getEntry(entryId)).toBeNull();
    expect(await getEntrySkillIds(entryId)).toEqual([]);
    expect((await getMilestones(goal.id))[0].entry_count).toBe(0);
  });
});

function importRoadmap(extra = false) {
  const nodes = [
    {
      id: "a",
      title: "A",
      description: "",
      parent_id: null,
      order: 1,
      tags: [],
      estimated_hours: 1,
      resources: [],
      children: ["b"],
    },
    {
      id: "b",
      title: "B",
      description: "",
      parent_id: "a",
      order: 2,
      tags: [],
      estimated_hours: 1,
      resources: [],
      children: extra ? ["c"] : [],
    },
  ];
  if (extra) {
    nodes.push({
      id: "c",
      title: "C",
      description: "",
      parent_id: "b",
      order: 3,
      tags: [],
      estimated_hours: 1,
      resources: [],
      children: [],
    });
  }
  return parseRoadmap(
    JSON.stringify({
      schema_version: 1,
      title: extra ? "Imported plus" : "Imported",
      description: "",
      source: "imported",
      created_at: "2026-01-01T00:00:00.000Z",
      nodes,
    }),
  );
}

describe("roadmap import modes", () => {
  it("appends a new tree", async () => {
    const goal = await createGoal({
      title: "Import goal",
      description: null,
      startDate: "2026-03-01",
      weeklyHoursGoal: 0,
      successCriteria: null,
    });
    const treeId = await appendSkillTreeFromRoadmap(goal.id, importRoadmap());
    const nodes = (await getSkills()).filter((node) => node.tree_id === treeId);
    expect(nodes.map((node) => node.name).sort()).toEqual(["A", "B"]);
    expect(nodes.find((node) => node.name === "B")?.parent_id).toBe(
      nodes.find((node) => node.name === "A")?.id,
    );
  });

  it("merges, updating existing external ids and adding new nodes", async () => {
    const goal = await createGoal({
      title: "Merge goal",
      description: null,
      startDate: "2026-03-01",
      weeklyHoursGoal: 0,
      successCriteria: null,
    });
    const treeId = await createSkillTree({
      goalId: goal.id,
      title: "Merge tree",
      description: null,
      source: "manual",
    });
    await mergeSkillTreeFromRoadmap(treeId, importRoadmap());
    expect((await getSkills()).filter((node) => node.tree_id === treeId)).toHaveLength(2);

    await mergeSkillTreeFromRoadmap(treeId, importRoadmap(true));
    const nodes = (await getSkills()).filter((node) => node.tree_id === treeId);
    expect(nodes).toHaveLength(3);
    expect(nodes.find((node) => node.name === "C")?.parent_id).toBe(
      nodes.find((node) => node.name === "B")?.id,
    );
  });

  it("replaces the nodes in an existing tree", async () => {
    const { goal, treeId } = await seedTree();
    const count = await replaceSkillTreeFromRoadmap(treeId, importRoadmap());
    expect(count).toBe(2);
    const nodes = (await getSkills()).filter((node) => node.tree_id === treeId);
    expect(nodes.map((node) => node.name).sort()).toEqual(["A", "B"]);
    const trees = (await getExportBundle()).skill_trees;
    expect(trees.find((tree) => tree.id === treeId)?.title).toBe("Imported");
    expect(goal.id).toBeGreaterThan(0);
  });
});

describe("backup and restore", () => {
  it("exports schema 5 and restores it losslessly", async () => {
    const { goal, childId } = await seedTree();
    const entryId = await seedEntry(goal, childId);
    await saveMilestone({
      goalId: goal.id,
      title: "Ship it",
      description: null,
      targetDate: "2026-04-01",
      targetMinutes: 120,
      entryIds: [entryId],
    });

    const bundle = await getExportBundle();
    expect(bundle.schema_version).toBe(5);
    expect(bundle.skill_trees.length).toBe(1);
    expect(bundle.skill_nodes.length).toBe(2);
    expect(bundle.entry_skill_nodes).toHaveLength(1);

    const summary = await restoreBundle(bundle);
    expect(summary.goals).toBe(1);
    expect(summary.entries).toBe(1);
    expect(summary.skills).toBe(2);
    expect(summary.milestones).toBe(1);

    const restoredNodes = await getSkills();
    const child = restoredNodes.find((node) => node.name === "Child");
    expect(child?.parent_id).toBe(restoredNodes.find((node) => node.name === "Root")?.id);

    const results = await searchEntries({
      query: "Practice",
      skillId: null,
      goalId: null,
      from: null,
      to: null,
      minConfidence: null,
    });
    expect(results).toHaveLength(1);
    expect(results[0].skills.map((skill) => skill.name)).toEqual(["Child"]);

    const milestones = await getMilestones(goal.id);
    expect(milestones[0].title).toBe("Ship it");
    expect(milestones[0].entry_count).toBe(1);
  });

  it("upgrades a schema-5 backup that predates newer columns", async () => {
    const { goal, treeId } = await seedTree();
    const tree = (await getExportBundle()).skill_trees.find(
      (item) => item.id === treeId,
    ) as SkillTree;
    const v5Bundle = {
      app: "Striker" as const,
      schema_version: 5 as const,
      exported_at: "2026-01-01T00:00:00.000Z",
      goals: [{ ...goal, archived_at: null }],
      entries: [],
      weekly_reviews: [],
      flashcards: [],
      skills: [],
      entry_skills: [],
      skill_trees: [tree],
      skill_nodes: [
        {
          id: 1,
          tree_id: treeId,
          external_id: "v5-root",
          parent_id: null,
          name: "V5 root",
          description: null,
          order_index: 1,
          tags: [],
          estimated_hours: 0,
          resources: [],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      entry_skill_nodes: [],
      milestones: [],
      milestone_entries: [],
      entry_evidence: [],
      settings: {},
    };

    const summary = await restoreBundle(v5Bundle);
    expect(summary.goals).toBe(1);
    expect((await getSkills()).map((node) => node.name)).toEqual(["V5 root"]);
    expect((await getGoals())[0].archived_at).toBeNull();
  });
});

describe("multi-goal selection", () => {
  it("honours the active goal, then the default, then the newest", async () => {
    const first = await createGoal({
      title: "First",
      description: null,
      startDate: "2026-03-01",
      weeklyHoursGoal: 0,
      successCriteria: null,
    });
    const second = await createGoal({
      title: "Second",
      description: null,
      startDate: "2026-03-01",
      weeklyHoursGoal: 0,
      successCriteria: null,
    });

    expect((await getActiveGoal())?.id).toBe(second.id);

    await saveSetting(SETTING_KEYS.activeGoal, String(first.id));
    expect((await getActiveGoal())?.id).toBe(first.id);

    await saveSetting(SETTING_KEYS.activeGoal, "");
    await saveSetting(SETTING_KEYS.defaultGoal, String(first.id));
    expect((await getActiveGoal())?.id).toBe(first.id);

    await archiveGoal(first.id);
    expect((await getGoals()).map((goal) => goal.title)).toEqual(["Second"]);
    expect((await getActiveGoal())?.id).toBe(second.id);
  });
});
