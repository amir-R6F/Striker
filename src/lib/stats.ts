import { addDays, fromKey, todayKey } from "./dates";
import type { DailyRow } from "./types";

export interface CalendarCell {
  date: string;
  minutes: number;
  entries: number;
}

export interface StreakInfo {
  current: number;
  longest: number;
}

/**
 * Current streak counts back from today; if nothing is logged today yet, a
 * streak that includes yesterday is still considered alive.
 */
export function streakInfo(dates: string[], today = todayKey()): StreakInfo {
  const unique = new Set(dates);
  const anchor = unique.has(today) ? today : addDays(today, -1);

  let current = 0;
  let cursor = anchor;
  while (unique.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...unique].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of sorted) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  return { current, longest };
}

/** Builds the padded Monday-first grid for the last `days` days. */
export function buildCalendar(
  daily: DailyRow[],
  days = 90,
  today = todayKey(),
): Array<CalendarCell | null> {
  const byDate = new Map(daily.map((row) => [row.date, row]));
  const start = addDays(today, -(days - 1));
  const leading = (fromKey(start).getDay() + 6) % 7;
  const cells: Array<CalendarCell | null> = Array.from({ length: leading }, () => null);

  for (let index = 0; index < days; index += 1) {
    const date = addDays(start, index);
    const row = byDate.get(date);
    cells.push({
      date,
      minutes: row?.minutes ?? 0,
      entries: row?.entries ?? 0,
    });
  }

  return cells;
}

/** 0 = nothing logged, 1–4 = increasing activity. */
export function heatmapLevel(minutes: number, entries: number): 0 | 1 | 2 | 3 | 4 {
  if (entries === 0) return 0;
  if (minutes >= 90) return 4;
  if (minutes >= 45) return 3;
  if (minutes >= 20) return 2;
  return 1;
}

export function minutesThisWeek(daily: DailyRow[], weekStart: string): number {
  return daily
    .filter((row) => row.date >= weekStart)
    .reduce((sum, row) => sum + row.minutes, 0);
}

export function weekGoalProgress(
  daily: DailyRow[],
  weekStart: string,
  weeklyHoursGoal: number,
): { logged: number; goal: number; ratio: number } {
  const logged = minutesThisWeek(daily, weekStart);
  const goal = Math.max(0, weeklyHoursGoal) * 60;
  const ratio = goal <= 0 ? 0 : Math.min(1, logged / goal);
  return { logged, goal, ratio };
}
