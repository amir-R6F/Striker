import { useEffect, useMemo, useRef, useState } from "react";
import {
  CARD_TOP,
  NODE_H,
  NODE_W,
  RING_CY,
  RING_R,
  layoutTree,
  type TreeLayoutEdge,
} from "../lib/treeLayout";
import { showCounts as showCountsSetting } from "../lib/settings";
import type { NodeView } from "../lib/types";
import { useMiniStore } from "../store/useMiniStore";
import { cx } from "./ui";

const SELECTED = "hsl(200, 80%, 60%)";
const BLUE = "hsl(200, 70%, 55%)";
const GREEN = "hsl(140, 60%, 45%)";
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

export function TreeCanvas() {
  const roots = useMiniStore((state) => state.roots);
  const flat = useMiniStore((state) => state.flat);
  const treeId = useMiniStore((state) => state.activeTreeId);
  const collapsed = useMiniStore((state) => state.collapsed);
  const draft = useMiniStore((state) => state.draft);
  const showCounts = useMiniStore((state) =>
    showCountsSetting(state.settings),
  );
  const strikePulse = useMiniStore((state) => state.strikePulse);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

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
    // Viewport width is included because the wrapper's usable width decides
    // whether the SVG scrolls, even though positions are content-driven.
    () => layoutTree(roots, expanded),
    [treeId, roots, expanded, viewportWidth],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!strikePulse) return;
    setPulsing(new Set(strikePulse.ids));
    const timeout = window.setTimeout(() => setPulsing(new Set()), 400);
    return () => window.clearTimeout(timeout);
  }, [strikePulse]);

  const svgWidth = Math.max(layout.width, Math.max(0, viewportWidth - 24));
  const overflow = layout.width > Math.max(0, viewportWidth - 24);
  const height = Math.max(layout.height, 120);

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={containerRef}
        className="tree-scroll h-full overflow-auto px-3 pb-5 pt-1"
      >
        <svg
          width={svgWidth}
          height={height}
          viewBox={`0 0 ${svgWidth} ${height}`}
          className="block overflow-visible text-ink"
          aria-label="Skill tree"
        >
          <g className="tree-edges">
            {layout.edges.map((edge) => (
              <TreeEdge
                key={`${edge.parentId}-${edge.childId}`}
                edge={edge}
                flashing={
                  pulsing.has(edge.parentId) || pulsing.has(edge.childId)
                }
              />
            ))}
          </g>
          <g className="tree-nodes">
            {layout.nodes.map(({ node, x, y }) => (
              <TreeNode
                key={node.id}
                node={node}
                x={x}
                y={y}
                expanded={expanded.has(node.id)}
                selected={draft.has(node.id)}
                pulsing={pulsing.has(node.id)}
                showCounts={showCounts}
              />
            ))}
          </g>
        </svg>
      </div>
      {overflow ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-bg to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-bg to-transparent" />
        </>
      ) : null}
    </div>
  );
}

function TreeEdge({
  edge,
  flashing,
}: {
  edge: TreeLayoutEdge;
  flashing: boolean;
}) {
  const mid = (edge.y1 + edge.y2) / 2;
  return (
    <path
      d={`M ${edge.x1},${edge.y1} C ${edge.x1},${mid} ${edge.x2},${mid} ${edge.x2},${edge.y2}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeOpacity={0.35}
      className={cx("tree-edge", flashing && "tree-edge-flash")}
    />
  );
}

function TreeNode({
  node,
  x,
  y,
  expanded,
  selected,
  pulsing,
  showCounts,
}: {
  node: NodeView;
  x: number;
  y: number;
  expanded: boolean;
  selected: boolean;
  pulsing: boolean;
  showCounts: boolean;
}) {
  const toggleExpand = useMiniStore((state) => state.toggleExpand);
  const toggleNode = useMiniStore((state) => state.toggleNode);

  const isParent = node.children.length > 0;
  const emptyParent = isParent && !expanded && node.percent === 0;
  const percent = Math.max(0, Math.min(100, node.percent));
  const color = percent >= 100 ? GREEN : BLUE;
  const lines = splitTitle(node.title);
  const [line1, line2] = lines;
  const action = isParent
    ? `${expanded ? "Collapse" : "Expand"} ${node.title}`
    : `${selected ? "Uncheck" : "Check"} ${node.title}`;

  const activate = () => {
    if (isParent) toggleExpand(node.id);
    else toggleNode(node.id);
  };

  return (
    <g
      transform={`translate(${x}, ${y})`}
      role="button"
      tabIndex={0}
      aria-label={action}
      aria-expanded={isParent ? expanded : undefined}
      aria-pressed={isParent ? undefined : selected}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate();
      }}
      className={cx(
        "tree-node cursor-pointer",
        selected && "tree-node-selected",
        pulsing && "tree-node-pulse",
        emptyParent && "tree-node-empty",
      )}
    >
      <g className="tree-node-scale">
        <circle
        cx={NODE_W / 2}
        cy={RING_CY}
        r={RING_R}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeOpacity={emptyParent ? 0.12 : 0.2}
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

      {node.recent && !emptyParent ? (
        <circle
          cx={NODE_W / 2}
          cy={RING_CY - RING_R + 1}
          r={2.4}
          fill="var(--accent)"
        />
      ) : null}

      <rect
        className="tree-card"
        x={0}
        y={CARD_TOP}
        width={NODE_W}
        height={NODE_H}
        rx={12}
        fill="var(--card)"
        stroke={selected ? SELECTED : "var(--border)"}
        strokeWidth={selected ? 1.6 : 1}
      />

      <text
        textAnchor="middle"
        fill="var(--ink)"
        fontSize={11}
        fontWeight={500}
        className="pointer-events-none"
      >
        {line2 ? (
          <>
            <tspan x={NODE_W / 2} y={CARD_TOP + 27}>
              {line1}
            </tspan>
            <tspan x={NODE_W / 2} y={CARD_TOP + 41}>
              {line2}
            </tspan>
          </>
        ) : (
          <tspan x={NODE_W / 2} y={CARD_TOP + 36}>
            {line1}
          </tspan>
        )}
      </text>

      {isParent ? (
        <path
          d={
            expanded
              ? "M82 45 l8 0 l-4 6 z"
              : "M83 44 l6 4 l-6 4 z"
          }
          fill="currentColor"
          opacity={0.5}
          className="pointer-events-none"
        />
      ) : null}

      {showCounts && node.strike_count > 0 && !emptyParent ? (
        <StrikeBadge
          count={node.strike_count}
          x={NODE_W - 4}
          y={CARD_TOP + NODE_H - 3}
        />
        ) : null}
      </g>
    </g>
  );
}

function StrikeBadge({
  count,
  x,
  y,
}: {
  count: number;
  x: number;
  y: number;
}) {
  const label = `×${count}`;
  const width = 8 + label.length * 5.2;
  return (
    <g transform={`translate(${x - width}, ${y - 12})`} className="pointer-events-none">
      <rect
        width={width}
        height={12}
        rx={6}
        fill="var(--card-2)"
        stroke="var(--border)"
        strokeWidth={0.6}
      />
      <text
        x={width / 2}
        y={8.4}
        textAnchor="middle"
        fontSize={8}
        fontWeight={600}
        fill="var(--muted)"
      >
        {label}
      </text>
    </g>
  );
}

function splitTitle(title: string): [string] | [string, string] {
  const clean = title.trim().replace(/\s+/g, " ");
  if (!clean) return ["Untitled"];
  if (clean.length <= 14) return [clean];

  const words = clean.split(" ");
  let first = "";
  const rest: string[] = [];
  for (const word of words) {
    if (rest.length === 0) {
      const candidate = first ? `${first} ${word}` : word;
      if (candidate.length <= 14) {
        first = candidate;
        continue;
      }
    }
    rest.push(word);
  }

  if (!first) first = clean.slice(0, 13).trimEnd();
  let second = rest.join(" ");
  if (second.length > 14) second = `${second.slice(0, 13).trimEnd()}…`;
  return second ? [first, second] : [first];
}
