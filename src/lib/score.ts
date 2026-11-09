export interface ScorePart {
  key: "streak" | "time" | "diversity" | "milestones";
  label: string;
  weight: number;
  /** Component score from 0 to 100 before weighting. */
  value: number;
  /** Weighted points contributed to the total. */
  points: number;
  detail: string;
}

export interface StrikerScore {
  total: number;
  parts: ScorePart[];
  explanation: string;
}

export interface ScoreInput {
  currentStreak: number;
  weeklyMinutes: number;
  weeklyGoalMinutes: number;
  distinctSkills30d: number;
  completedMilestones: number;
  totalMilestones: number;
}

const STREAK_TARGET = 30;
const DIVERSITY_TARGET = 5;

function clampRatio(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, value / target));
}

/**
 * Composite 0-100 score. Every component is normalized to 0-100 first, then
 * weighted, so the breakdown reads naturally next to the total.
 */
export function computeStrikerScore(input: ScoreInput): StrikerScore {
  const streakRatio = clampRatio(input.currentStreak, STREAK_TARGET);
  const timeRatio = clampRatio(input.weeklyMinutes, input.weeklyGoalMinutes);
  const diversityRatio = clampRatio(input.distinctSkills30d, DIVERSITY_TARGET);
  const milestoneRatio = clampRatio(
    input.completedMilestones,
    input.totalMilestones,
  );

  const parts: ScorePart[] = [
    {
      key: "streak",
      label: "Streak",
      weight: 30,
      value: Math.round(streakRatio * 100),
      points: streakRatio * 30,
      detail:
        input.currentStreak > 0
          ? `${input.currentStreak} day${input.currentStreak === 1 ? "" : "s"} in a row (30 earns full marks)`
          : "Log today to start a streak",
    },
    {
      key: "time",
      label: "Weekly time",
      weight: 30,
      value: Math.round(timeRatio * 100),
      points: timeRatio * 30,
      detail:
        input.weeklyGoalMinutes > 0
          ? `${Math.round(input.weeklyMinutes)} of ${Math.round(input.weeklyGoalMinutes)} min this week`
          : "Set a weekly hours target to score this part",
    },
    {
      key: "diversity",
      label: "Skill diversity",
      weight: 20,
      value: Math.round(diversityRatio * 100),
      points: diversityRatio * 20,
      detail: `${input.distinctSkills30d} skill${input.distinctSkills30d === 1 ? "" : "s"} practiced in 30 days (5 earns full marks)`,
    },
    {
      key: "milestones",
      label: "Milestones",
      weight: 20,
      value: Math.round(milestoneRatio * 100),
      points: milestoneRatio * 20,
      detail:
        input.totalMilestones > 0
          ? `${input.completedMilestones} of ${input.totalMilestones} completed`
          : "Add a milestone to score this part",
    },
  ];

  const total = Math.round(parts.reduce((sum, part) => sum + part.points, 0));

  return {
    total,
    parts,
    explanation:
      "Striker Score weights your current streak (30%), minutes this week vs your weekly goal (30%), skills used in the last 30 days toward 5 (20%), and completed milestones (20%).",
  };
}
