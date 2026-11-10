import { useState } from "react";
import { useMiniStore } from "../store/useMiniStore";
import { formatLongDay } from "../lib/dates";
import { showCounts as showCountsSetting } from "../lib/settings";
import type { NodeView } from "../lib/types";
import {
  BoltIcon,
  CheckIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FlameIcon,
} from "./icons";
import { CreateTreeDialog } from "./CreateTreeDialog";
import { ImportSheet } from "./ImportSheet";
import { Button, IconButton, Select, cx } from "./ui";

export function FocusScreen() {
  const trees = useMiniStore((state) => state.trees);
  const activeTree = useMiniStore((state) => state.activeTree);
  const activeTreeId = useMiniStore((state) => state.activeTreeId);
  const roots = useMiniStore((state) => state.roots);
  const today = useMiniStore((state) => state.today);
  const streak = useMiniStore((state) => state.streak);
  const pulse = useMiniStore((state) => state.streakPulse);
  const strikeDates = useMiniStore((state) => state.strikeDates);
  const editing = useMiniStore((state) => state.editing);
  const selectTree = useMiniStore((state) => state.selectTree);
  const strike = useMiniStore((state) => state.strike);
  const openSettings = useMiniStore((state) => state.openSettings);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const hasToday = strikeDates.includes(today);
  const label = editing
    ? "Update strike"
    : hasToday
      ? "✓ Struck today — edit"
      : "⚡ Strike today";

  return (
    <div className="flex h-full flex-col">
      <header
        data-tauri-drag-region
        className="flex h-[52px] shrink-0 items-center gap-1.5 px-3"
      >
        <div
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-card px-2"
          title={`${streak} day streak`}
          aria-label={`${streak} day streak`}
        >
          <FlameIcon className="h-4 w-4 text-accent" />
          <span
            className={cx(
              "min-w-[14px] text-center text-[12px] font-semibold tabular-nums",
              pulse && "streak-pop",
            )}
          >
            {streak}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {trees.length > 0 ? (
            <Select
              value={activeTreeId ?? ""}
              onChange={(event) => void selectTree(event.target.value)}
              aria-label="Selected tree"
              className="h-7 border-0 bg-transparent px-1 text-[12px] font-medium hover:bg-card2/60"
            >
              {trees.map((tree) => (
                <option key={tree.id} value={tree.id}>
                  {tree.struck_today ? "✓ " : ""}
                  {tree.title}
                </option>
              ))}
            </Select>
          ) : (
            <p className="truncate text-center text-[12px] font-medium text-muted">
              Striker Mini
            </p>
          )}
        </div>

        <IconButton label="Settings" onClick={openSettings}>
          <EllipsisIcon className="h-4 w-4" />
        </IconButton>
      </header>

      <div className="flex items-baseline justify-between px-4 pb-1.5 pt-1">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
          Today
        </h2>
        <span className="text-[10.5px] text-muted">{formatLongDay(today)}</span>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!activeTree ? (
          <EmptyTrees
            onCreate={() => setCreating(true)}
            onImport={() => setImporting(true)}
          />
        ) : roots.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[13px] font-semibold">This tree is empty</p>
            <p className="max-w-[260px] text-[11px] leading-relaxed text-muted">
              Import a schema-v1 roadmap into “{activeTree.title}”.
            </p>
            <Button
              className="h-9 px-3 text-[11.5px]"
              onClick={() => setImporting(true)}
            >
              Import roadmap
            </Button>
          </div>
        ) : (
          <div className="space-y-px">
            {roots.map((node) => (
              <TreeRowItem key={node.id} node={node} />
            ))}
          </div>
        )}
      </main>

      <footer className="shrink-0 p-3 pt-1">
        <Button
          className={cx(
            "h-12 w-full text-[13px]",
            hasToday && !editing && "bg-success/15 text-success hover:bg-success/20",
          )}
          onClick={() => void strike()}
          disabled={!activeTree}
        >
          {label}
        </Button>
      </footer>

      <CreateTreeDialog open={creating} onClose={() => setCreating(false)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function EmptyTrees({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-on-accent">
        <FlameIcon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[13px] font-semibold">No trees yet</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Import one or start from an empty tree.
        </p>
      </div>
      <div className="w-full max-w-[280px] space-y-2">
        <Button className="h-10 w-full" onClick={onImport}>
          <BoltIcon className="h-4 w-4" />
          Import tree (JSON)
        </Button>
        <Button variant="subtle" className="h-10 w-full" onClick={onCreate}>
          Create blank tree
        </Button>
      </div>
    </div>
  );
}

function TreeRowItem({ node }: { node: NodeView }) {
  const collapsed = useMiniStore((state) => state.collapsed.has(node.id));
  const checked = useMiniStore((state) => state.draft.has(node.id));
  const showCounts = useMiniStore((state) =>
    showCountsSetting(state.settings),
  );
  const toggleExpand = useMiniStore((state) => state.toggleExpand);
  const toggleNode = useMiniStore((state) => state.toggleNode);

  const hasChildren = node.children.length > 0;
  const indent = 12 + node.depth * 16;
  const percent = Math.max(0, Math.min(100, node.percent));

  const meta = (
    <>
      {showCounts ? (
        <span className="shrink-0 rounded-md bg-card2/80 px-1.5 py-0.5 text-[9.5px] tabular-nums text-muted">
          {node.strike_count}×
        </span>
      ) : null}
      <span className="h-1 w-[54px] shrink-0 overflow-hidden rounded-full bg-card2">
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right text-[9.5px] tabular-nums text-muted">
        {node.percent}%
      </span>
    </>
  );

  if (hasChildren) {
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleExpand(node.id)}
          aria-expanded={!collapsed}
          className="flex h-9 w-full items-center gap-1.5 rounded-md pr-2 text-left transition hover:bg-card2/55"
          style={{ paddingLeft: `${indent}px` }}
        >
          <ChevronRightIcon
            className={cx(
              "h-3 w-3 shrink-0 text-muted transition-transform",
              !collapsed && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
            {node.title}
          </span>
          {meta}
        </button>
        {!collapsed
          ? node.children.map((child) => (
              <TreeRowItem key={child.id} node={child} />
            ))
          : null}
      </div>
    );
  }

  return (
    <div
      className="flex h-9 items-center gap-1.5 rounded-md pr-2 transition hover:bg-card2/55"
      style={{ paddingLeft: `${indent}px` }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${checked ? "Uncheck" : "Check"} ${node.title}`}
        onClick={() => toggleNode(node.id)}
        className={cx(
          "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border transition",
          checked
            ? "border-accent bg-accent text-on-accent"
            : "border-line bg-card2/30 text-transparent hover:border-muted",
        )}
      >
        <CheckIcon className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        onClick={() => toggleNode(node.id)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[12px]">{node.title}</span>
        {meta}
      </button>
    </div>
  );
}
