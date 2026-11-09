import { todayKey } from "./dates";
import type { Flashcard, FlashcardGrade, FlashcardReviewResult } from "./types";

/**
 * A deliberately small SM-2 variant.
 *
 * Again / Hard / Good / Easy map to the classic SM-2 qualities 1 / 3 / 4 / 5.
 * Ease follows the SM-2 formula and is clamped to 1.3–5.0. Intervals are kept
 * readable for a desktop widget: a new card is due tomorrow (four days if it
 * was easy), the second success jumps to six days, and later intervals grow by
 * the card's ease.
 */
const QUALITY: Record<FlashcardGrade, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export const GRADE_ORDER: FlashcardGrade[] = ["again", "hard", "good", "easy"];

export const GRADE_LABELS: Record<FlashcardGrade, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const MIN_EASE = 1.3;
const MAX_EASE = 5;

type SchedulerCard = Pick<
  Flashcard,
  "ease" | "interval_days" | "repetitions" | "lapses"
>;

export function scheduleCard(
  card: SchedulerCard,
  grade: FlashcardGrade,
  today: string,
): FlashcardReviewResult {
  const quality = QUALITY[grade];
  const ease = Math.min(
    MAX_EASE,
    Math.max(
      MIN_EASE,
      card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    ),
  );

  let repetitions: number;
  let intervalDays: number;
  let lapses = card.lapses;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    repetitions = card.repetitions + 1;
    if (card.repetitions === 0) {
      intervalDays = grade === "easy" ? 4 : 1;
    } else if (card.repetitions === 1) {
      intervalDays = grade === "hard" ? 3 : grade === "easy" ? 8 : 6;
    } else {
      const multiplier = grade === "hard" ? 0.8 : grade === "easy" ? 1.3 : 1;
      intervalDays = Math.max(
        1,
        Math.round(card.interval_days * ease * multiplier),
      );
    }
  }

  return {
    dueDate: addDaysKey(today, intervalDays),
    intervalDays,
    ease: Math.round(ease * 100) / 100,
    repetitions,
    lapses,
  };
}

/** Interval that the grade button would apply, used for the button hints. */
export function previewInterval(card: SchedulerCard, grade: FlashcardGrade): number {
  return scheduleCard(card, grade, todayKey()).intervalDays;
}

export function formatInterval(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/** Local-date addition without pulling the whole date helper into the scheduler. */
function addDaysKey(key: string, amount: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + amount);
  const nextMonth = `${date.getMonth() + 1}`.padStart(2, "0");
  const nextDay = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}
