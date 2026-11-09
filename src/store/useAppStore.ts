import { create } from "zustand";
import { getActiveGoal, loadSettings, saveSetting } from "../lib/db";
import { SETTING_KEYS, type Settings } from "../lib/settings";
import { applyTheme, type Theme } from "../lib/theme";
import type { FlashcardDraft, Goal } from "../lib/types";

export type Tab =
  | "log"
  | "dashboard"
  | "search"
  | "skills"
  | "review"
  | "settings";
export type ToastTone = "success" | "error";
export type ReviewMode = "cards" | "weekly";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppState {
  ready: boolean;
  error: string | null;
  tab: Tab;
  theme: Theme;
  visible: boolean;
  goal: Goal | null;
  settings: Settings;
  /** Bumped after every write so data views refetch. */
  revision: number;
  /** Bumped when the quick log should take focus. */
  quickLogNonce: number;
  reviewMode: ReviewMode;
  /** A card handed over by Search; consumed by the Review tab. */
  flashcardDraft: FlashcardDraft | null;
  toast: Toast | null;
  hydrate: (retry?: boolean) => Promise<void>;
  setTab: (tab: Tab) => void;
  setTheme: (theme: Theme) => void;
  setVisible: (visible: boolean) => void;
  setGoal: (goal: Goal | null) => void;
  setSetting: (key: string, value: string) => Promise<void>;
  bumpRevision: () => void;
  requestQuickLog: () => void;
  setReviewMode: (mode: ReviewMode) => void;
  openFlashcardDraft: (draft: Omit<FlashcardDraft, "nonce">) => void;
  clearFlashcardDraft: () => void;
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

let hydratePromise: Promise<void> | null = null;
let toastSequence = 0;

async function performHydrate(
  set: (partial: Partial<AppState>) => void,
): Promise<void> {
  try {
    const [settings, goal] = await Promise.all([loadSettings(), getActiveGoal()]);
    const theme: Theme = settings[SETTING_KEYS.theme] === "light" ? "light" : "dark";
    applyTheme(theme);
    set({ settings, goal, theme, ready: true, error: null });
  } catch (error) {
    set({
      ready: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  error: null,
  tab: "log",
  theme: "dark",
  visible: true,
  goal: null,
  settings: {},
  revision: 0,
  quickLogNonce: 0,
  reviewMode: "cards",
  flashcardDraft: null,
  toast: null,

  hydrate: async (retry = false) => {
    if (retry) {
      hydratePromise = null;
      set({ error: null, ready: false });
    }
    if (!hydratePromise) {
      hydratePromise = performHydrate(set);
    }
    return hydratePromise;
  },

  setTab: (tab) => set({ tab }),

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    void get().setSetting(SETTING_KEYS.theme, theme);
  },

  setVisible: (visible) => set({ visible }),

  setGoal: (goal) => set({ goal }),

  setSetting: async (key, value) => {
    set((state) => ({ settings: { ...state.settings, [key]: value } }));
    try {
      await saveSetting(key, value);
    } catch (error) {
      console.error("Failed to persist setting", key, error);
      get().notify("Could not save setting", "error");
    }
  },

  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),

  requestQuickLog: () =>
    set((state) => ({ tab: "log", quickLogNonce: state.quickLogNonce + 1 })),

  setReviewMode: (reviewMode) => set({ reviewMode }),

  openFlashcardDraft: (draft) =>
    set((state) => ({
      tab: "review",
      reviewMode: "cards",
      flashcardDraft: { ...draft, nonce: (state.flashcardDraft?.nonce ?? 0) + 1 },
    })),

  clearFlashcardDraft: () => set({ flashcardDraft: null }),

  notify: (message, tone = "success") =>
    set({ toast: { id: (toastSequence += 1), message, tone } }),

  dismissToast: (id) =>
    set((state) => (state.toast?.id === id ? { toast: null } : state)),
}));
