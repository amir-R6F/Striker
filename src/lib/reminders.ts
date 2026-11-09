import { formatMinutes, fromKey } from "./dates";
import type { ReminderSnapshot } from "./types";

export type ReminderKind = "weekly" | "passive" | "inactivity";

export interface ReminderMessage {
  kind: ReminderKind;
  title: string;
  body: string;
}

/**
 * Picks at most one reminder for today. Weekly review wins on Sunday, then the
 * passive-streak nudge, then inactivity. Only one notification is ever sent per
 * day (the caller stores `reminder_last_sent`).
 */
export function pickReminder(
  snapshot: ReminderSnapshot,
  today: string,
): ReminderMessage | null {
  const isEndOfWeek = fromKey(today).getDay() === 0;

  if (
    isEndOfWeek &&
    !snapshot.weeklyReviewSaved &&
    snapshot.weekEntries > 0
  ) {
    return {
      kind: "weekly",
      title: "Weekly review time",
      body: `${snapshot.weekEntries} ${
        snapshot.weekEntries === 1 ? "entry" : "entries"
      } and ${formatMinutes(
        snapshot.weekMinutes,
      )} logged this week. Capture what worked while it is fresh.`,
    };
  }

  if (
    snapshot.daysSinceEntry != null &&
    snapshot.daysSinceEntry <= 1 &&
    snapshot.passiveOnlyDays >= 3
  ) {
    return {
      kind: "passive",
      title: "Turn input into practice",
      body: `${snapshot.passiveOnlyDays} days of only watching and reading. Pick one small hands-on exercise today and log the evidence.`,
    };
  }

  if (snapshot.daysSinceEntry != null && snapshot.daysSinceEntry >= 2) {
    return {
      kind: "inactivity",
      title: "A small session keeps it going",
      body: `No learning logged for ${snapshot.daysSinceEntry} days. Ten focused minutes is enough to restart.`,
    };
  }

  return null;
}
