export interface TreeRow {
  id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  struck_today: number;
}

export interface NodeRow {
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
}

export interface NodeView extends NodeRow {
  externalId: string;
  depth: number;
  percent: number;
  children: NodeView[];
}

export interface StrikeNodeRow {
  node_id: string;
}

export type Settings = Record<string, string>;

export type ThemeChoice = "light" | "dark" | "system";
