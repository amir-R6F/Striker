import { describe, expect, it } from "vitest";
import {
  H_GAP,
  NODE_H,
  NODE_W,
  V_GAP,
  layoutTree,
} from "../src/lib/treeLayout";
import type { NodeView } from "../src/lib/types";

function node(
  id: string,
  children: NodeView[] = [],
  overrides: Partial<NodeView> = {},
): NodeView {
  return {
    id: `tree:${id}`,
    tree_id: "tree",
    parent_id: null,
    title: id,
    description: "",
    order_index: 1,
    estimated_hours: 0,
    strike_count: 0,
    struck_today: 0,
    recent: 0,
    externalId: id,
    depth: 0,
    percent: 0,
    children,
    ...overrides,
  };
}

function child(
  parent: NodeView,
  id: string,
  overrides: Partial<NodeView> = {},
): NodeView {
  const item = node(id, [], {
    parent_id: parent.id,
    ...overrides,
  });
  parent.children.push(item);
  return item;
}

describe("layoutTree", () => {
  it("places a single root leaf at the origin", () => {
    const leaf = node("solo");
    const layout = layoutTree([leaf], new Set());

    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]).toMatchObject({ x: 0, y: 0, node: leaf });
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBe(NODE_W);
    expect(layout.height).toBe(NODE_H + V_GAP);
  });

  it("centers two parents over their own pairs of children", () => {
    const first = node("first");
    const a = child(first, "a");
    const b = child(first, "b");
    const second = node("second");
    const c = child(second, "c");
    const d = child(second, "d");

    const layout = layoutTree(
      [first, second],
      new Set([first.id, second.id]),
    );
    const byId = new Map(layout.nodes.map((item) => [item.node.externalId, item]));

    expect(byId.get("a")?.x).toBe(0);
    expect(byId.get("b")?.x).toBe(NODE_W + H_GAP);
    expect(byId.get("first")?.x).toBe((0 + NODE_W + H_GAP) / 2);
    expect(byId.get("first")?.y).toBe(0);

    const secondStart = 2 * (NODE_W + H_GAP);
    expect(byId.get("c")?.x).toBe(secondStart);
    expect(byId.get("d")?.x).toBe(secondStart + NODE_W + H_GAP);
    expect(byId.get("second")?.x).toBe(
      (secondStart + secondStart + NODE_W + H_GAP) / 2,
    );
    expect(byId.get("a")?.y).toBe(NODE_H + V_GAP);

    expect(layout.edges).toHaveLength(4);
    expect(layout.edges[0]).toMatchObject({
      parentId: first.id,
      childId: a.id,
    });
  });

  it("returns only roots when nothing is expanded", () => {
    const root = node("root");
    child(root, "hidden");
    const sibling = node("sibling");

    const layout = layoutTree([root, sibling], new Set());

    expect(layout.nodes.map((item) => item.node.externalId)).toEqual([
      "root",
      "sibling",
    ]);
    expect(layout.edges).toEqual([]);
  });

  it("treats an expanded parent with no children as a leaf", () => {
    const parent = node("parent");
    const sibling = node("sibling");

    const layout = layoutTree(
      [parent, sibling],
      new Set([parent.id]),
    );

    expect(layout.nodes.find((item) => item.node === parent)?.x).toBe(0);
    expect(layout.nodes.find((item) => item.node === sibling)?.x).toBe(
      NODE_W + H_GAP,
    );
  });

  it("lays out nested expanded children at increasing depths", () => {
    const root = node("root");
    const branch = child(root, "branch");
    child(branch, "leaf");

    const layout = layoutTree(
      [root],
      new Set([root.id, branch.id]),
    );

    expect(
      layout.nodes.map((item) => [
        item.node.externalId,
        item.x,
        item.y,
      ]),
    ).toEqual([
      ["root", 0, 0],
      ["branch", 0, NODE_H + V_GAP],
      ["leaf", 0, 2 * (NODE_H + V_GAP)],
    ]);
    expect(layout.maxDepth).toBe(2);
  });
});
