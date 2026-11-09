import { invoke } from "@tauri-apps/api/core";
import type { ExportBundle } from "./types";

export function toJson(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per entry, with goal and skill names resolved for readability. */
export function entriesToCsv(bundle: ExportBundle): string {
  const goalTitles = new Map(bundle.goals.map((goal) => [goal.id, goal.title]));
  const skillNames = new Map(bundle.skills.map((skill) => [skill.id, skill.name]));
  const skillsByEntry = new Map<number, string[]>();

  for (const link of bundle.entry_skills) {
    const name = skillNames.get(link.skill_id);
    if (!name) continue;
    const list = skillsByEntry.get(link.entry_id) ?? [];
    list.push(name);
    skillsByEntry.set(link.entry_id, list);
  }

  const header = [
    "goal",
    "date",
    "action",
    "learned",
    "difficulty",
    "source",
    "evidence",
    "minutes",
    "confidence",
    "skills",
    "created_at",
  ];

  const rows = bundle.entries.map((entry) => [
    goalTitles.get(entry.goal_id) ?? "",
    entry.date,
    entry.action ?? entry.text,
    entry.learned,
    entry.difficulty,
    entry.source,
    entry.evidence,
    entry.minutes,
    entry.confidence,
    (skillsByEntry.get(entry.id) ?? []).sort().join("; "),
    entry.created_at,
  ]);

  // The BOM keeps Excel from mangling non-ASCII text; CRLF is Excel-friendly.
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

/** Writes next to the user's Downloads folder and returns the full path. */
export async function writeExportFile(fileName: string, contents: string): Promise<string> {
  return invoke<string>("export_file", { fileName, contents });
}

/** Writes base64 binary output (a PDF) into Downloads and returns its full path. */
export async function writeExportBase64(
  fileName: string,
  data: string,
): Promise<string> {
  return invoke<string>("export_binary_base64", { fileName, data });
}

/** Opens an http(s) link or absolute local path in the Windows shell. */
export async function openTarget(target: string): Promise<void> {
  await invoke("open_external", { target: target.trim() });
}
