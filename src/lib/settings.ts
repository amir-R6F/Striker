import type { Settings, ThemeChoice } from "./types";

export const SETTING_KEYS = {
  theme: "theme",
  idleHideMinutes: "idle_hide_minutes",
  showCounts: "show_counts",
  autoStart: "auto_start",
  activeTree: "active_tree_id",
  onboardingSkipped: "onboarding_skipped",
} as const;

export const DEFAULT_IDLE_MINUTES = 5;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 60;

export function themeChoice(settings: Settings): ThemeChoice {
  const value = settings[SETTING_KEYS.theme];
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function idleHideMinutes(settings: Settings): number {
  const parsed = Number(
    settings[SETTING_KEYS.idleHideMinutes] ?? DEFAULT_IDLE_MINUTES,
  );
  if (!Number.isFinite(parsed)) return DEFAULT_IDLE_MINUTES;
  return Math.min(
    MAX_IDLE_MINUTES,
    Math.max(MIN_IDLE_MINUTES, Math.round(parsed)),
  );
}

export function showCounts(settings: Settings): boolean {
  return settings[SETTING_KEYS.showCounts] !== "false";
}

export function autoStartEnabled(settings: Settings): boolean {
  return settings[SETTING_KEYS.autoStart] === "true";
}

export function onboardingSkipped(settings: Settings): boolean {
  return settings[SETTING_KEYS.onboardingSkipped] === "true";
}

export function treeSourceKey(treeId: string): string {
  return `tree_source:${treeId}`;
}
