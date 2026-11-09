export const SETTING_KEYS = {
  theme: "theme",
  autoStart: "auto_start",
  idleHideEnabled: "idle_hide_enabled",
  idleHideMinutes: "idle_hide_minutes",
  gamification: "gamification_enabled",
  challenge: "challenge_enabled",
  challengeStart: "challenge_start",
  reminders: "reminders_enabled",
  doNotDisturb: "do_not_disturb",
  reminderLastSent: "reminder_last_sent",
  reminderWakeHour: "reminder_wake_hour",
  reminderInactivity: "reminder_inactivity",
  reminderPassive: "reminder_passive",
  reminderWeekly: "reminder_weekly",
  pomodoroFocus: "pomodoro_focus_minutes",
  pomodoroBreak: "pomodoro_break_minutes",
  aiProvider: "ai_provider",
  aiBaseUrl: "ai_base_url",
  aiModel: "ai_model",
  aiApiKey: "ai_api_key",
  syncKind: "sync_kind",
  syncFolder: "sync_folder",
  syncWebdavUrl: "sync_webdav_url",
  syncWebdavUser: "sync_webdav_user",
  syncWebdavPassword: "sync_webdav_password",
  syncFileName: "sync_file_name",
  activeSkillTree: "active_skill_tree_id",
  activeGoal: "active_goal_id",
  defaultGoal: "default_goal_id",
  deviceKey: "secret_device_key",
} as const;

export const DEFAULT_IDLE_MINUTES = 5;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 60;

export const DEFAULT_POMODORO_FOCUS_MINUTES = 25;
export const DEFAULT_POMODORO_BREAK_MINUTES = 5;
export const MIN_POMODORO_MINUTES = 1;
export const MAX_POMODORO_MINUTES = 180;

export const DEFAULT_SYNC_FILE_NAME = "striker-backup.striker";
export const DEFAULT_REMINDER_WAKE_HOUR = 9;

export type Settings = Record<string, string>;
export type AiProvider = "ollama" | "openai";
export type SyncKind = "folder" | "webdav";

export function isIdleHideEnabled(settings: Settings): boolean {
  return settings[SETTING_KEYS.idleHideEnabled] !== "false";
}

export function idleHideMinutes(settings: Settings): number {
  const parsed = Number(settings[SETTING_KEYS.idleHideMinutes] ?? DEFAULT_IDLE_MINUTES);
  if (!Number.isFinite(parsed)) return DEFAULT_IDLE_MINUTES;
  return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(parsed)));
}

export function isAutoStartEnabled(settings: Settings): boolean {
  return settings[SETTING_KEYS.autoStart] === "true";
}

export function isGamificationEnabled(settings: Settings): boolean {
  return settings[SETTING_KEYS.gamification] !== "false";
}

export function isChallengeEnabled(settings: Settings): boolean {
  return settings[SETTING_KEYS.challenge] === "true";
}

export function challengeStart(settings: Settings): string | null {
  return settings[SETTING_KEYS.challengeStart] || null;
}

export function areRemindersEnabled(settings: Settings): boolean {
  return settings[SETTING_KEYS.reminders] !== "false";
}

export function isDoNotDisturb(settings: Settings): boolean {
  return settings[SETTING_KEYS.doNotDisturb] === "true";
}

/** The local hour (0-23) when the Rust scheduler runs its daily checks. */
export function reminderWakeHour(settings: Settings): number {
  const parsed = Number(settings[SETTING_KEYS.reminderWakeHour]);
  if (!Number.isFinite(parsed)) return DEFAULT_REMINDER_WAKE_HOUR;
  return Math.min(23, Math.max(0, Math.round(parsed)));
}

export type ReminderCategory = "inactivity" | "passive" | "weekly";

const REMINDER_CATEGORY_KEYS: Record<ReminderCategory, string> = {
  inactivity: SETTING_KEYS.reminderInactivity,
  passive: SETTING_KEYS.reminderPassive,
  weekly: SETTING_KEYS.reminderWeekly,
};

export function isReminderCategoryEnabled(
  settings: Settings,
  category: ReminderCategory,
): boolean {
  return settings[REMINDER_CATEGORY_KEYS[category]] !== "false";
}

export function settingId(settings: Settings, key: string): number | null {
  const parsed = Number(settings[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function activeGoalSetting(settings: Settings): number | null {
  return settingId(settings, SETTING_KEYS.activeGoal);
}

export function defaultGoalSetting(settings: Settings): number | null {
  return settingId(settings, SETTING_KEYS.defaultGoal);
}

function pomodoroMinutes(
  settings: Settings,
  key: string,
  fallback: number,
): number {
  const parsed = Number(settings[key] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(
    MAX_POMODORO_MINUTES,
    Math.max(MIN_POMODORO_MINUTES, Math.round(parsed)),
  );
}

export function pomodoroFocusMinutes(settings: Settings): number {
  return pomodoroMinutes(
    settings,
    SETTING_KEYS.pomodoroFocus,
    DEFAULT_POMODORO_FOCUS_MINUTES,
  );
}

export function pomodoroBreakMinutes(settings: Settings): number {
  return pomodoroMinutes(
    settings,
    SETTING_KEYS.pomodoroBreak,
    DEFAULT_POMODORO_BREAK_MINUTES,
  );
}

export function aiProvider(settings: Settings): AiProvider {
  return settings[SETTING_KEYS.aiProvider] === "openai" ? "openai" : "ollama";
}

export function aiModel(
  settings: Settings,
  provider: AiProvider = aiProvider(settings),
): string {
  const configured = settings[SETTING_KEYS.aiModel]?.trim();
  if (configured) return configured;
  return provider === "openai" ? "gpt-4o-mini" : "llama3.1";
}

export function aiBaseUrl(
  settings: Settings,
  provider: AiProvider = aiProvider(settings),
): string {
  const configured = settings[SETTING_KEYS.aiBaseUrl]?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return provider === "openai"
    ? "https://api.openai.com/v1"
    : "http://localhost:11434";
}

export function syncKind(settings: Settings): SyncKind {
  return settings[SETTING_KEYS.syncKind] === "webdav" ? "webdav" : "folder";
}

export function syncFileName(settings: Settings): string {
  return settings[SETTING_KEYS.syncFileName]?.trim() || DEFAULT_SYNC_FILE_NAME;
}

const SENSITIVE_SETTING_KEYS = new Set<string>([
  SETTING_KEYS.deviceKey,
  SETTING_KEYS.aiApiKey,
  SETTING_KEYS.syncWebdavPassword,
]);

/** Plain JSON/CSV exports must never carry encrypted secrets or their key. */
export function isSensitiveSettingKey(key: string): boolean {
  return SENSITIVE_SETTING_KEYS.has(key);
}
