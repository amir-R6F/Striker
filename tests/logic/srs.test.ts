import { describe, expect, it } from "vitest";
import { scheduleCard } from "../../src/lib/srs";

const NEW_CARD = { ease: 2.5, interval_days: 0, repetitions: 0, lapses: 0 };

describe("SM-2 scheduling", () => {
  it("schedules a new good card for tomorrow", () => {
    const result = scheduleCard(NEW_CARD, "good", "2026-01-01");
    expect(result.intervalDays).toBe(1);
    expect(result.dueDate).toBe("2026-01-02");
    expect(result.repetitions).toBe(1);
    expect(result.ease).toBe(2.5);
  });

  it("gives an easy new card four days", () => {
    const result = scheduleCard(NEW_CARD, "easy", "2026-01-01");
    expect(result.intervalDays).toBe(4);
    expect(result.dueDate).toBe("2026-01-05");
    expect(result.ease).toBe(2.6);
  });

  it("resets repetitions and counts a lapse on Again", () => {
    const result = scheduleCard(
      { ease: 2.5, interval_days: 20, repetitions: 4, lapses: 1 },
      "again",
      "2026-01-01",
    );
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.lapses).toBe(2);
    expect(result.ease).toBe(1.96);
  });

  it("uses the second-success intervals", () => {
    const card = { ease: 2.5, interval_days: 1, repetitions: 1, lapses: 0 };
    expect(scheduleCard(card, "hard", "2026-01-01").intervalDays).toBe(3);
    expect(scheduleCard(card, "good", "2026-01-01").intervalDays).toBe(6);
    expect(scheduleCard(card, "easy", "2026-01-01").intervalDays).toBe(8);
  });

  it("grows later intervals by ease and the grade multiplier", () => {
    const card = { ease: 2.5, interval_days: 10, repetitions: 3, lapses: 0 };
    expect(scheduleCard(card, "good", "2026-01-01").intervalDays).toBe(25);
    expect(scheduleCard(card, "hard", "2026-01-01").intervalDays).toBe(19);
    expect(scheduleCard(card, "easy", "2026-01-01").intervalDays).toBe(34);
  });

  it("clamps ease to 1.3–5.0", () => {
    const low = scheduleCard(
      { ease: 1.3, interval_days: 5, repetitions: 2, lapses: 0 },
      "again",
      "2026-01-01",
    );
    expect(low.ease).toBe(1.3);

    const high = scheduleCard(
      { ease: 5, interval_days: 5, repetitions: 2, lapses: 0 },
      "easy",
      "2026-01-01",
    );
    expect(high.ease).toBe(5);
  });

  it("rolls due dates across month boundaries", () => {
    const result = scheduleCard(NEW_CARD, "easy", "2026-01-31");
    expect(result.dueDate).toBe("2026-02-04");
  });
});
