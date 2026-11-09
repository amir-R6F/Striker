import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { addEntry, getDaySummary, getSkills } from "../../lib/db";
import { formatDay, formatMinutes, todayKey } from "../../lib/dates";
import { evidenceKindFor, importEvidenceFile } from "../../lib/evidence";
import {
  artStationEvidence,
  blenderEvidence,
  githubEvidence,
} from "../../lib/integrations";
import type { EvidenceInput, Skill } from "../../lib/types";
import { SETTING_KEYS } from "../../lib/settings";
import { useAppStore } from "../../store/useAppStore";
import { PomodoroCard } from "../PomodoroCard";
import {
  ChevronDownIcon,
  FileIcon,
  ImageIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
} from "../icons";
import { GoalSetup } from "../GoalSetup";
import { Button, Card, Field, TextInput, cx } from "../ui";

type FocusTarget = "action" | "learned" | "difficulty";

interface Template {
  id: string;
  label: string;
  action: string;
  learned?: string;
  difficulty?: string;
  minutes?: string;
  openDetails: boolean;
  focus: FocusTarget;
}

const TEMPLATES: Template[] = [
  {
    id: "practice",
    label: "Practice session",
    action: "Practice session",
    minutes: "45",
    openDetails: true,
    focus: "learned",
  },
  {
    id: "problem",
    label: "Problem & solution",
    action: "Problem & solution",
    difficulty: "Open question: ",
    openDetails: true,
    focus: "difficulty",
  },
  {
    id: "idea",
    label: "Project idea",
    action: "Project idea",
    learned: "Idea: ",
    openDetails: false,
    focus: "learned",
  },
  {
    id: "review",
    label: "Weekly review",
    action: "Weekly review",
    minutes: "30",
    openDetails: true,
    focus: "learned",
  },
];

function orderedSkillRows(skills: Skill[]): Array<{ skill: Skill; depth: number }> {
  const childrenOf = new Map<number, Skill[]>();
  for (const skill of skills) {
    const parent = skill.parent_id ?? 0;
    const children = childrenOf.get(parent) ?? [];
    children.push(skill);
    childrenOf.set(parent, children);
  }
  for (const children of childrenOf.values()) {
    children.sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name));
  }
  const rows: Array<{ skill: Skill; depth: number }> = [];
  const visit = (parent: number, depth: number) => {
    for (const skill of childrenOf.get(parent) ?? []) {
      rows.push({ skill, depth });
      visit(skill.id, depth + 1);
    }
  };
  visit(0, 0);
  return rows;
}

export function LogTab({ active }: { active: boolean }) {
  const goal = useAppStore((state) => state.goal);
  const settings = useAppStore((state) => state.settings);
  const revision = useAppStore((state) => state.revision);
  const quickLogNonce = useAppStore((state) => state.quickLogNonce);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);
  const setTab = useAppStore((state) => state.setTab);

  const today = todayKey();
  const actionRef = useRef<HTMLInputElement>(null);
  const learnedRef = useRef<HTMLTextAreaElement>(null);
  const difficultyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [action, setAction] = useState("");
  const [learned, setLearned] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [source, setSource] = useState("");
  const [evidence, setEvidence] = useState("");
  const [attachments, setAttachments] = useState<EvidenceInput[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [skillIds, setSkillIds] = useState<number[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillError, setSkillError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ entries: 0, minutes: 0 });
  const [githubUrl, setGithubUrl] = useState("");
  const [artStationUrl, setArtStationUrl] = useState("");
  const [blenderPath, setBlenderPath] = useState("");

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => learnedRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [active, goal?.id, quickLogNonce]);

  useEffect(() => {
    if (!goal) return;
    let cancelled = false;
    getDaySummary(goal.id, today)
      .then((next) => {
        if (!cancelled) setSummary(next);
      })
      .catch((error: unknown) => console.warn("Could not load today's summary", error));
    return () => {
      cancelled = true;
    };
  }, [goal, revision, today]);

  const activeTreeId = Number(settings[SETTING_KEYS.activeSkillTree]) || null;

  useEffect(() => {
    let cancelled = false;
    getSkills()
      .then((all) => {
        if (cancelled) return;
        setSkills(
          activeTreeId != null
            ? all.filter((skill) => skill.tree_id === activeTreeId)
            : all,
        );
        setSkillError(false);
      })
      .catch((error: unknown) => {
        console.warn("Could not load skills", error);
        if (!cancelled) setSkillError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTreeId, revision]);

  function focusField(target: FocusTarget) {
    window.requestAnimationFrame(() => {
      if (target === "action") actionRef.current?.focus();
      else if (target === "difficulty") difficultyRef.current?.focus();
      else learnedRef.current?.focus();
    });
  }

  function applyTemplate(template: Template) {
    // Templates are a starting point: reset the fields they own, keep skills.
    setAction(template.action);
    setLearned(template.learned ?? "");
    setDifficulty(template.difficulty ?? "");
    setMinutes(template.minutes ?? "");
    setDetailsOpen(template.openDetails);
    focusField(template.focus);
  }

  function toggleSkill(id: number) {
    setSkillIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleAttachFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0 || attaching) return;
    setAttaching(true);
    try {
      for (const file of files) {
        try {
          const imported = await importEvidenceFile(file);
          setAttachments((current) => [...current, imported]);
        } catch (error) {
          console.error("Could not attach evidence", error);
          notify(
            error instanceof Error ? error.message : "Could not attach file",
            "error",
          );
        }
      }
    } finally {
      setAttaching(false);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function attachLink(kind: "github" | "artstation") {
    const item =
      kind === "github"
        ? githubEvidence(githubUrl)
        : artStationEvidence(artStationUrl);
    if (!item) {
      notify(
        kind === "github"
          ? "Enter a GitHub commit, issue or pull request URL"
          : "Enter an ArtStation URL",
        "error",
      );
      return;
    }
    setAttachments((current) =>
      current.some((existing) => existing.path === item.path)
        ? current
        : [...current, item],
    );
    if (kind === "github") setGithubUrl("");
    else setArtStationUrl("");
    notify(`${item.originalName ?? "Link"} attached`);
  }

  function attachBlender() {
    const item = blenderEvidence(blenderPath);
    if (!item) {
      notify("Enter an absolute path to a .blend file", "error");
      return;
    }
    setAttachments((current) =>
      current.some((existing) => existing.path === item.path)
        ? current
        : [...current, item],
    );
    setBlenderPath("");
    notify("Blender project attached");
  }

  async function handleSave(event?: FormEvent) {
    event?.preventDefault();
    if (!goal || saving) return;

    if (!action.trim() && !learned.trim()) {
      focusField("action");
      return;
    }

    const parsedMinutes = Number(minutes);
    // Drop ids whose skill was deleted in another tab after selection.
    const selected = skills.filter((skill) => skillIds.includes(skill.id));
    const typedEvidence = evidence.trim();
    const evidenceItems: EvidenceInput[] = [...attachments];
    if (typedEvidence) {
      const kind = evidenceKindFor(typedEvidence);
      evidenceItems.push({
        kind,
        path: typedEvidence,
        originalName: kind === "link" ? typedEvidence : null,
      });
    }
    setSaving(true);
    try {
      await addEntry({
        goalId: goal.id,
        date: today,
        action: action.trim() || null,
        learned: learned.trim() || null,
        difficulty: difficulty.trim() || null,
        source: source.trim() || null,
        evidence: typedEvidence || null,
        evidenceItems,
        minutes:
          minutes.trim() === "" || !Number.isFinite(parsedMinutes)
            ? null
            : Math.max(0, Math.round(parsedMinutes)),
        // Only store a rating the user actually opted into.
        confidence: detailsOpen ? confidence : null,
        skillIds: selected.map((skill) => skill.id),
        skillTag: selected[0]?.name ?? null,
      });
      setAction("");
      setLearned("");
      setDifficulty("");
      setSource("");
      setEvidence("");
      setAttachments([]);
      setMinutes("");
      setConfidence(3);
      setSkillIds([]);
      setDetailsOpen(false);
      bumpRevision();
      notify("Logged");
      learnedRef.current?.focus();
    } catch (error) {
      console.error("Could not save entry", error);
      notify("Could not save entry", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!goal) {
    return (
      <div className="px-4 pb-4">
        <GoalSetup />
      </div>
    );
  }

  const skillRows = orderedSkillRows(skills);
  const selectedSkills = skills.filter((skill) => skillIds.includes(skill.id));

  return (
    <div className="flex flex-col gap-2.5 px-4 pb-5">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Quick log
          </p>
          <h1 className="text-[16px] font-semibold leading-tight">
            {formatDay(today)}
          </h1>
        </div>
        <span className="pb-0.5 text-[10.5px] text-muted">
          {summary.entries === 0
            ? "No entries yet"
            : `${formatMinutes(summary.minutes)} · ${summary.entries} ${
                summary.entries === 1 ? "entry" : "entries"
              }`}
        </span>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => applyTemplate(template)}
            className="shrink-0 rounded-full border border-line bg-card px-2 py-1 text-[10px] font-medium text-muted transition hover:border-accent/50 hover:text-ink"
          >
            {template.label}
          </button>
        ))}
      </div>

      <form onSubmit={(event) => void handleSave(event)} className="flex flex-col gap-2.5">
        <TextInput
          ref={actionRef}
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="What did you do?"
          aria-label="Action"
          maxLength={300}
        />

        <textarea
          ref={learnedRef}
          value={learned}
          onChange={(event) => setLearned(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void handleSave();
            }
          }}
          placeholder="What did you learn or practice?"
          aria-label="What you learned"
          spellCheck
          maxLength={4_000}
          className="h-[112px] w-full resize-none rounded-xl border border-line bg-card p-3 text-[13px] leading-relaxed text-ink outline-none transition placeholder:text-muted/60 focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
        />

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
              Skills {selectedSkills.length > 0 ? `· ${selectedSkills.length}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setTab("skills")}
              className="text-[9.5px] font-medium text-accent hover:underline"
            >
              Manage
            </button>
          </div>

          {skillError ? (
            <p className="text-[10.5px] text-muted">Could not load skills.</p>
          ) : skills.length === 0 ? (
            <button
              type="button"
              onClick={() => setTab("skills")}
              className="flex items-center gap-1 text-[10.5px] text-accent hover:underline"
            >
              <PlusIcon className="h-3 w-3" /> Add your first skill
            </button>
          ) : (
            <div className="flex max-h-[70px] flex-wrap gap-1 overflow-y-auto rounded-lg border border-line bg-card/60 p-1.5">
              {skillRows.map(({ skill, depth }) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleSkill(skill.id)}
                  aria-pressed={skillIds.includes(skill.id)}
                  style={{ marginLeft: Math.min(depth, 4) * 7 }}
                  className={cx(
                    "rounded-full border px-2 py-0.5 text-[10px] transition",
                    skillIds.includes(skill.id)
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-muted hover:text-ink",
                  )}
                >
                  {skill.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="flex items-center gap-1 self-start text-[11px] text-muted transition hover:text-ink"
        >
          <ChevronDownIcon
            className={cx("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-180")}
          />
          {detailsOpen ? "Hide details" : "Add details (optional)"}
        </button>

        {detailsOpen ? (
          <Card className="space-y-2.5 bg-card/80">
            <Field label="What was hard / open question" htmlFor="log-difficulty">
              <textarea
                id="log-difficulty"
                ref={difficultyRef}
                rows={2}
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                placeholder="Where did you get stuck?"
                maxLength={1_500}
                className="w-full resize-none rounded-lg border border-line bg-card2/60 px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none transition placeholder:text-muted/60 focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Source" htmlFor="log-source" hint="link">
                <TextInput
                  id="log-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  maxLength={1_000}
                />
              </Field>
              <Field label="Evidence" htmlFor="log-evidence" hint="link / path">
                <TextInput
                  id="log-evidence"
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="C:\… or https://…"
                  maxLength={1_000}
                />
              </Field>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Attachments
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attaching}
                  className="flex items-center gap-1 text-[10px] font-medium text-accent hover:underline disabled:opacity-50"
                >
                  <PlusIcon className="h-3 w-3" />
                  {attaching ? "Adding…" : "Attach file"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleAttachFiles(event)}
                />
              </div>
              {attachments.length === 0 ? (
                <p className="text-[10px] leading-relaxed text-muted">
                  Images or PDFs up to 8 MB. A URL in Evidence is saved as a
                  link.
                </p>
              ) : (
                <div className="space-y-1">
                  {attachments.map((item, index) => (
                    <div
                      key={`${item.path}-${index}`}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-card2/50 px-2 py-1"
                    >
                      {item.kind === "image" ? (
                        <ImageIcon className="h-3 w-3 shrink-0 text-muted" />
                      ) : item.kind === "link" ? (
                        <LinkIcon className="h-3 w-3 shrink-0 text-muted" />
                      ) : (
                        <FileIcon className="h-3 w-3 shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[10px] text-ink/90">
                        {item.originalName ??
                          item.path.split(/[\\/]/).pop() ??
                          "Attachment"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        aria-label="Remove attachment"
                        className="text-muted hover:text-danger"
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5 border-t border-line pt-2.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                Integrations
              </span>
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <TextInput
                  value={githubUrl}
                  onChange={(event) => setGithubUrl(event.target.value)}
                  placeholder="GitHub commit / issue URL"
                  inputMode="url"
                  maxLength={1_000}
                  className="py-1.5 text-[11px]"
                  aria-label="GitHub commit or issue URL"
                />
                <Button
                  type="button"
                  variant="subtle"
                  className="h-8 px-2 text-[10px]"
                  onClick={() => attachLink("github")}
                >
                  Add
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <TextInput
                  value={artStationUrl}
                  onChange={(event) => setArtStationUrl(event.target.value)}
                  placeholder="ArtStation URL"
                  inputMode="url"
                  maxLength={1_000}
                  className="py-1.5 text-[11px]"
                  aria-label="ArtStation URL"
                />
                <Button
                  type="button"
                  variant="subtle"
                  className="h-8 px-2 text-[10px]"
                  onClick={() => attachLink("artstation")}
                >
                  Add
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <TextInput
                  value={blenderPath}
                  onChange={(event) => setBlenderPath(event.target.value)}
                  placeholder="D:\\Projects\\scene.blend"
                  maxLength={1_000}
                  className="py-1.5 text-[11px]"
                  aria-label="Blender file path"
                />
                <Button
                  type="button"
                  variant="subtle"
                  className="h-8 px-2 text-[10px]"
                  onClick={attachBlender}
                >
                  Add
                </Button>
              </div>
              <p className="text-[9.5px] leading-relaxed text-muted">
                GitHub commits/issues, ArtStation pages and local Blender files
                are saved as evidence links.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Minutes" htmlFor="log-minutes">
                <TextInput
                  id="log-minutes"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1_440}
                  step={5}
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                  placeholder="45"
                />
              </Field>
              <Field label="Confidence" hint={`${confidence} / 5`} htmlFor="log-confidence">
                <input
                  id="log-confidence"
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={confidence}
                  onChange={(event) => setConfidence(Number(event.target.value))}
                  className="mt-2 h-4 w-full"
                />
              </Field>
            </div>
          </Card>
        ) : null}

        <Button
          type="submit"
          className="h-10 w-full"
          disabled={saving || (!action.trim() && !learned.trim())}
        >
          {saving ? "Saving…" : "Log entry"}
        </Button>
      </form>

      <PomodoroCard active={active} />

      <p className="text-center text-[10px] text-muted">
        Ctrl + Enter saves · templates fill the structure
      </p>
    </div>
  );
}
