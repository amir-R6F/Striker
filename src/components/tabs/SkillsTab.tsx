import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  appendSkillTreeFromRoadmap,
  createSkill,
  createSkillTree,
  deleteSkill,
  deleteSkillTree,
  ensureSkillTree,
  getRecentEntries,
  getSkillEntryIds,
  getSkillStats,
  getSkills,
  getSkillTrees,
  mergeSkillTreeFromRoadmap,
  moveSkill,
  reorderSiblings,
  replaceSkillTreeFromRoadmap,
  setSkillEntryLinks,
  updateSkill,
  updateSkillTree,
} from "../../lib/db";
import { formatMinutes } from "../../lib/dates";
import { SETTING_KEYS } from "../../lib/settings";
import type {
  EntryOption,
  Skill,
  SkillResource,
  SkillTree,
  SkillWithStats,
} from "../../lib/types";
import type { ParsedRoadmap } from "../../lib/skillTree";
import { useAppStore } from "../../store/useAppStore";
import { EmptyGoal } from "../GoalSetup";
import { ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from "../icons";
import { SkillImportExport, type ImportMode } from "../skills/SkillImportExport";
import { Button, Card, Field, IconButton, Segmented, TextArea, TextInput, cx } from "../ui";

const SkillRoadmapFlow = lazy(() => import("../skills/SkillRoadmapFlow"));
const ROADMAP_ROW_HEIGHT = 48;
const ROADMAP_VIEWPORT = 350;

interface Aggregate {
  minutes: number;
  entries: number;
}

function sortNodes(nodes: Skill[]): Skill[] {
  return [...nodes].sort(
    (a, b) =>
      a.order_index - b.order_index ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function aggregateStats(
  node: Skill,
  childrenOf: Map<number | null, Skill[]>,
  statsById: Map<number, Aggregate>,
  memo: Map<number, Aggregate>,
): Aggregate {
  const cached = memo.get(node.id);
  if (cached) return cached;
  const own = statsById.get(node.id) ?? { minutes: 0, entries: 0 };
  let minutes = own.minutes;
  let entries = own.entries;
  for (const child of childrenOf.get(node.id) ?? []) {
    const childStats = aggregateStats(child, childrenOf, statsById, memo);
    minutes += childStats.minutes;
    entries += childStats.entries;
  }
  const value = { minutes, entries };
  memo.set(node.id, value);
  return value;
}

function descendantsOf(id: number, childrenOf: Map<number | null, Skill[]>): Set<number> {
  const found = new Set<number>();
  const visit = (parent: number) => {
    for (const child of childrenOf.get(parent) ?? []) {
      if (found.has(child.id)) continue;
      found.add(child.id);
      visit(child.id);
    }
  };
  visit(id);
  return found;
}

function flattenRoadmap(
  nodes: Skill[],
  childrenOf: Map<number | null, Skill[]>,
  statsById: Map<number, Aggregate>,
  memo: Map<number, Aggregate>,
  parentId: number | null = null,
  depth = 0,
): Array<{ node: Skill; depth: number; aggregate: Aggregate }> {
  const rows: Array<{ node: Skill; depth: number; aggregate: Aggregate }> = [];
  for (const node of sortNodes(childrenOf.get(parentId) ?? [])) {
    rows.push({
      node,
      depth,
      aggregate: aggregateStats(node, childrenOf, statsById, memo),
    });
    rows.push(
      ...flattenRoadmap(nodes, childrenOf, statsById, memo, node.id, depth + 1),
    );
  }
  return rows;
}

function parseResources(value: string): SkillResource[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [first, ...rest] = line.split("|");
      const title = rest.length > 0 ? first.trim() : first.trim();
      const url = rest.length > 0 ? rest.join("|").trim() : first.trim();
      return url ? { title: title || url, url } : null;
    })
    .filter((item): item is SkillResource => Boolean(item));
}

function resourcesText(resources: SkillResource[]): string {
  return resources.map((item) => `${item.title} | ${item.url}`).join("\n");
}

function entryLabel(entry: EntryOption): string {
  const text = entry.action ?? entry.learned ?? entry.text;
  return text.length > 64 ? `${text.slice(0, 63)}…` : text;
}

function RoadmapList({
  rows,
  selectedId,
  onSelect,
  onDrop,
}: {
  rows: Array<{ node: Skill; depth: number; aggregate: Aggregate }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDrop: (sourceId: number, targetId: number) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.max(0, Math.floor(scrollTop / ROADMAP_ROW_HEIGHT) - 4);
  const visibleCount = Math.ceil(ROADMAP_VIEWPORT / ROADMAP_ROW_HEIGHT) + 8;
  const end = Math.min(rows.length, start + visibleCount);
  const slice = rows.slice(start, end);

  return (
    <div
      className="overflow-y-auto rounded-xl border border-line bg-card"
      style={{ height: ROADMAP_VIEWPORT }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        style={{
          height: rows.length * ROADMAP_ROW_HEIGHT,
          position: "relative",
        }}
      >
        <div style={{ transform: `translateY(${start * ROADMAP_ROW_HEIGHT}px)` }}>
          {slice.map(({ node, depth, aggregate }) => (
            <div
              key={node.id}
              draggable
              onDragStart={(event: DragEvent<HTMLDivElement>) => {
                event.dataTransfer.setData("text/plain", String(node.id));
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const source = Number(event.dataTransfer.getData("text/plain"));
                if (Number.isFinite(source) && source !== node.id) {
                  onDrop(source, node.id);
                }
              }}
              onClick={() => onSelect(node.id)}
              style={{ height: ROADMAP_ROW_HEIGHT, paddingLeft: 8 + depth * 14 }}
              className={cx(
                "flex cursor-pointer items-center gap-1.5 border-b border-line/60 pr-2 transition",
                selectedId === node.id
                  ? "bg-accent/10"
                  : "hover:bg-card2/60",
              )}
            >
              <span className="cursor-grab select-none text-[10px] text-muted" aria-hidden>
                ⠿
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
                {node.name}
              </span>
              <span className="shrink-0 text-[9px] tabular-nums text-muted">
                {formatMinutes(aggregate.minutes)} · {aggregate.entries}
              </span>
              <ChevronRightIcon className="h-3 w-3 shrink-0 text-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkillsTab({ active }: { active: boolean }) {
  const goal = useAppStore((state) => state.goal);
  const visible = useAppStore((state) => state.visible);
  const revision = useAppStore((state) => state.revision);
  const settings = useAppStore((state) => state.settings);
  const setSetting = useAppStore((state) => state.setSetting);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);

  const [trees, setTrees] = useState<SkillTree[]>([]);
  const [nodes, setNodes] = useState<Skill[]>([]);
  const [stats, setStats] = useState<SkillWithStats[]>([]);
  const [treeId, setTreeId] = useState<number | null>(null);
  const [view, setView] = useState<"tree" | "roadmap">("tree");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [newRoot, setNewRoot] = useState("");
  const [newChild, setNewChild] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [treeEdit, setTreeEdit] = useState(false);
  const [treeTitle, setTreeTitle] = useState("");
  const [treeDescription, setTreeDescription] = useState("");

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftHours, setDraftHours] = useState("0");
  const [draftResources, setDraftResources] = useState("");

  const [recentEntries, setRecentEntries] = useState<EntryOption[]>([]);
  const [linkedEntryIds, setLinkedEntryIds] = useState<number[]>([]);

  useEffect(() => {
    if (!active || !visible || !goal) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      let loadedTrees = await getSkillTrees(goal.id);
      if (loadedTrees.length === 0) {
        await ensureSkillTree(goal.id, `${goal.title} roadmap`);
        loadedTrees = await getSkillTrees(goal.id);
      }
      const [allNodes, allStats] = await Promise.all([
        getSkills(),
        getSkillStats(goal.id),
      ]);
      if (cancelled) return;
      setTrees(loadedTrees);
      setNodes(allNodes);
      setStats(allStats);
      const saved = Number(settings[SETTING_KEYS.activeSkillTree]);
      const chosen =
        loadedTrees.find((tree) => tree.id === saved) ?? loadedTrees[0] ?? null;
      setTreeId((current) => {
        if (current != null && loadedTrees.some((tree) => tree.id === current)) {
          return current;
        }
        return chosen?.id ?? null;
      });
      if (chosen && chosen.id !== saved) {
        await setSetting(SETTING_KEYS.activeSkillTree, String(chosen.id));
      }
    })()
      .catch((error: unknown) => {
        console.error("Could not load the skill roadmap", error);
        if (!cancelled) notify("Could not load skill trees", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, goal, notify, revision, setSetting, settings, visible]);

  useEffect(() => {
    const tree = trees.find((item) => item.id === treeId);
    setTreeTitle(tree?.title ?? "");
    setTreeDescription(tree?.description ?? "");
  }, [treeId, trees]);

  const tree = trees.find((item) => item.id === treeId) ?? null;
  const treeNodes = useMemo(
    () => nodes.filter((node) => node.tree_id === treeId),
    [nodes, treeId],
  );
  const statsById = useMemo(
    () => new Map(stats.map((item) => [item.id, { minutes: item.minutes, entries: item.entries }])),
    [stats],
  );
  const childrenOf = useMemo(() => {
    const map = new Map<number | null, Skill[]>();
    for (const node of treeNodes) {
      const list = map.get(node.parent_id) ?? [];
      list.push(node);
      map.set(node.parent_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.order_index - b.order_index);
    return map;
  }, [treeNodes]);
  const aggregateMemo = useMemo(() => new Map<number, Aggregate>(), [treeNodes]);
  const selected = treeNodes.find((node) => node.id === selectedId) ?? null;
  const selectedAggregate = selected
    ? aggregateStats(selected, childrenOf, statsById, aggregateMemo)
    : null;
  const roadmapRows = useMemo(
    () => flattenRoadmap(treeNodes, childrenOf, statsById, new Map()),
    [childrenOf, statsById, treeNodes],
  );

  useEffect(() => {
    if (!selected) {
      setDraftTitle("");
      setDraftDescription("");
      setDraftTags("");
      setDraftHours("0");
      setDraftResources("");
      return;
    }
    setDraftTitle(selected.name);
    setDraftDescription(selected.description ?? "");
    setDraftTags(selected.tags.join(", "));
    setDraftHours(String(selected.estimated_hours || 0));
    setDraftResources(resourcesText(selected.resources));
  }, [selected]);

  useEffect(() => {
    if (!selected || !goal || !active || !visible) return;
    let cancelled = false;
    Promise.all([
      getRecentEntries(goal.id, 100),
      getSkillEntryIds(selected.id),
    ])
      .then(([entries, ids]) => {
        if (cancelled) return;
        setRecentEntries(entries);
        setLinkedEntryIds(ids);
      })
      .catch((error: unknown) => {
        console.warn("Could not load linked entries", error);
      });
    return () => {
      cancelled = true;
    };
  }, [active, goal, revision, selected, visible]);

  async function reload() {
    bumpRevision();
  }

  async function selectTree(id: number) {
    setTreeId(id);
    setSelectedId(null);
    setCollapsed(new Set());
    await setSetting(SETTING_KEYS.activeSkillTree, String(id));
  }

  async function handleAddTree() {
    if (!goal || busy) return;
    const name = window.prompt("Name of the new roadmap", "New roadmap");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const id = await createSkillTree({
        goalId: goal.id,
        title: name.trim(),
        description: null,
        source: "manual",
      });
      await setSetting(SETTING_KEYS.activeSkillTree, String(id));
      setTreeId(id);
      setSelectedId(null);
      await reload();
      notify("Roadmap created");
    } catch (error) {
      console.error("Could not create roadmap", error);
      notify("Could not create the roadmap", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTree(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tree) return;
    try {
      await updateSkillTree(tree.id, {
        title: treeTitle,
        description: treeDescription,
        source: tree.source,
      });
      setTreeEdit(false);
      await reload();
      notify("Roadmap details saved");
    } catch (error) {
      console.error("Could not update roadmap", error);
      notify("Could not save the roadmap", "error");
    }
  }

  async function handleDeleteTree() {
    if (!tree) return;
    if (
      !window.confirm(
        `Delete "${tree.title}" and all of its nodes? Entry links in this tree will be removed.`,
      )
    ) {
      return;
    }
    try {
      await deleteSkillTree(tree.id);
      setTreeId(null);
      setSelectedId(null);
      await reload();
      notify("Roadmap deleted");
    } catch (error) {
      console.error("Could not delete roadmap", error);
      notify("Could not delete the roadmap", "error");
    }
  }

  async function handleAddRoot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tree || !newRoot.trim() || busy) return;
    setBusy(true);
    try {
      const id = await createSkill({
        treeId: tree.id,
        parentId: null,
        title: newRoot.trim(),
        description: null,
        tags: [],
        estimatedHours: 0,
        resources: [],
      });
      setNewRoot("");
      setSelectedId(id);
      await reload();
      notify("Node added");
    } catch (error) {
      console.error("Could not add node", error);
      notify("Could not add the node", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddChild() {
    if (!tree || !selected || !newChild.trim() || busy) return;
    setBusy(true);
    try {
      const id = await createSkill({
        treeId: tree.id,
        parentId: selected.id,
        title: newChild.trim(),
        description: null,
        tags: [],
        estimatedHours: 0,
        resources: [],
      });
      setNewChild("");
      setCollapsed((current) => {
        const next = new Set(current);
        next.delete(selected.id);
        return next;
      });
      setSelectedId(id);
      await reload();
      notify("Child node added");
    } catch (error) {
      console.error("Could not add child", error);
      notify("Could not add the child node", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!draftTitle.trim()) {
      notify("A node needs a title", "error");
      return;
    }
    try {
      await updateSkill(selected.id, {
        title: draftTitle,
        description: draftDescription || null,
        tags: draftTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        estimatedHours: Math.max(0, Number(draftHours) || 0),
        resources: parseResources(draftResources),
      });
      await reload();
      notify("Node saved");
    } catch (error) {
      console.error("Could not save node", error);
      notify("Could not save the node", "error");
    }
  }

  async function handleMove(parentId: number | null) {
    if (!selected) return;
    try {
      await moveSkill(selected.id, parentId);
      await reload();
      notify("Node moved");
    } catch (error) {
      console.error("Could not move node", error);
      notify(error instanceof Error ? error.message : "Could not move the node", "error");
    }
  }

  async function handleDeleteNode() {
    if (!selected) return;
    const children = descendantsOf(selected.id, childrenOf);
    if (
      !window.confirm(
        children.size > 0
          ? `Delete "${selected.name}" and its ${children.size} descendant node(s)?`
          : `Delete "${selected.name}"?`,
      )
    ) {
      return;
    }
    try {
      await deleteSkill(selected.id);
      setSelectedId(null);
      await reload();
      notify("Node deleted");
    } catch (error) {
      console.error("Could not delete node", error);
      notify("Could not delete the node", "error");
    }
  }

  async function handleReorder(sourceId: number, targetId: number) {
    if (!tree) return;
    const source = treeNodes.find((node) => node.id === sourceId);
    const target = treeNodes.find((node) => node.id === targetId);
    if (!source || !target) return;
    try {
      if (source.parent_id !== target.parent_id) {
        await moveSkill(source.id, target.parent_id, target.order_index);
      } else {
        const siblings = sortNodes(
          treeNodes.filter((node) => node.parent_id === source.parent_id),
        ).map((node) => node.id);
        const from = siblings.indexOf(source.id);
        const to = siblings.indexOf(target.id);
        if (from < 0 || to < 0 || from === to) return;
        siblings.splice(from, 1);
        siblings.splice(to, 0, source.id);
        await reorderSiblings(tree.id, source.parent_id, siblings);
      }
      await reload();
    } catch (error) {
      console.error("Could not reorder node", error);
      notify("Could not reorder the node", "error");
    }
  }

  async function handleSaveLinks() {
    if (!selected) return;
    try {
      await setSkillEntryLinks(selected.id, linkedEntryIds);
      await reload();
      notify("Entry links saved");
    } catch (error) {
      console.error("Could not save entry links", error);
      notify("Could not save entry links", "error");
    }
  }

  async function handleImport(mode: ImportMode, roadmap: ParsedRoadmap) {
    if (!goal) return;
    if (mode === "append") {
      const id = await appendSkillTreeFromRoadmap(goal.id, roadmap);
      await setSetting(SETTING_KEYS.activeSkillTree, String(id));
      setTreeId(id);
      notify("Roadmap imported as a new tree");
    } else if (!tree) {
      throw new Error("Choose a roadmap first.");
    } else if (mode === "replace") {
      await replaceSkillTreeFromRoadmap(tree.id, roadmap);
      notify("Roadmap replaced");
    } else {
      await mergeSkillTreeFromRoadmap(tree.id, roadmap);
      notify("Roadmap merged");
    }
    setSelectedId(null);
    await reload();
  }

  if (!goal) {
    return (
      <div className="px-4 pb-4">
        <EmptyGoal message="Create your goal first, then build its skill roadmap." />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-5">
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold">Skill roadmap</h1>
            <p className="text-[10px] text-muted">
              {treeNodes.length} {treeNodes.length === 1 ? "node" : "nodes"} ·{" "}
              {formatMinutes(
                treeNodes.reduce(
                  (sum, node) => sum + (statsById.get(node.id)?.minutes ?? 0),
                  0,
                ),
              )}{" "}
              tagged
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {tree ? (
              <IconButton
                label="Edit roadmap details"
                onClick={() => setTreeEdit((value) => !value)}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </IconButton>
            ) : null}
            <Button
              variant="subtle"
              className="h-7 px-2 text-[10px]"
              onClick={() => void handleAddTree()}
              disabled={busy}
            >
              <PlusIcon className="h-3 w-3" /> Tree
            </Button>
          </div>
        </div>

        <div className="flex gap-1.5">
          <select
            value={treeId ?? ""}
            onChange={(event) => void selectTree(Number(event.target.value))}
            className="min-w-0 flex-1 rounded-lg border border-line bg-card2/60 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent/70"
            aria-label="Skill tree"
          >
            {trees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>

        {treeEdit && tree ? (
          <form onSubmit={(event) => void handleSaveTree(event)} className="space-y-2 border-t border-line pt-2">
            <Field label="Roadmap title" htmlFor="skill-tree-title">
              <TextInput
                id="skill-tree-title"
                value={treeTitle}
                onChange={(event) => setTreeTitle(event.target.value)}
                maxLength={100}
              />
            </Field>
            <Field label="Description" htmlFor="skill-tree-description">
              <TextArea
                id="skill-tree-description"
                value={treeDescription}
                onChange={(event) => setTreeDescription(event.target.value)}
                rows={2}
                maxLength={1_000}
              />
            </Field>
            <div className="flex items-center justify-between gap-2">
              <Button type="submit" className="h-7 px-2 text-[10px]">
                Save details
              </Button>
              <button
                type="button"
                onClick={() => void handleDeleteTree()}
                className="text-[10px] text-danger hover:underline"
              >
                Delete tree
              </button>
            </div>
          </form>
        ) : null}

        <Segmented
          value={view}
          options={[
            { value: "tree", label: "Tree" },
            { value: "roadmap", label: "Roadmap" },
          ]}
          onChange={setView}
        />
      </Card>

      {tree ? (
        <SkillImportExport
          tree={tree}
          nodes={treeNodes}
          stats={statsById}
          onImport={handleImport}
        />
      ) : null}

      {loading && treeNodes.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-[11.5px] text-muted">Loading roadmap…</p>
        </Card>
      ) : !tree ? (
        <Card>
          <p className="py-6 text-center text-[11.5px] leading-relaxed text-muted">
            Create a roadmap to start mapping skills.
          </p>
        </Card>
      ) : (
        <>
          {view === "tree" && active && visible ? (
            <Suspense
              fallback={
                <Card>
                  <p className="py-10 text-center text-[11.5px] text-muted">
                    Opening the roadmap…
                  </p>
                </Card>
              }
            >
              <SkillRoadmapFlow
                nodes={treeNodes}
                stats={statsById}
                collapsed={collapsed}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggle={(id) =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            </Suspense>
          ) : (
            <RoadmapList
              rows={roadmapRows}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDrop={(source, target) => void handleReorder(source, target)}
            />
          )}

          <form onSubmit={(event) => void handleAddRoot(event)} className="flex gap-1.5">
            <TextInput
              value={newRoot}
              onChange={(event) => setNewRoot(event.target.value)}
              placeholder="Add a root node…"
              maxLength={100}
              aria-label="New root node"
            />
            <Button
              type="submit"
              className="h-9 shrink-0 px-3"
              disabled={busy || !newRoot.trim()}
            >
              Add
            </Button>
          </form>

          {selected ? (
            <Card className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[12.5px] font-semibold">{selected.name}</p>
                  <p className="text-[10px] text-muted">
                    {formatMinutes(selectedAggregate?.minutes ?? 0)} ·{" "}
                    {selectedAggregate?.entries ?? 0} linked{" "}
                    {selectedAggregate?.entries === 1 ? "entry" : "entries"}
                  </p>
                </div>
                <IconButton label="Delete node" onClick={() => void handleDeleteNode()}>
                  <TrashIcon className="h-3.5 w-3.5 text-danger" />
                </IconButton>
              </div>

              <form onSubmit={(event) => void handleSaveNode(event)} className="space-y-2">
                <Field label="Title" htmlFor="node-title">
                  <TextInput
                    id="node-title"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    maxLength={100}
                  />
                </Field>
                <Field label="Description" htmlFor="node-description">
                  <TextArea
                    id="node-description"
                    value={draftDescription}
                    onChange={(event) => setDraftDescription(event.target.value)}
                    rows={2}
                    maxLength={1_500}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Tags" htmlFor="node-tags" hint="comma separated">
                    <TextInput
                      id="node-tags"
                      value={draftTags}
                      onChange={(event) => setDraftTags(event.target.value)}
                      maxLength={300}
                    />
                  </Field>
                  <Field label="Estimate" htmlFor="node-hours" hint="hours">
                    <TextInput
                      id="node-hours"
                      type="number"
                      min={0}
                      step={0.5}
                      value={draftHours}
                      onChange={(event) => setDraftHours(event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Resources" htmlFor="node-resources" hint="title | url">
                  <TextArea
                    id="node-resources"
                    value={draftResources}
                    onChange={(event) => setDraftResources(event.target.value)}
                    rows={2}
                    maxLength={1_500}
                    placeholder="Reference | https://example.com"
                  />
                </Field>
                <Button type="submit" className="h-8 w-full text-[11px]">
                  Save node
                </Button>
              </form>

              <div className="grid grid-cols-2 gap-2 border-t border-line pt-2">
                <Field label="Move under" htmlFor="node-parent">
                  <select
                    id="node-parent"
                    value={selected.parent_id ?? ""}
                    onChange={(event) =>
                      void handleMove(event.target.value ? Number(event.target.value) : null)
                    }
                    className="w-full rounded-lg border border-line bg-card2/60 px-2 py-2 text-[11px] text-ink outline-none"
                  >
                    <option value="">Root</option>
                    {treeNodes
                      .filter(
                        (node) =>
                          node.id !== selected.id &&
                          !descendantsOf(selected.id, childrenOf).has(node.id),
                      )
                      .map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Add child" htmlFor="node-child">
                  <div className="flex gap-1">
                    <TextInput
                      id="node-child"
                      value={newChild}
                      onChange={(event) => setNewChild(event.target.value)}
                      placeholder="Child title"
                      maxLength={100}
                      className="py-1.5 text-[11px]"
                    />
                    <Button
                      type="button"
                      variant="subtle"
                      className="h-8 shrink-0 px-2 text-[10px]"
                      disabled={!newChild.trim() || busy}
                      onClick={() => void handleAddChild()}
                    >
                      Add
                    </Button>
                  </div>
                </Field>
              </div>

              <details className="border-t border-line pt-2">
                <summary className="cursor-pointer text-[10.5px] font-medium text-muted">
                  Linked entries ({linkedEntryIds.length})
                </summary>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {recentEntries.length === 0 ? (
                    <p className="text-[10px] text-muted">No recent entries.</p>
                  ) : (
                    recentEntries.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex cursor-pointer items-start gap-1.5 rounded-md px-1 py-0.5 text-[10px] hover:bg-card2/60"
                      >
                        <input
                          type="checkbox"
                          checked={linkedEntryIds.includes(entry.id)}
                          onChange={(event) =>
                            setLinkedEntryIds((current) =>
                              event.target.checked
                                ? [...current, entry.id]
                                : current.filter((id) => id !== entry.id),
                            )
                          }
                          className="mt-0.5 accent-[var(--color-accent)]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{entryLabel(entry)}</span>
                          <span className="text-[9px] text-muted">{entry.date}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <Button
                  type="button"
                  variant="subtle"
                  className="mt-2 h-7 w-full text-[10px]"
                  onClick={() => void handleSaveLinks()}
                >
                  Save entry links
                </Button>
              </details>
            </Card>
          ) : (
            <Card>
              <p className="text-[11px] leading-relaxed text-muted">
                Select a node to edit it, add a child, link entries and see its
                rolled-up progress. Drag nodes in Roadmap view to reorder
                siblings.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
