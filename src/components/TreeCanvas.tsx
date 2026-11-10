import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatMinutes } from "../lib/dates";
import { NODE_W, layoutTree } from "../lib/treeLayout";
import { showCounts as showCountsSetting } from "../lib/settings";
import type { NodeView } from "../lib/types";
import { useMiniStore } from "../store/useMiniStore";
import { ChevronDownIcon, ChevronRightIcon } from "./icons";
import { cx } from "./ui";

interface Totals {
  hours: number;
  strikes: number;
}

interface TreeNodeData extends Record<string, unknown> {
  nodeId: string;
  node: NodeView;
  percent: number;
  totalHours: number;
  totalStrikes: number;
  strikeCount: number;
  selected: boolean;
  pulse: boolean;
  struckRecently: boolean;
  hasChildren: boolean;
  expanded: boolean;
  showCounts: boolean;
  onActivate: () => void;
}

type MiniFlowNode = Node<TreeNodeData, "mini">;

function TreeNodeCard({ data }: NodeProps<MiniFlowNode>) {
  const percent = Math.max(0, Math.min(100, data.percent));
  const roundedPercent = Math.round(percent);
  const strikeLabel = data.totalStrikes === 1 ? "strike" : "strikes";
  const action = data.hasChildren
    ? `${data.expanded ? "Collapse" : "Expand"} ${data.node.title}`
    : `${data.selected ? "Uncheck" : "Check"} ${data.node.title}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={action}
      aria-expanded={data.hasChildren ? data.expanded : undefined}
      aria-pressed={data.hasChildren ? undefined : data.selected}
      onClick={(event) => {
        event.stopPropagation();
        data.onActivate();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        data.onActivate();
      }}
      className={cx(
        "tree-node-card w-[178px] rounded-xl border bg-card px-2.5 py-2 text-left shadow-sm transition",
        data.selected
          ? "tree-node-selected border-accent ring-2 ring-accent/25"
          : "border-line hover:border-accent/50",
        data.pulse && "tree-node-pulse",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!pointer-events-none !h-1.5 !w-1.5 !border-0 !bg-accent"
      />

      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-semibold leading-snug">
              {data.node.title}
            </p>
            {data.struckRecently ? (
              <span
                aria-label="Struck in the last two days"
                title="Struck in the last two days"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
              />
            ) : null}
          </div>
          <p className="mt-0.5 text-[9px] tabular-nums text-muted">
            {formatMinutes(data.totalHours * 60)} · {data.totalStrikes}{" "}
            {strikeLabel}
          </p>
        </div>

        {data.hasChildren ? (
          <button
            type="button"
            aria-label={data.expanded ? "Collapse node" : "Expand node"}
            className="nodrag -mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-card2 hover:text-ink"
            onClick={(event) => {
              event.stopPropagation();
              data.onActivate();
            }}
          >
            {data.expanded ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-card2">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${roundedPercent}%` }}
          />
        </div>
        {data.showCounts && data.strikeCount > 0 ? (
          <span className="rounded-full border border-line bg-card2 px-1.5 py-px text-[8px] font-semibold leading-[11px] text-muted">
            ×{data.strikeCount}
          </span>
        ) : null}
        <span className="text-[8.5px] tabular-nums text-muted">
          {roundedPercent}%
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!pointer-events-none !h-1.5 !w-1.5 !border-0 !bg-accent"
      />
    </div>
  );
}

const NODE_TYPES = { mini: TreeNodeCard };

function TreeEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const flash = Boolean(data?.flash);
  return (
    <BaseEdge
      path={path}
      className="tree-edge-path"
      style={{
        stroke: flash ? "var(--accent)" : "var(--line)",
        strokeWidth: flash ? 2 : 1.5,
      }}
    />
  );
}

const EDGE_TYPES = { tree: TreeEdge };

function subtreeTotals(node: NodeView): Totals {
  let hours = Number(node.estimated_hours ?? 0);
  let strikes = Number(node.strike_count ?? 0);
  for (const child of node.children) {
    const childTotals = subtreeTotals(child);
    hours += childTotals.hours;
    strikes += childTotals.strikes;
  }
  return { hours, strikes };
}

export default function TreeCanvas() {
  const roots = useMiniStore((state) => state.roots);
  const flat = useMiniStore((state) => state.flat);
  const treeId = useMiniStore((state) => state.activeTreeId);
  const collapsed = useMiniStore((state) => state.collapsed);
  const draft = useMiniStore((state) => state.draft);
  const showCounts = useMiniStore((state) =>
    showCountsSetting(state.settings),
  );
  const strikePulse = useMiniStore((state) => state.strikePulse);
  const toggleNode = useMiniStore((state) => state.toggleNode);
  const toggleExpand = useMiniStore((state) => state.toggleExpand);
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());
  const [flow, setFlow] = useState<ReactFlowInstance<
    MiniFlowNode,
    Edge
  > | null>(null);

  const expanded = useMemo(
    () =>
      new Set(
        flat
          .filter(
            (node) => node.children.length > 0 && !collapsed.has(node.id),
          )
          .map((node) => node.id),
      ),
    [flat, collapsed],
  );

  const layout = useMemo(
    () => layoutTree(roots, expanded),
    [roots, expanded],
  );

  const totals = useMemo(() => {
    const values = new Map<string, Totals>();
    const visit = (node: NodeView) => {
      values.set(node.id, subtreeTotals(node));
      for (const child of node.children) visit(child);
    };
    for (const root of roots) visit(root);
    return values;
  }, [roots]);

  useEffect(() => {
    if (!strikePulse) return;
    setPulsing(new Set(strikePulse.ids));
    const timeout = window.setTimeout(() => setPulsing(new Set()), 400);
    return () => window.clearTimeout(timeout);
  }, [strikePulse]);

  useEffect(() => {
    if (!flow) return;
    const frame = window.requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.22, duration: 250 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flow, treeId, layout.nodes.length]);

  const flowNodes = useMemo<MiniFlowNode[]>(
    () =>
      layout.nodes.map(({ node, x, y }) => {
        const nodeTotals = totals.get(node.id) ?? {
          hours: Number(node.estimated_hours ?? 0),
          strikes: Number(node.strike_count ?? 0),
        };
        return {
          id: node.id,
          type: "mini",
          position: { x, y },
          width: NODE_W,
          data: {
            nodeId: node.id,
            node,
            percent: node.percent,
            totalHours: nodeTotals.hours,
            totalStrikes: nodeTotals.strikes,
            strikeCount: node.strike_count,
            selected: draft.has(node.id),
            pulse: pulsing.has(node.id),
            struckRecently: Boolean(node.recent),
            hasChildren: node.children.length > 0,
            expanded: expanded.has(node.id),
            showCounts,
            onActivate: () => {
              if (node.children.length > 0) toggleExpand(node.id);
              else toggleNode(node.id);
            },
          },
        };
      }),
    [
      layout,
      totals,
      draft,
      expanded,
      pulsing,
      showCounts,
      toggleExpand,
      toggleNode,
    ],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      layout.edges.map((edge) => ({
        id: `${edge.parentId}-${edge.childId}`,
        source: edge.parentId,
        target: edge.childId,
        type: "tree",
        animated: false,
        data: {
          flash:
            pulsing.has(edge.parentId) || pulsing.has(edge.childId),
        },
      })),
    [layout, pulsing],
  );

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-line bg-card2/20">
      <ReactFlow
        key={treeId ?? "empty"}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable
        selectionOnDrag={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.25}
        maxZoom={1.8}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        onInit={setFlow}
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
