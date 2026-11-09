import { useEffect } from "react";
import { getReminderSnapshot } from "../lib/db";
import { todayKey } from "../lib/dates";
import { sendLocalNotification } from "../lib/notifications";
import { pickReminder } from "../lib/reminders";
import {
  SETTING_KEYS,
  areRemindersEnabled,
  isDoNotDisturb,
} from "../lib/settings";
import { useAppStore } from "../store/useAppStore";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const INITIAL_DELAY_MS = 4_000;

/**
 * Checks for a reminder only while the widget is visible. The store keeps the
 * last-sent day, so at most one notification goes out per day; hiding or
 * closing the widget tears the timer down, and do-not-disturb short-circuits
 * the whole hook.
 */
export function useSmartReminders(active: boolean): void {
  const goal = useAppStore((state) => state.goal);
  const settings = useAppStore((state) => state.settings);
  const revision = useAppStore((state) => state.revision);
  const setSetting = useAppStore((state) => state.setSetting);

  const enabled = areRemindersEnabled(settings) && !isDoNotDisturb(settings);
  const lastSent = settings[SETTING_KEYS.reminderLastSent] ?? "";

  useEffect(() => {
    if (!active || !enabled || !goal) return;

    let cancelled = false;
    let running = false;

    async function check(): Promise<void> {
      if (cancelled || running || !goal) return;
      running = true;
      try {
        const today = todayKey();
        if (lastSent === today) return;

        const snapshot = await getReminderSnapshot(goal.id, today);
        const reminder = pickReminder(snapshot, today);
        if (!reminder || cancelled) return;

        const sent = await sendLocalNotification(reminder.title, reminder.body);
        if (!sent || cancelled) return;
        await setSetting(SETTING_KEYS.reminderLastSent, today);
      } catch (error) {
        console.warn("Smart reminder check failed", error);
      } finally {
        running = false;
      }
    }

    const initial = window.setTimeout(() => void check(), INITIAL_DELAY_MS);
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [active, enabled, goal, lastSent, revision, setSetting]);
}
