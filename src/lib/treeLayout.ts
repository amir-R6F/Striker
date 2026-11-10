import type { NodeView } from "./types";

export const NODE_W = 96;
export const NODE_H = 64;
export const H_GAP = 14;
export const V_GAP = 44;

// The progress ring sits above the card inside the same vertical cell.
export const CARD_TOP = 40;
export const RING_R = 20;
export const RING_CY = RING_R;

export interface TreeLayoutNode {
  node: NodeView;
  x: number;
  y: number;
}

export interface TreeLayoutEdge {
  parentId: string;
  childId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: TreeLayoutNode[];
  edges: TreeLayoutEdge[];
  width: number;
  height: number;
  maxDepth: number;
}

/**
 * Lays out only visible nodes. A node's children are visible only while the
 * node is in `expanded`; collapsed subtrees never reach the result.
 */
export function layoutTree(
  roots: NodeView[],
  expanded: ReadonlySet<string>,
): TreeLayout {
  if (roots.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0, maxDepth: 0 };
  }

  const cursor = { x: 0 };
  const nodes: TreeLayoutNode[] = [];
  const edges: TreeLayoutEdge[] = [];
  let maxDepth = 0;

  const place = (node: NodeView, depth: number): TreeLayoutNode => {
    const item: TreeLayoutNode = {
      node,
      x: 0,
      y: depth * (NODE_H + V_GAP),
    };
    maxDepth = Math.max(maxDepth, depth);
    // Pre-order so DOM focus order matches depth-first reading order.
    nodes.push(item);

    const children = expanded.has(node.id) ? node.children : [];
    if (children.length === 0) {
      item.x = cursor.x;
      cursor.x += NODE_W + H_GAP;
      return item;
    }

    const placed = children.map((child) => place(child, depth + 1));
    const first = placed[0];
    const last = placed[placed.length - 1];
    item.x = (first.x + last.x) / 2;

    for (const child of placed) {
      edges.push({
        parentId: node.id,
        childId: child.node.id,
        x1: item.x + NODE_W / 2,
        y1: item.y + CARD_TOP + NODE_H,
        x2: child.x + NODE_W / 2,
        y2: child.y + CARD_TOP,
      });
    }
    return item;
  };

  for (const root of roots) place(root, 0);

  return {
    nodes,
    edges,
    width: Math.max(0, cursor.x - H_GAP),
    height: maxDepth >= 0 ? (maxDepth + 1) * (NODE_H + V_GAP) : 0,
    maxDepth,
  };
}
