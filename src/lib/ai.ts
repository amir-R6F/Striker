import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import { searchEntries } from "./db";
import { addDays, formatMinutes } from "./dates";
import { readSecret } from "./secrets";
import {
  SETTING_KEYS,
  aiBaseUrl,
  aiModel,
  aiProvider,
  type Settings,
} from "./settings";
import type { AiWeekSummary } from "./types";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_PROMPT_CHARS = 12_000;

export function aiConfigIssue(settings: Settings): string | null {
  const provider = aiProvider(settings);
  if (!aiModel(settings, provider)) {
    return "Choose an AI model in Settings → AI.";
  }
  if (provider === "openai" && !settings[SETTING_KEYS.aiApiKey]) {
    return "Add an API key in Settings → AI.";
  }
  return null;
}

/**
 * Sends only the chosen week's entries to the configured provider. Called from
 * the "Summarize week" button; there is no background AI work.
 */
export async function summarizeWeek(
  settings: Settings,
  goalId: number,
  goalTitle: string,
  weekStart: string,
): Promise<AiWeekSummary> {
  const issue = aiConfigIssue(settings);
  if (issue) throw new Error(issue);

  const provider = aiProvider(settings);
  const model = aiModel(settings, provider);
  const baseUrl = aiBaseUrl(settings, provider);
  const weekEnd = addDays(weekStart, 6);
  const entries = await searchEntries({
    query: "",
    skillId: null,
    goalId,
    from: weekStart,
    to: weekEnd,
    minConfidence: null,
  });

  if (entries.length === 0) {
    throw new Error("There are no entries in this week to summarize.");
  }

  const totalMinutes = entries.reduce(
    (sum, entry) => sum + (entry.minutes ?? 0),
    0,
  );
  const activeDays = new Set(entries.map((entry) => entry.date)).size;
  const entryLines = entries
    .map((entry) => {
      const title = entry.action ?? entry.learned ?? entry.text;
      const skills = entry.skills.map((skill) => skill.name).join(", ");
      return [
        entry.date,
        title,
        entry.learned ? `learned: ${entry.learned}` : "",
        entry.difficulty ? `hard: ${entry.difficulty}` : "",
        entry.minutes != null ? `${entry.minutes} min` : "",
        skills ? `skills: ${skills}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");

  const instructions = [
    "Return ONLY valid JSON with exactly these keys:",
    '{"keyLearnings":["..."],"suggestions":["..."],"openQuestions":["..."]}',
    "Rules: 2-5 items per list. Be specific and practical, use only these entries.",
    "Suggestions are actions for next week; open questions are unresolved items from the entries.",
  ].join("\n");
  const header = [
    "You are a concise learning coach reviewing one week of a learning log.",
    `Goal: ${goalTitle}`,
    `Week: ${weekStart} to ${weekEnd}`,
    `Totals: ${entries.length} entries, ${formatMinutes(
      totalMinutes,
    )}, ${activeDays} active days.`,
    "",
    "Entries (date | action | learned | hard or open | minutes | skills):",
    entryLines,
  ].join("\n");
  // Trim the entry list rather than the instructions, so the model always sees
  // the required JSON shape even for a busy week.
  const prompt = `${header.slice(
    0,
    Math.max(0, MAX_PROMPT_CHARS - instructions.length - 2),
  )}\n\n${instructions}`;

  let apiKey: string | null = null;
  if (provider === "openai" && settings[SETTING_KEYS.aiApiKey]) {
    apiKey = await readSecret(settings, SETTING_KEYS.aiApiKey);
    if (!apiKey) {
      throw new Error(
        "The saved AI key could not be decrypted. Re-enter it in Settings → AI.",
      );
    }
  }

  const endpoint =
    provider === "ollama"
      ? ollamaEndpoint(baseUrl)
      : openAiEndpoint(baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body =
    provider === "ollama"
      ? {
          model,
          stream: false,
          messages: [
            {
              role: "system",
              content: "You summarize learning logs as strict JSON.",
            },
            { role: "user", content: prompt },
          ],
          options: { temperature: 0.2 },
        }
      : {
          model,
          temperature: 0.2,
          max_tokens: 1_000,
          messages: [
            {
              role: "system",
              content:
                "You summarize learning logs. Reply with valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
        };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let raw: string;
  try {
    const response = await httpFetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `AI request failed (${response.status}). ${raw.slice(0, 300)}`.trim(),
      );
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The AI request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  return parseAiSummary(extractContent(raw));
}

function ollamaEndpoint(baseUrl: string): string {
  return /\/api\/chat$/i.test(baseUrl)
    ? baseUrl
    : `${baseUrl.replace(/\/+$/, "")}/api/chat`;
}

function openAiEndpoint(baseUrl: string): string {
  return /\/chat\/completions$/i.test(baseUrl)
    ? baseUrl
    : `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function extractContent(raw: string): string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return raw;
  }

  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const payload = data as {
      choices?: Array<{ message?: { content?: unknown } }>;
      message?: { content?: unknown };
      response?: unknown;
      error?: unknown;
    };
    if (payload.error) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : "The AI provider returned an error.",
      );
    }
    const choice = payload.choices?.[0]?.message?.content;
    if (typeof choice === "string") return choice;
    if (typeof payload.message?.content === "string") {
      return payload.message.content;
    }
    if (typeof payload.response === "string") return payload.response;
  }

  throw new Error("The AI provider returned an unexpected response.");
}

function toStringList(value: unknown): string[] {
  const items =
    typeof value === "string"
      ? value.split(/\r?\n/)
      : Array.isArray(value)
        ? value
        : [];
  return items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((item) => (item.length > 500 ? `${item.slice(0, 499)}…` : item));
}

export function parseAiSummary(content: string): AiWeekSummary {
  const trimmed = content.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      const keyLearnings = toStringList(
        parsed.keyLearnings ??
          parsed.key_learnings ??
          parsed.learnings ??
          parsed.summary,
      );
      const suggestions = toStringList(
        parsed.suggestions ?? parsed.nextSteps ?? parsed.next_week_plan,
      );
      const openQuestions = toStringList(
        parsed.openQuestions ?? parsed.open_questions ?? parsed.questions,
      );
      if (
        keyLearnings.length > 0 ||
        suggestions.length > 0 ||
        openQuestions.length > 0
      ) {
        return { keyLearnings, suggestions, openQuestions };
      }
    } catch {
      // The model did not return JSON; fall back to readable lines below.
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => (line.length > 500 ? `${line.slice(0, 499)}…` : line));

  if (lines.length === 0) {
    throw new Error("The model returned an empty summary.");
  }

  return { keyLearnings: lines, suggestions: [], openQuestions: [] };
}
