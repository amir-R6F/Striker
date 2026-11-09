import { addDays } from "./dates";

export interface WeeklyPlanIcsInput {
  goalTitle: string;
  /** Monday of the week the review belongs to. */
  weekStart: string;
  summary: string;
  plan: string;
  questions: string;
}

function icsDate(key: string): string {
  return key.replace(/-/g, "");
}

function icsTimestamp(date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding at 74 characters plus a leading space. */
function foldLine(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

/**
 * Exports the review's next-week plan as one all-day calendar event covering
 * the following ISO week, so the plan lands on the right dates without
 * inventing times or sessions.
 */
export function createWeeklyPlanIcs(input: WeeklyPlanIcsInput): string {
  const planWeekStart = addDays(input.weekStart, 7);
  const planWeekEnd = addDays(planWeekStart, 7);
  const description = [
    input.summary.trim() ? `Summary: ${input.summary.trim()}` : "",
    `Plan: ${input.plan.trim() || "No plan written yet."}`,
    input.questions.trim() ? `Open questions: ${input.questions.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Striker//Weekly Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:striker-week-${input.weekStart}@striker.local`,
    `DTSTAMP:${icsTimestamp()}`,
    `DTSTART;VALUE=DATE:${icsDate(planWeekStart)}`,
    `DTEND;VALUE=DATE:${icsDate(planWeekEnd)}`,
    `SUMMARY:${escapeText(`${input.goalTitle} — weekly plan`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];

  return lines.map(foldLine).join("\r\n");
}

export function weeklyPlanFileName(weekStart: string): string {
  return `striker-week-${weekStart}.ics`;
}
