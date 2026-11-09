/**
 * All dates in Striker are local calendar days stored as `YYYY-MM-DD` strings.
 * Keeping them as plain keys avoids timezone drift between the UI and SQLite.
 */

export function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, amount: number): string {
  const date = fromKey(key);
  date.setDate(date.getDate() + amount);
  return toKey(date);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 86_400_000);
}

/** Monday of the ISO week that contains `key`. */
export function startOfIsoWeek(key: string): string {
  const date = fromKey(key);
  const mondayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayIndex);
  return toKey(date);
}

export function isoWeekInfo(key: string): { year: number; week: number } {
  const date = fromKey(key);
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: target.getUTCFullYear(), week };
}

/** Monday keys for the last `count` ISO weeks, oldest first. */
export function lastIsoWeekStarts(count: number, today = todayKey()): string[] {
  const current = startOfIsoWeek(today);
  return Array.from({ length: count }, (_, index) =>
    addDays(current, -7 * (count - 1 - index)),
  );
}

export function isoWeekLabel(weekStart: string): string {
  const { year, week } = isoWeekInfo(weekStart);
  return `${year} · W${`${week}`.padStart(2, "0")}`;
}

export function currentMonthKey(today = todayKey()): string {
  return today.slice(0, 7);
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

/** Input is a month input value: YYYY-MM. */
export function monthRange(monthKey: string): DateRange {
  const [year, month] = monthKey.split("-").map(Number);
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  const lastDay = new Date(safeYear, safeMonth, 0).getDate();
  return {
    from: `${safeYear}-${`${safeMonth}`.padStart(2, "0")}-01`,
    to: `${safeYear}-${`${safeMonth}`.padStart(2, "0")}-${`${lastDay}`.padStart(2, "0")}`,
    label: new Date(safeYear, safeMonth - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    }),
  };
}

/** The quarter containing a YYYY-MM value. */
export function quarterRange(monthKey: string): DateRange {
  const [year, month] = monthKey.split("-").map(Number);
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  const quarter = Math.floor((safeMonth - 1) / 3) + 1;
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(safeYear, endMonth, 0).getDate();
  return {
    from: `${safeYear}-${`${startMonth}`.padStart(2, "0")}-01`,
    to: `${safeYear}-${`${endMonth}`.padStart(2, "0")}-${`${lastDay}`.padStart(2, "0")}`,
    label: `Q${quarter} ${safeYear}`,
  };
}

export function formatDay(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatLongDay(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatShort(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const startDate = fromKey(weekStart);
  const endDate = fromKey(end);
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const startLabel = startDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${startLabel} – ${endDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

/** 95 -> "1h 35m", 45 -> "45m", 120 -> "2h" */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatDurationLong(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
