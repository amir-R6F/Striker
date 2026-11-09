import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatMinutes } from "../../lib/dates";
import type { Skill } from "../../lib/types";
import { ChevronDownIcon, ChevronRightIcon } from "../icons";
import { cx } from "../ui";

interface FlowNodeData extends Record<string, unknown> {
  nodeId: number;
  label: string;
  minutes: number;
  entries: number;
  estimatedHours: number;
  collapsed: boolean;
  hasChildren: boolean;
  selected: boolean;
  onToggle: (id: number) => void;
}

type SkillFlowNode = Node<FlowNodeData, "skill">;

function SkillNodeCard({ data }: NodeProps<SkillFlowNode>) {
  const target = data.estimatedHours > 0 ? data.estimatedHours * 60 : 0;
  const progress = target > 0 ? Math.min(100, (data.minutes / target) * 100) : data.entries > 0 ? 100 : 0;
  return (
    <div
      className={cx(
        "w-[178px] rounded-xl border bg-card px-2.5 py-2 text-left shadow-sm transition",
        data.selected
          ? "border-accent ring-2 ring-accent/25"
          : "border-line hover:border-accent/50",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!h-1.5 !w-1.5 !border-0 !bg-accent"
      />
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-semibold leading-snug">
            {data.label}
          </p>
          <p className="mt-0.5 text-[9px] tabular-nums text-muted">
            {formatMinutes(data.minutes)} · {data.entries}{" "}
            {data.entries === 1 ? "entry" : "entries"}
          </p>
        </div>
        {data.hasChildren ? (
          <button
            type="button"
            aria-label={data.collapsed ? "Expand node" : "Collapse node"}
            className="nodrag -mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-card2 hover:text-ink"
            onClick={(event) => {
              event.stopPropagation();
              data.onToggle(data.nodeId);
            }}
          >
            {data.collapsed ? (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-card2">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(progress)}%` }}
          />
        </div>
        <span className="text-[8.5px] tabular-nums text-muted">
          {target > 0 ? `${Math.round(progress)}%` : `${data.entries}`}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!h-1.5 !w-1.5 !border-0 !bg-accent"
      />
    </div>
  );
}

const NODE_TYPES = { skill: SkillNodeCard };

interface Props {
  nodes: Skill[];
  stats: Map<number, { minutes: number; entries: number }>;
  collapsed: Set<number>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onToggle: (id: number) => void;
}

export default function SkillRoadmapFlow({
  nodes,
  stats,
  collapsed,
  selectedId,
  onSelect,
  onToggle,
}: Props) {
  const byParent = new Map<number | null, Skill[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name));
  }

  const aggregate = new Map<number, { minutes: number; entries: number }>();
  function sum(id: number): { minutes: number; entries: number } {
    const cached = aggregate.get(id);
    if (cached) return cached;
    const own = stats.get(id) ?? { minutes: 0, entries: 0 };
    let minutes = own.minutes;
    let entries = own.entries;
    for (const child of byParent.get(id) ?? []) {
      const childStats = sum(child.id);
      minutes += childStats.minutes;
      entries += childStats.entries;
    }
    const value = { minutes, entries };
    aggregate.set(id, value);
    return value;
  }

  const positions = new Map<number, { x: number; y: number }>();
  let cursor = 0;
  function layout(id: number, depth: number): number {
    const children = collapsed.has(id) ? [] : byParent.get(id) ?? [];
    if (children.length === 0) {
      const x = cursor * 210;
      cursor += 1;
      positions.set(id, { x, y: depth * 128 });
      return x;
    }
    const childXs = children.map((child) => layout(child.id, depth + 1));
    const x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    positions.set(id, { x, y: depth * 128 });
    return x;
  }
  for (const root of byParent.get(null) ?? []) {
    layout(root.id, 0);
    cursor += 1;
  }

  const visible = new Set(positions.keys());
  const flowNodes: SkillFlowNode[] = nodes
    .filter((node) => visible.has(node.id))
    .map((node) => {
      const totals = sum(node.id);
      const children = byParent.get(node.id) ?? [];
      return {
        id: String(node.id),
        type: "skill",
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        data: {
          nodeId: node.id,
          label: node.name,
          minutes: totals.minutes,
          entries: totals.entries,
          estimatedHours: node.estimated_hours,
          collapsed: collapsed.has(node.id),
          hasChildren: children.length > 0,
          selected: selectedId === node.id,
          onToggle,
        },
      };
    });

  const edges: Edge[] = [];
  for (const node of nodes) {
    if (node.parent_id == null || !visible.has(node.id) || !visible.has(node.parent_id)) {
      continue;
    }
    edges.push({
      id: `edge-${node.parent_id}-${node.id}`,
      source: String(node.parent_id),
      target: String(node.id),
      type: "smoothstep",
      style: { stroke: "var(--color-line)", strokeWidth: 1.5 },
    });
  }

  return (
    <div className="h-[360px] w-full overflow-hidden rounded-xl border border-line bg-card2/20">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.25}
        maxZoom={1.8}
        panOnDrag
        zoomOnScroll
        onNodeClick={(_, node) => onSelect(Number(node.id))}
        onPaneClick={() => onSelect(null)}
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
