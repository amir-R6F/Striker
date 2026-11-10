import { create } from "zustand";
import {
  createBlankTree,
  exportNodes,
  importRoadmap,
  loadSettings,
  loadStrikeDates,
  loadTreeNodes,
  loadTrees,
  removeStrike,
  saveSetting,
  treeSource,
  writeStrike,
  type ImportMode,
} from "../lib/db";
import { addDays, todayKey } from "../lib/dates";
import { isAutoStartEnabled, setAutoStart } from "../lib/autostart";
import { databasePath, writeExportFile } from "../lib/export";
import {
  buildRoadmap,
  roadmapFileName,
  type ParsedRoadmap,
  type RoadmapSource,
} from "../lib/roadmap";
import {
  SETTING_KEYS,
  idleHideMinutes,
  onboardingSkipped,
  themeChoice,
} from "../lib/settings";
import {
  buildViews,
  computeStreak,
  strikeMinutes,
} from "../lib/progress";
import type { NodeView, Settings, ThemeChoice, TreeRow } from "../lib/types";

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface MiniState {
  ready: boolean;
  booting: boolean;
  error: string | null;
  trees: TreeRow[];
  activeTreeId: string | null;
  activeTree: TreeRow | null;
  roots: NodeView[];
  flat: NodeView[];
  strikeDates: string[];
  streak: number;
  today: string;
  draft: Set<string>;
  collapsed: Set<string>;
  editing: boolean;
  settings: Settings;
  settingsOpen: boolean;
  onboardSkipped: boolean;
  visible: boolean;
  dbPath: string;
  toast: Toast | null;
  streakPulse: boolean;

  hydrate: (force?: boolean) => Promise<void>;
  selectTree: (treeId: string) => Promise<void>;
  toggleNode: (nodeId: string) => void;
  toggleExpand: (nodeId: string) => void;
  beginEdit: () => void;
  strike: () => Promise<void>;
  createTree: (title: string) => Promise<void>;
  importTree: (
    mode: ImportMode,
    roadmap: ParsedRoadmap,
  ) => Promise<string>;
  exportTree: () => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;
  updateSetting: (key: string, value: string) => Promise<void>;
  setTheme: (choice: ThemeChoice) => Promise<void>;
  setIdleMinutes: (minutes: number) => Promise<void>;
  toggleShowCounts: () => Promise<void>;
  toggleAutoStart: (enabled: boolean) => Promise<void>;
  skipOnboarding: () => Promise<void>;
  setVisible: (visible: boolean) => void;
  notify: (message: string, kind?: ToastKind) => void;
  dismissToast: () => void;
}

let toastSequence = 1;

function defaultCollapsed(flat: NodeView[]): Set<string> {
  const byId = new Map(flat.map((node) => [node.id, node]));
  const expanded = new Set<string>();
  for (const node of flat) {
    if (!node.recent) continue;
    let cursor: NodeView | undefined = node;
    while (cursor) {
      expanded.add(cursor.id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
  }
  return new Set(
    flat
      .filter((node) => node.children.length > 0 && !expanded.has(node.id))
      .map((node) => node.id),
  );
}

function expandAncestors(
  collapsed: Set<string>,
  nodes: NodeView[],
  flat: NodeView[],
): Set<string> {
  const byId = new Map(flat.map((node) => [node.id, node]));
  const next = new Set(collapsed);
  for (const node of nodes) {
    let cursor: NodeView | undefined = node;
    while (cursor) {
      next.delete(cursor.id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
  }
  return next;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useMiniStore = create<MiniState>((set, get) => {
  async function loadTreeData(
    treeId: string,
    trees: TreeRow[],
    resetExpansion: boolean,
  ): Promise<void> {
    const today = todayKey();
    const yesterday = addDays(today, -1);
    const [rows, dates] = await Promise.all([
      loadTreeNodes(treeId, today, yesterday),
      loadStrikeDates(treeId),
    ]);
    const { roots, flat } = buildViews(rows);
    set({
      today,
      roots,
      flat,
      strikeDates: dates,
      streak: computeStreak(dates, today),
      activeTreeId: treeId,
      activeTree: trees.find((tree) => tree.id === treeId) ?? null,
      draft: new Set(),
      editing: false,
      ...(resetExpansion ? { collapsed: defaultCollapsed(flat) } : {}),
    });
  }

  return {
    ready: false,
    booting: false,
    error: null,
    trees: [],
    activeTreeId: null,
    activeTree: null,
    roots: [],
    flat: [],
    strikeDates: [],
    streak: 0,
    today: todayKey(),
    draft: new Set(),
    collapsed: new Set(),
    editing: false,
    settings: {},
    settingsOpen: false,
    onboardSkipped: false,
    visible: true,
    dbPath: __STRIKER_BROWSER__
      ? "localStorage: striker-mini-browser-db"
      : "sqlite:striker-mini.db",
    toast: null,
    streakPulse: false,

    hydrate: async (force = false) => {
      if (get().booting && !force) return;
      set({ booting: true, error: null });

      try {
        let settings = await loadSettings();
        try {
          const enabled = await isAutoStartEnabled();
          const value = enabled ? "true" : "false";
          if (settings[SETTING_KEYS.autoStart] !== value) {
            settings = { ...settings, [SETTING_KEYS.autoStart]: value };
            await saveSetting(SETTING_KEYS.autoStart, value);
          }
        } catch (error) {
          console.warn("Could not read autostart setting", error);
        }

        const today = todayKey();
        const trees = await loadTrees(today);
        const preferred = settings[SETTING_KEYS.activeTree] ?? "";
        const active =
          trees.find((tree) => tree.id === preferred) ?? trees[0] ?? null;

        set({
          settings,
          onboardSkipped: onboardingSkipped(settings),
          trees,
          today,
        });

        if (active) {
          await loadTreeData(active.id, trees, true);
        } else {
          set({
            activeTree: null,
            activeTreeId: null,
            roots: [],
            flat: [],
            strikeDates: [],
            streak: 0,
            draft: new Set(),
            collapsed: new Set(),
            editing: false,
          });
        }

        let dbPath = "sqlite:striker-mini.db";
        try {
          dbPath = await databasePath();
        } catch (error) {
          console.warn("Could not read database path", error);
        }

        set({ ready: true, booting: false, dbPath });
      } catch (error) {
        set({ error: messageFor(error), booting: false, ready: false });
      }
    },

    selectTree: async (treeId) => {
      try {
        const trees = get().trees;
        await loadTreeData(treeId, trees, true);
        if (!get().trees.some((tree) => tree.id === treeId)) {
          set({ trees: await loadTrees(todayKey()) });
        }
        await saveSetting(SETTING_KEYS.activeTree, treeId);
      } catch (error) {
        get().notify(messageFor(error), "error");
      }
    },

    toggleNode: (nodeId) => {
      const node = get().flat.find((item) => item.id === nodeId);
      if (!node || node.children.length > 0) return;
      const draft = new Set(get().draft);
      if (draft.has(nodeId)) draft.delete(nodeId);
      else draft.add(nodeId);
      set({ draft });
    },

    toggleExpand: (nodeId) => {
      const collapsed = new Set(get().collapsed);
      if (collapsed.has(nodeId)) collapsed.delete(nodeId);
      else collapsed.add(nodeId);
      set({ collapsed });
    },

    beginEdit: () => {
      const { flat, draft, collapsed, editing } = get();
      if (editing) return;
      const checked = flat.filter(
        (node) => node.struck_today && node.children.length === 0,
      );
      const nextDraft = new Set(draft);
      for (const node of checked) nextDraft.add(node.id);
      set({
        editing: true,
        draft: nextDraft,
        collapsed: expandAncestors(collapsed, checked, flat),
        settingsOpen: false,
      });
    },

    strike: async () => {
      const state = get();
      const { activeTreeId, activeTree, today, strikeDates, draft, editing } =
        state;
      if (!activeTreeId || !activeTree) return;
      const hasToday = strikeDates.includes(today);

      if (!editing && hasToday) {
        state.beginEdit();
        return;
      }

      if (draft.size === 0) {
        if (editing && hasToday) {
          if (
            !window.confirm(
              "Remove today's strike? The day's progress will be cleared.",
            )
          ) {
            return;
          }
          try {
            await removeStrike(activeTreeId, today);
            const trees = await loadTrees(today);
            set({ trees });
            await loadTreeData(activeTreeId, trees, false);
            state.notify("Today's strike was removed", "info");
          } catch (error) {
            state.notify(messageFor(error), "error");
          }
        } else {
          state.notify("Check at least one node first", "error");
        }
        return;
      }

      const minutes = strikeMinutes(
        state.flat.filter((node) => draft.has(node.id)),
      );
      const previousStreak = state.streak;

      try {
        await writeStrike(activeTreeId, today, minutes, [...draft]);
        const trees = await loadTrees(today);
        set({ trees });
        await loadTreeData(activeTreeId, trees, false);
        const nextStreak = get().streak;
        if (nextStreak > previousStreak) {
          set({ streakPulse: true });
          window.setTimeout(() => set({ streakPulse: false }), 320);
        }
        state.notify(
          editing ? "Strike updated" : `Day struck — ${minutes} min`,
          "success",
        );
      } catch (error) {
        state.notify(messageFor(error), "error");
      }
    },

    createTree: async (title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      try {
        const id = await createBlankTree(trimmed);
        const trees = await loadTrees(todayKey());
        const settings = get().settings;
        await saveSetting(SETTING_KEYS.activeTree, id);
        set({
          trees,
          settings,
          onboardSkipped: true,
        });
        await loadTreeData(id, trees, true);
        get().notify("Tree created", "success");
      } catch (error) {
        get().notify(messageFor(error), "error");
      }
    },

    importTree: async (mode, roadmap) => {
      const state = get();
      try {
        const target =
          mode === "append" ? null : (state.activeTreeId ?? null);
        const treeId = await importRoadmap(mode, roadmap, target);
        const trees = await loadTrees(todayKey());
        await saveSetting(SETTING_KEYS.activeTree, treeId);
        set({ trees, onboardSkipped: true });
        await loadTreeData(treeId, trees, true);
        state.notify(
          mode === "append" ? "Tree imported" : "Roadmap imported",
          "success",
        );
        return treeId;
      } catch (error) {
        state.notify(messageFor(error), "error");
        throw error;
      }
    },

    exportTree: async () => {
      const state = get();
      if (!state.activeTree) {
        state.notify("There is no tree to export", "error");
        return;
      }
      try {
        const nodes = await exportNodes(state.activeTree.id);
        const rawSource = await treeSource(state.activeTree.id);
        const source: RoadmapSource =
          rawSource === "manual" || rawSource === "ai" ? rawSource : "imported";
        const roadmap = buildRoadmap({
          title: state.activeTree.title,
          description: state.activeTree.description ?? "",
          source,
          createdAt: state.activeTree.created_at,
          nodes,
        });
        const fileName = roadmapFileName(state.activeTree.title);
        const path = await writeExportFile(
          fileName,
          JSON.stringify(roadmap, null, 2),
        );
        state.notify(
          __STRIKER_BROWSER__
            ? `Exported ${fileName}`
            : `Roadmap exported to ${path}`,
          "success",
        );
      } catch (error) {
        state.notify(messageFor(error), "error");
      }
    },

    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),

    updateSetting: async (key, value) => {
      set({ settings: { ...get().settings, [key]: value } });
      try {
        await saveSetting(key, value);
      } catch (error) {
        get().notify(messageFor(error), "error");
      }
    },

    setTheme: async (choice) => {
      await get().updateSetting(SETTING_KEYS.theme, choice);
    },

    setIdleMinutes: async (minutes) => {
      const value = String(Math.min(60, Math.max(1, Math.round(minutes))));
      await get().updateSetting(SETTING_KEYS.idleHideMinutes, value);
    },

    toggleShowCounts: async () => {
      await get().updateSetting(
        SETTING_KEYS.showCounts,
        get().settings[SETTING_KEYS.showCounts] === "false" ? "true" : "false",
      );
    },

    toggleAutoStart: async (enabled) => {
      try {
        await setAutoStart(enabled);
        await get().updateSetting(
          SETTING_KEYS.autoStart,
          enabled ? "true" : "false",
        );
        get().notify(
          enabled ? "Auto-start enabled" : "Auto-start disabled",
          "success",
        );
      } catch (error) {
        get().notify(messageFor(error), "error");
      }
    },

    skipOnboarding: async () => {
      set({ onboardSkipped: true });
      try {
        await saveSetting(SETTING_KEYS.onboardingSkipped, "true");
      } catch (error) {
        console.warn("Could not save onboarding state", error);
      }
    },

    setVisible: (visible) => set({ visible }),

    notify: (message, kind = "info") => {
      const id = toastSequence++;
      set({ toast: { id, message, kind } });
      window.setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 2800);
    },

    dismissToast: () => set({ toast: null }),
  };
});

export function selectTheme(settings: Settings): ThemeChoice {
  return themeChoice(settings);
}

export function selectIdleMinutes(settings: Settings): number {
  return idleHideMinutes(settings);
}
