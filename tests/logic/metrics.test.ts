import { describe, expect, it } from "vitest";
import { createWeeklyPlanIcs } from "../../src/lib/calendar";
import {
  createDeviceKey,
  decryptWithDeviceKey,
  decryptWithPassphrase,
  encryptWithDeviceKey,
  encryptWithPassphrase,
} from "../../src/lib/crypto";
import { entryXp } from "../../src/lib/gamification";
import { computeStrikerScore } from "../../src/lib/score";
import { streakInfo } from "../../src/lib/stats";

describe("streaks", () => {
  it("counts back from today", () => {
    expect(streakInfo(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-03")).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it("keeps a streak alive until yesterday", () => {
    expect(streakInfo(["2026-03-01", "2026-03-02"], "2026-03-03")).toEqual({
      current: 2,
      longest: 2,
    });
  });

  it("breaks the current streak on a gap but keeps the longest run", () => {
    expect(
      streakInfo(["2026-03-01", "2026-03-02", "2026-03-04"], "2026-03-05"),
    ).toEqual({ current: 1, longest: 2 });
  });

  it("is zero with no entries", () => {
    expect(streakInfo([], "2026-03-05")).toEqual({ current: 0, longest: 0 });
  });
});

describe("Striker Score", () => {
  it("reaches 100 when every component is full", () => {
    const score = computeStrikerScore({
      currentStreak: 30,
      weeklyMinutes: 600,
      weeklyGoalMinutes: 600,
      distinctSkills30d: 5,
      completedMilestones: 3,
      totalMilestones: 3,
    });
    expect(score.total).toBe(100);
    expect(score.parts.map((part) => part.weight)).toEqual([30, 30, 20, 20]);
  });

  it("weights partial progress", () => {
    const score = computeStrikerScore({
      currentStreak: 15,
      weeklyMinutes: 150,
      weeklyGoalMinutes: 300,
      distinctSkills30d: 1,
      completedMilestones: 1,
      totalMilestones: 2,
    });
    expect(score.total).toBe(44);
    expect(score.parts.find((part) => part.key === "time")?.value).toBe(50);
  });

  it("is zero when nothing is configured or done", () => {
    const score = computeStrikerScore({
      currentStreak: 0,
      weeklyMinutes: 0,
      weeklyGoalMinutes: 0,
      distinctSkills30d: 0,
      completedMilestones: 0,
      totalMilestones: 0,
    });
    expect(score.total).toBe(0);
  });
});

describe("XP", () => {
  it("uses round(minutes / 10 + confidence)", () => {
    expect(entryXp(45, 4)).toBe(9);
    expect(entryXp(0, 5)).toBe(5);
    expect(entryXp(null, null)).toBe(0);
    expect(entryXp(120, 3)).toBe(15);
  });
});

describe("ICS export", () => {
  it("escapes text and folds long lines", () => {
    const ics = createWeeklyPlanIcs({
      goalTitle: "Art; study, daily",
      weekStart: "2026-01-05",
      summary: "line one\nline two",
      plan: "Do the thing; then rest",
      questions: "What is next?",
    });

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("SUMMARY:Art\\; study\\, daily — weekly plan");
    expect(ics).toContain("line one\\nline two");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260112");
    expect(ics).toContain("DTEND;VALUE=DATE:20260119");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);

    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});

describe("encryption round-trips", () => {
  it("decrypts a passphrase backup", async () => {
    const payload = JSON.stringify({ hello: "world", value: 42 });
    const encrypted = await encryptWithPassphrase(payload, "correct horse");
    expect(encrypted).not.toContain("hello");
    await expect(decryptWithPassphrase(encrypted, "correct horse")).resolves.toBe(
      payload,
    );
    await expect(decryptWithPassphrase(encrypted, "wrong")).rejects.toThrow(
      /Wrong passphrase/,
    );
  });

  it("decrypts secrets with the device key and rejects another key", async () => {
    const key = createDeviceKey();
    const encrypted = await encryptWithDeviceKey("sk-secret", key);
    await expect(decryptWithDeviceKey(encrypted, key)).resolves.toBe("sk-secret");
    await expect(
      decryptWithDeviceKey(encrypted, createDeviceKey()),
    ).rejects.toBeTruthy();
  });
});
