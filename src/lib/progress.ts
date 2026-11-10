import { addDays } from "./dates";
import type { NodeRow, NodeView } from "./types";

/**
 * Computes the flattened tree used by Focus. Parent rows average their direct
 * children's percentages recursively; leaves fill 25% per strike.
 */
export function buildViews(rows: NodeRow[]): {
  roots: NodeView[];
  flat: NodeView[];
} {
  const byId = new Map<string, NodeView>();
  for (const row of rows) {
    byId.set(row.id, {
      ...row,
      externalId: row.id.slice(row.tree_id.length + 1),
      depth: 0,
      percent: 0,
      children: [],
    });
  }

  const roots: NodeView[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortSiblings = (nodes: NodeView[]) => {
    nodes.sort(
      (a, b) =>
        a.order_index - b.order_index || a.title.localeCompare(b.title),
    );
    for (const node of nodes) sortSiblings(node.children);
  };
  sortSiblings(roots);

  const flat: NodeView[] = [];
  const visit = (node: NodeView, depth: number) => {
    node.depth = depth;
    flat.push(node);
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);

  const computePercent = (node: NodeView): number => {
    if (node.children.length === 0) {
      node.percent = Math.min(100, node.strike_count * 25);
    } else {
      const total = node.children.reduce(
        (sum, child) => sum + computePercent(child),
        0,
      );
      node.percent = Math.round(total / node.children.length);
    }
    return node.percent;
  };
  for (const root of roots) computePercent(root);

  return { roots, flat };
}

/** Consecutive days ending today, or yesterday when today is not struck yet. */
export function computeStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Minutes for a strike: estimated hours of checked leaves, else 15. */
export function strikeMinutes(
  nodes: Array<Pick<NodeRow, "estimated_hours">>,
): number {
  const totalHours = nodes.reduce(
    (sum, node) => sum + Number(node.estimated_hours ?? 0),
    0,
  );
  return totalHours > 0 ? Math.max(1, Math.round(totalHours * 60)) : 15;
}
