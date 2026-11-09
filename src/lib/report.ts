import { addDays, formatMinutes, formatShort, isoWeekLabel } from "./dates";
import { evidenceName, readEvidenceImage } from "./evidence";
import { entryXp } from "./gamification";
import { writeExportBase64, writeExportFile } from "./export";
import type {
  Entry,
  Evidence,
  ExportBundle,
  Goal,
  Milestone,
  WeeklyReview,
} from "./types";

export const REPORT_TEMPLATE = {
  eyebrow: "STRIKER · LEARNING REPORT",
  intro:
    "A record of deliberate practice: where the time went, what was learned, what was finished, and the evidence behind it.",
  sections: {
    snapshot: "Snapshot",
    skills: "Skills practiced",
    milestones: "Milestones completed",
    evidence: "Evidence gallery",
    learnings: "Top learnings",
    reviews: "Weekly reviews",
    entries: "Entry log",
  },
} as const;

export interface ReportSkill {
  name: string;
  minutes: number;
  entries: number;
}

export interface ReportLearning {
  date: string;
  action: string | null;
  learned: string;
  confidence: number | null;
}

export interface ReportEvidence extends Evidence {
  entryDate: string;
  entryAction: string | null;
  label: string;
}

export interface ReportModel {
  title: string;
  subtitle: string;
  periodLabel: string;
  generatedAt: string;
  goalTitle: string | null;
  totalMinutes: number;
  entryCount: number;
  totalXp: number;
  skills: ReportSkill[];
  milestones: Milestone[];
  evidence: ReportEvidence[];
  learnings: ReportLearning[];
  reviews: WeeklyReview[];
  goals: Goal[];
  entries: Entry[];
  full: boolean;
}

export interface PeriodReportOptions {
  goalId: number;
  from: string;
  to: string;
  label: string;
  kind: "month" | "quarter";
}

function aggregateSkills(bundle: ExportBundle, entries: Entry[]): ReportSkill[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const skillById = new Map(bundle.skills.map((skill) => [skill.id, skill]));
  const aggregate = new Map<number, { name: string; minutes: number; entryIds: Set<number> }>();

  for (const link of bundle.entry_skills) {
    const entry = entryById.get(link.entry_id);
    const skill = skillById.get(link.skill_id);
    if (!entry || !skill) continue;
    const row = aggregate.get(skill.id) ?? {
      name: skill.name,
      minutes: 0,
      entryIds: new Set<number>(),
    };
    row.minutes += Math.max(0, entry.minutes ?? 0);
    row.entryIds.add(entry.id);
    aggregate.set(skill.id, row);
  }

  return [...aggregate.values()]
    .map((row) => ({
      name: row.name,
      minutes: row.minutes,
      entries: row.entryIds.size,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
}

function reportEvidence(bundle: ExportBundle, entries: Entry[]): ReportEvidence[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  return bundle.entry_evidence
    .filter((item) => entryById.has(item.entry_id))
    .map((item) => {
      const entry = entryById.get(item.entry_id)!;
      return {
        ...item,
        entryDate: entry.date,
        entryAction: entry.action ?? entry.learned ?? entry.text,
        label: evidenceName(item),
      };
    })
    .sort(
      (a, b) =>
        b.entryDate.localeCompare(a.entryDate) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id - a.id,
    );
}

function reportLearnings(entries: Entry[], limit: number): ReportLearning[] {
  return entries
    .filter((entry) => Boolean((entry.learned ?? entry.text).trim()))
    .sort(
      (a, b) =>
        (b.confidence ?? 0) - (a.confidence ?? 0) ||
        (b.minutes ?? 0) - (a.minutes ?? 0) ||
        b.date.localeCompare(a.date),
    )
    .slice(0, limit)
    .map((entry) => ({
      date: entry.date,
      action: entry.action,
      learned: (entry.learned ?? entry.text).trim(),
      confidence: entry.confidence,
    }));
}

function totalXp(entries: Entry[]): number {
  return entries.reduce(
    (sum, entry) => sum + entryXp(entry.minutes, entry.confidence),
    0,
  );
}

export function createPeriodReport(
  bundle: ExportBundle,
  options: PeriodReportOptions,
): ReportModel {
  const goal = bundle.goals.find((candidate) => candidate.id === options.goalId);
  const entries = bundle.entries.filter(
    (entry) =>
      entry.goal_id === options.goalId &&
      entry.date >= options.from &&
      entry.date <= options.to,
  );
  const milestones = bundle.milestones
    .filter(
      (milestone) =>
        milestone.goal_id === options.goalId &&
        milestone.completed_at != null &&
        milestone.completed_at >= options.from &&
        milestone.completed_at <= options.to,
    )
    .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
  const reviews = bundle.weekly_reviews.filter(
    (review) =>
      review.goal_id === options.goalId &&
      review.week_start <= options.to &&
      addDays(review.week_start, 6) >= options.from,
  );
  const goalTitle = goal?.title ?? "Learning goal";

  return {
    title: `${goalTitle} — ${options.label}`,
    subtitle:
      options.kind === "month"
        ? "Monthly learning report"
        : "Quarterly learning report",
    periodLabel: options.label,
    generatedAt: new Date().toLocaleString(),
    goalTitle,
    totalMinutes: entries.reduce(
      (sum, entry) => sum + Math.max(0, entry.minutes ?? 0),
      0,
    ),
    entryCount: entries.length,
    totalXp: totalXp(entries),
    skills: aggregateSkills(bundle, entries),
    milestones,
    evidence: reportEvidence(bundle, entries),
    learnings: reportLearnings(entries, 6),
    reviews,
    goals: goal ? [goal] : [],
    entries,
    full: false,
  };
}

export function createFullReport(bundle: ExportBundle): ReportModel {
  return {
    title: "Striker full data export",
    subtitle: "All goals, entries, skills, milestones and evidence",
    periodLabel: "All time",
    generatedAt: new Date().toLocaleString(),
    goalTitle: null,
    totalMinutes: bundle.entries.reduce(
      (sum, entry) => sum + Math.max(0, entry.minutes ?? 0),
      0,
    ),
    entryCount: bundle.entries.length,
    totalXp: totalXp(bundle.entries),
    skills: aggregateSkills(bundle, bundle.entries),
    milestones: [...bundle.milestones].sort((a, b) =>
      (a.completed_at ?? a.created_at).localeCompare(b.completed_at ?? b.created_at),
    ),
    evidence: reportEvidence(bundle, bundle.entries),
    learnings: reportLearnings(bundle.entries, 10),
    reviews: [...bundle.weekly_reviews].sort((a, b) =>
      a.week_start.localeCompare(b.week_start),
    ),
    goals: [...bundle.goals].sort((a, b) => a.id - b.id),
    entries: [...bundle.entries].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
    ),
    full: true,
  };
}

function mdText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function fileUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.replace(/\\/g, "/");
  return encodeURI(`file:///${normalized.replace(/^\/+/, "")}`).replace(/#/g, "%23");
}

function markdownSkills(model: ReportModel): string[] {
  if (model.skills.length === 0) return ["_No tagged skills in this period._"];
  return [
    "| Skill | Time | Entries |",
    "| --- | ---: | ---: |",
    ...model.skills.map(
      (skill) =>
        `| ${mdText(skill.name)} | ${formatMinutes(skill.minutes)} | ${skill.entries} |`,
    ),
  ];
}

function markdownEvidence(item: ReportEvidence): string[] {
  const lines = [`### ${mdText(item.label)}`, "", `- Type: ${item.kind}`];
  if (item.entryAction) {
    lines.push(`- Entry: ${mdText(item.entryAction)} (${formatShort(item.entryDate)})`);
  }
  if (item.kind === "image") {
    lines.push(`- ![${mdText(item.label)}](${fileUrl(item.path)})`);
    lines.push(`- [Open image](${fileUrl(item.path)})`);
  } else if (item.kind === "link") {
    lines.push(`- [Open link](${item.path})`);
  } else {
    lines.push(`- [Open file](${fileUrl(item.path)})`);
  }
  lines.push("");
  return lines;
}

function markdownMilestone(milestone: Milestone): string {
  if (milestone.completed_at) {
    return `- **${mdText(milestone.title)}** — completed ${formatShort(milestone.completed_at)}`;
  }
  return `- **${mdText(milestone.title)}** — in progress${
    milestone.target_date ? `, target ${formatShort(milestone.target_date)}` : ""
  }`;
}

export function reportToMarkdown(model: ReportModel): string {
  const lines: string[] = [
    `# ${model.title}`,
    "",
    `_${model.subtitle}_`,
    "",
    `**${model.periodLabel}** · Generated ${model.generatedAt}`,
    "",
    `> ${REPORT_TEMPLATE.intro}`,
    "",
    `## ${REPORT_TEMPLATE.sections.snapshot}`,
    "",
    `- Total time: ${formatMinutes(model.totalMinutes)}`,
    `- Entries: ${model.entryCount}`,
    `- Skills practiced: ${model.skills.length}`,
    `- Milestones completed: ${model.milestones.filter((milestone) => milestone.completed_at).length}`,
    `- XP: ${model.totalXp}`,
    "",
  ];

  if (model.full) {
    lines.push("## Goals", "");
    if (model.goals.length === 0) {
      lines.push("_No goals._", "");
    } else {
      for (const goal of model.goals) {
        lines.push(
          `- **${mdText(goal.title)}** — started ${formatShort(goal.start_date)}${
            goal.weekly_hours_goal > 0
              ? ` · ${goal.weekly_hours_goal}h / week`
              : ""
          }`,
        );
        if (goal.description) lines.push(`  - ${mdText(goal.description)}`);
        if (goal.success_criteria) {
          lines.push(`  - Success: ${mdText(goal.success_criteria)}`);
        }
      }
      lines.push("");
    }
  }

  lines.push(`## ${REPORT_TEMPLATE.sections.skills}`, "", ...markdownSkills(model), "");

  const milestoneHeading = model.full
    ? "Milestones"
    : REPORT_TEMPLATE.sections.milestones;
  lines.push(`## ${milestoneHeading}`, "");
  if (model.milestones.length === 0) {
    lines.push(
      model.full ? "_No milestones._" : "_No milestones were completed in this period._",
      "",
    );
  } else {
    lines.push(...model.milestones.map(markdownMilestone), "");
  }

  lines.push(`## ${REPORT_TEMPLATE.sections.evidence}`, "");
  if (model.evidence.length === 0) {
    lines.push(
      model.full ? "_No evidence attached._" : "_No evidence attached to entries in this period._",
      "",
    );
  } else {
    for (const item of model.evidence) lines.push(...markdownEvidence(item));
  }

  lines.push(`## ${REPORT_TEMPLATE.sections.learnings}`, "");
  if (model.learnings.length === 0) {
    lines.push("_No written learnings yet._", "");
  } else {
    for (const learning of model.learnings) {
      const action = learning.action ? ` · ${mdText(learning.action)}` : "";
      lines.push(
        `- **${formatShort(learning.date)}${action}** — ${mdText(learning.learned)}`,
      );
    }
    lines.push("");
  }

  if (model.reviews.length > 0) {
    lines.push(`## ${REPORT_TEMPLATE.sections.reviews}`, "");
    for (const review of model.reviews) {
      lines.push(`### ${isoWeekLabel(review.week_start)}`, "");
      if (review.summary) lines.push(`**Summary:** ${mdText(review.summary)}`, "");
      if (review.next_week_plan) {
        lines.push(`**Next week:** ${mdText(review.next_week_plan)}`, "");
      }
      if (review.open_questions) {
        lines.push(`**Open questions:** ${mdText(review.open_questions)}`, "");
      }
    }
  }

  if (model.full) {
    lines.push(`## ${REPORT_TEMPLATE.sections.entries}`, "");
    const goalTitles = new Map(model.goals.map((goal) => [goal.id, goal.title]));
    if (model.entries.length === 0) {
      lines.push("_No entries._", "");
    } else {
      for (const entry of model.entries) {
        const goal = goalTitles.get(entry.goal_id) ?? "Goal";
        lines.push(`### ${formatShort(entry.date)} · ${mdText(goal)}`, "");
        if (entry.action) lines.push(`**Action:** ${mdText(entry.action)}`, "");
        if (entry.learned) lines.push(`**Learned:** ${mdText(entry.learned)}`, "");
        if (entry.difficulty) lines.push(`**Difficulty:** ${mdText(entry.difficulty)}`, "");
        const details = [
          entry.minutes != null ? `${entry.minutes} min` : null,
          entry.confidence != null ? `confidence ${entry.confidence}/5` : null,
        ].filter(Boolean);
        if (details.length > 0) lines.push(`- ${details.join(" · ")}`);
        if (entry.source) lines.push(`- Source: ${entry.source}`);
        if (entry.evidence) lines.push(`- Evidence: ${entry.evidence}`);
        lines.push("");
      }
    }
  }

  lines.push(
    "---",
    "",
    "_Generated by Striker. Stored locally — nothing left this device._",
    "",
  );
  return lines.join("\n");
}

type PdfFontStyle = "normal" | "bold" | "italic" | "bolditalic";

function pdfSafe(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2192/g, "->")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "?");
}

async function renderPdf(model: ReportModel): Promise<string> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - 58;
  let y = margin;

  const ensure = (height: number) => {
    if (y + height > bottom) {
      doc.addPage();
      y = margin;
    }
  };

  const write = (
    value: string,
    size = 10,
    style: PdfFontStyle = "normal",
    color: [number, number, number] = [55, 61, 72],
    gap = 5,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(pdfSafe(value), contentWidth);
    const lineHeight = size * 1.4;
    for (const line of lines) {
      ensure(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += gap;
  };

  const heading = (value: string) => {
    ensure(38);
    y += 8;
    doc.setDrawColor(220, 225, 234);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;
    write(value.toUpperCase(), 9, "bold", [120, 130, 145], 6);
  };

  const bullet = (value: string, size = 9.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(55, 61, 72);
    const lines = doc.splitTextToSize(pdfSafe(value), contentWidth - 14);
    lines.forEach((line: string, index: number) => {
      ensure(size * 1.4);
      if (index === 0) doc.text("-", margin, y);
      doc.text(line, margin + 12, y);
      y += size * 1.4;
    });
    y += 3;
  };

  write(REPORT_TEMPLATE.eyebrow, 8, "bold", [120, 130, 145], 8);
  write(model.title, 20, "bold", [20, 24, 32], 4);
  write(model.subtitle, 10.5, "normal", [110, 118, 132], 4);
  write(`${model.periodLabel} · Generated ${model.generatedAt}`, 8.5, "normal", [130, 138, 150], 8);
  write(REPORT_TEMPLATE.intro, 9.5, "italic", [90, 98, 112], 4);

  heading(REPORT_TEMPLATE.sections.snapshot);
  bullet(`Total time: ${formatMinutes(model.totalMinutes)}`);
  bullet(`Entries: ${model.entryCount}`);
  bullet(`Skills practiced: ${model.skills.length}`);
  bullet(
    `Milestones completed: ${model.milestones.filter((milestone) => milestone.completed_at).length}`,
  );
  bullet(`XP: ${model.totalXp}`);

  if (model.full && model.goals.length > 0) {
    heading("Goals");
    for (const goal of model.goals) {
      bullet(
        `${goal.title} — started ${formatShort(goal.start_date)}${
          goal.weekly_hours_goal > 0 ? ` · ${goal.weekly_hours_goal}h / week` : ""
        }`,
      );
      if (goal.description) write(goal.description, 9, "normal", [90, 98, 112], 2);
    }
  }

  heading(REPORT_TEMPLATE.sections.skills);
  if (model.skills.length === 0) {
    write("No tagged skills in this period.", 9.5, "italic", [130, 138, 150]);
  } else {
    for (const skill of model.skills) {
      bullet(`${skill.name} — ${formatMinutes(skill.minutes)} · ${skill.entries} entries`);
    }
  }

  heading(model.full ? "Milestones" : REPORT_TEMPLATE.sections.milestones);
  if (model.milestones.length === 0) {
    write(
      model.full ? "No milestones." : "No milestones were completed in this period.",
      9.5,
      "italic",
      [130, 138, 150],
    );
  } else {
    for (const milestone of model.milestones) {
      bullet(
        milestone.completed_at
          ? `${milestone.title} — completed ${formatShort(milestone.completed_at)}`
          : `${milestone.title} — in progress${
              milestone.target_date ? `, target ${formatShort(milestone.target_date)}` : ""
            }`,
      );
      if (milestone.description) {
        write(milestone.description, 8.8, "normal", [105, 112, 125], 2);
      }
    }
  }

  heading(REPORT_TEMPLATE.sections.evidence);
  if (model.evidence.length === 0) {
    write(
      model.full ? "No evidence attached." : "No evidence attached to entries in this period.",
      9.5,
      "italic",
      [130, 138, 150],
    );
  } else {
    let embedded = 0;
    for (const item of model.evidence) {
      if (
        item.kind === "image" &&
        embedded < 6 &&
        (item.path.toLowerCase().endsWith(".png") ||
          item.path.toLowerCase().endsWith(".jpg") ||
          item.path.toLowerCase().endsWith(".jpeg"))
      ) {
        try {
          const dataUrl = await readEvidenceImage(item.path);
          const properties = doc.getImageProperties(dataUrl);
          const scale = Math.min(280 / properties.width, 180 / properties.height);
          const width = properties.width * scale;
          const height = properties.height * scale;
          ensure(height + 36);
          doc.addImage(
            dataUrl,
            item.path.toLowerCase().endsWith(".png") ? "PNG" : "JPEG",
            margin,
            y,
            width,
            height,
          );
          y += height + 4;
          write(
            `${item.label} · ${formatShort(item.entryDate)}${
              item.entryAction ? ` · ${item.entryAction}` : ""
            }`,
            8.5,
            "normal",
            [110, 118, 132],
            8,
          );
          embedded += 1;
          continue;
        } catch {
          // Fall through to a text entry when the image cannot be read.
        }
      }
      bullet(
        `${item.label} (${item.kind}) — ${formatShort(item.entryDate)}${
          item.entryAction ? ` · ${item.entryAction}` : ""
        }`,
      );
      if (item.kind !== "link") {
        write(item.path, 8, "normal", [130, 138, 150], 2);
      }
    }
  }

  heading(REPORT_TEMPLATE.sections.learnings);
  if (model.learnings.length === 0) {
    write("No written learnings yet.", 9.5, "italic", [130, 138, 150]);
  } else {
    for (const learning of model.learnings) {
      bullet(
        `${formatShort(learning.date)}${
          learning.action ? ` · ${learning.action}` : ""
        } — ${learning.learned}`,
      );
    }
  }

  if (model.reviews.length > 0) {
    heading(REPORT_TEMPLATE.sections.reviews);
    for (const review of model.reviews) {
      write(isoWeekLabel(review.week_start), 10, "bold", [40, 45, 55], 3);
      if (review.summary) write(review.summary, 9, "normal", [75, 82, 95], 2);
      if (review.next_week_plan) {
        write(`Next week: ${review.next_week_plan}`, 9, "normal", [75, 82, 95], 2);
      }
      if (review.open_questions) {
        write(`Open questions: ${review.open_questions}`, 9, "normal", [75, 82, 95], 2);
      }
      y += 4;
    }
  }

  if (model.full) {
    heading(REPORT_TEMPLATE.sections.entries);
    const goalTitles = new Map(model.goals.map((goal) => [goal.id, goal.title]));
    if (model.entries.length === 0) {
      write("No entries.", 9.5, "italic", [130, 138, 150]);
    } else {
      for (const entry of model.entries) {
        ensure(54);
        write(
          `${formatShort(entry.date)} · ${goalTitles.get(entry.goal_id) ?? "Goal"}`,
          9.5,
          "bold",
          [40, 45, 55],
          2,
        );
        if (entry.action) write(`Action: ${entry.action}`, 8.8, "normal", [75, 82, 95], 1);
        if (entry.learned) write(`Learned: ${entry.learned}`, 8.8, "normal", [75, 82, 95], 1);
        if (entry.difficulty) {
          write(`Difficulty: ${entry.difficulty}`, 8.8, "normal", [75, 82, 95], 1);
        }
        const details = [
          entry.minutes != null ? `${entry.minutes} min` : null,
          entry.confidence != null ? `confidence ${entry.confidence}/5` : null,
        ].filter(Boolean);
        if (details.length > 0) {
          write(details.join(" · "), 8, "normal", [120, 128, 140], 2);
        }
        y += 3;
      }
    }
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 158, 170);
    doc.text(`Striker · page ${page} of ${pages}`, margin, pageHeight - 28);
  }

  const dataUri = doc.output("datauristring");
  const comma = dataUri.indexOf(",");
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}

export async function writeMarkdownReport(
  model: ReportModel,
  fileName: string,
): Promise<string> {
  return writeExportFile(fileName, reportToMarkdown(model));
}

export async function reportToPdfBase64(model: ReportModel): Promise<string> {
  return renderPdf(model);
}

export async function writePdfReport(
  model: ReportModel,
  fileName: string,
): Promise<string> {
  return writeExportBase64(fileName, await reportToPdfBase64(model));
}
