import { addDays, todayKey } from "./dates";

export const XP_FORMULA = "Each entry earns round(minutes / 10 + confidence) XP.";

export function entryXp(minutes: number | null, confidence: number | null): number {
  const safeMinutes = Math.max(0, minutes ?? 0);
  const safeConfidence = Math.max(0, confidence ?? 0);
  return Math.round(safeMinutes / 10 + safeConfidence);
}

export type BadgeGroup = "Streak" | "Milestone" | "Time";

export interface Badge {
  id: string;
  group: BadgeGroup;
  title: string;
  description: string;
  target: number;
  current: number;
  earned: boolean;
}

export interface BadgeInput {
  longestStreak: number;
  completedMilestones: number;
  totalMinutes: number;
}

export function badgesFor(input: BadgeInput): Badge[] {
  const definitions: Array<Omit<Badge, "earned" | "current">> = [
    {
      id: "streak-7",
      group: "Streak",
      title: "Week one",
      description: "Reach a 7-day streak",
      target: 7,
    },
    {
      id: "streak-30",
      group: "Streak",
      title: "Monthly momentum",
      description: "Reach a 30-day streak",
      target: 30,
    },
    {
      id: "streak-100",
      group: "Streak",
      title: "Century",
      description: "Reach a 100-day streak",
      target: 100,
    },
    {
      id: "milestone-1",
      group: "Milestone",
      title: "First flag",
      description: "Complete your first milestone",
      target: 1,
    },
    {
      id: "milestone-5",
      group: "Milestone",
      title: "Milestone maker",
      description: "Complete five milestones",
      target: 5,
    },
    {
      id: "time-10h",
      group: "Time",
      title: "10 hours in",
      description: "Log 10 hours of learning",
      target: 600,
    },
    {
      id: "time-50h",
      group: "Time",
      title: "Deep work",
      description: "Log 50 hours of learning",
      target: 3_000,
    },
    {
      id: "time-100h",
      group: "Time",
      title: "Century of hours",
      description: "Log 100 hours of learning",
      target: 6_000,
    },
  ];

  return definitions.map((definition) => {
    const current =
      definition.group === "Streak"
        ? input.longestStreak
        : definition.group === "Milestone"
          ? input.completedMilestones
          : input.totalMinutes;
    return {
      ...definition,
      current,
      earned: current >= definition.target,
    };
  });
}

export interface ChallengeDay {
  date: string;
  done: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface ChallengeProgress {
  start: string;
  end: string;
  days: ChallengeDay[];
  completedDays: number;
  complete: boolean;
  started: boolean;
  ended: boolean;
  ratio: number;
}

/** Seven consecutive days, each requiring at least one logged entry. */
export function challengeProgress(
  start: string | null,
  entryDates: string[],
  today = todayKey(),
): ChallengeProgress | null {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const doneDates = new Set(entryDates);
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      done: doneDates.has(date),
      isToday: date === today,
      isFuture: date > today,
    };
  });
  const completedDays = days.filter((day) => day.done).length;

  return {
    start,
    end,
    days,
    completedDays,
    complete: completedDays === 7,
    started: today >= start,
    ended: today > end,
    ratio: completedDays / 7,
  };
}
