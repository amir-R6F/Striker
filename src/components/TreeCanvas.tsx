import { useEffect, useMemo, useState } from "react";
import {
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CARD_TOP,
  NODE_H,
  NODE_W,
  RING_CY,
  RING_R,
  layoutTree,
} from "../lib/treeLayout";
import { showCounts as showCountsSetting } from "../lib/settings";
import type { NodeView } from "../lib/types";
import { useMiniStore } from "../store/useMiniStore";
import { cx } from "./ui";

const SELECTED = "hsl(200, 80%, 60%)";
const BLUE = "hsl(200, 70%, 55%)";
const GREEN = "hsl(140, 60%, 45%)";
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const NODE_HEIGHT = CARD_TOP + NODE_H;

interface TreeNodeData extends Record<string, unknown> {
  nodeId: string;
  node: NodeView;
  percent: number;
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
  const color = percent >= 100 ? GREEN : BLUE;
  const dimmed =
    data.hasChildren && !data.expanded && data.percent === 0;
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
        "tree-node-card relative cursor-pointer outline-none",
        data.selected && "tree-node-selected",
        data.pulse && "tree-node-pulse",
      )}
      style={{ width: NODE_W, height: NODE_HEIGHT }}
    >
      <svg
        width={NODE_W}
        height={CARD_TOP}
        viewBox={`0 0 ${NODE_W} ${CARD_TOP}`}
        className="block overflow-visible text-ink"
        aria-hidden="true"
      >
        <circle
          cx={NODE_W / 2}
          cy={RING_CY}
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeOpacity={dimmed ? 0.12 : 0.2}
        />
        {percent > 0 ? (
          <circle
            cx={NODE_W / 2}
            cy={RING_CY}
            r={RING_R}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${NODE_W / 2} ${RING_CY})`}
          />
        ) : null}
        {data.struckRecently ? (
          <circle
            cx={NODE_W / 2}
            cy={RING_CY - RING_R - 2.5}
            r={2.4}
            fill="var(--accent)"
          />
        ) : null}
      </svg>

      <div
        className={cx(
          "tree-node-body absolute inset-x-0 rounded-xl border bg-card transition",
          "hover:brightness-105",
          data.selected
            ? "border-[hsl(200,80%,60%)] shadow-[0_0_6px_hsl(200,80%,60%)]"
            : "border-line",
        )}
        style={{ top: CARD_TOP, height: NODE_H }}
      >
        <p className="line-clamp-2 px-2 pt-[13px] text-center text-[11px] font-medium leading-[1.25]">
          {data.node.title}
        </p>

        {data.hasChildren ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1 text-[9px] leading-none text-muted"
          >
            {data.expanded ? "▾" : "▸"}
          </span>
        ) : null}

        {data.showCounts && data.strikeCount > 0 ? (
          <span className="absolute bottom-1 right-1.5 rounded-full border border-line bg-card2 px-1.5 py-px text-[8px] font-semibold leading-[11px] text-muted">
            ×{data.strikeCount}
          </span>
        ) : null}
      </div>

      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!pointer-events-none !h-1.5 !w-1.5 !border-0 !bg-accent"
        style={{ top: CARD_TOP }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!pointer-events-none !h-1.5 !w-1.5 !border-0 !bg-accent"
        style={{ bottom: 0 }}
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
  return (
    <BaseEdge
      path={path}
      className={cx("tree-edge-path", Boolean(data?.flash) && "tree-edge-flash")}
      style={{ stroke: "var(--line)", strokeWidth: 1.5, strokeOpacity: 0.55 }}
    />
  );
}

const EDGE_TYPES = { tree: TreeEdge };

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

  useEffect(() => {
    if (!strikePulse) return;
    setPulsing(new Set(strikePulse.ids));
    const timeout = window.setTimeout(() => setPulsing(new Set()), 400);
    return () => window.clearTimeout(timeout);
  }, [strikePulse]);

  const flowNodes = useMemo<MiniFlowNode[]>(
    () =>
      layout.nodes.map(({ node, x, y }) => ({
        id: node.id,
        type: "mini",
        position: { x, y },
        data: {
          nodeId: node.id,
          node,
          percent: node.percent,
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
      })),
    [layout, draft, expanded, pulsing, showCounts, toggleExpand, toggleNode],
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
    <div className="mini-flow h-full min-h-0 w-full">
      <ReactFlow
        key={treeId ?? "empty"}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        selectionOnDrag={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.6}
        maxZoom={1.4}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onInit={(instance) => {
          window.requestAnimationFrame(() => {
            void instance.fitView({ padding: 0.2, duration: 300 });
          });
        }}
        onNodeClick={(_, node) => {
          const data = node.data as TreeNodeData;
          data.onActivate();
        }}
        style={{ background: "transparent" }}
      />
    </div>
  );
}
