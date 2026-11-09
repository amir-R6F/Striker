import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  getEntryEvidence,
  getEntrySkillIds,
  getSkills,
  getSkillTrees,
  updateEntry,
} from "../lib/db";
import { formatShort } from "../lib/dates";
import {
  deleteEvidenceFile,
  evidenceKindFor,
  importEvidenceFile,
} from "../lib/evidence";
import { orderedSkillRows } from "../lib/skillTree";
import { SETTING_KEYS } from "../lib/settings";
import { ENTRY_TEMPLATES, type EntryTemplate } from "../lib/templates";
import type { Entry, EvidenceInput, Skill } from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import {
  ChevronDownIcon,
  FileIcon,
  ImageIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
} from "./icons";
import { Button, Card, Field, TextInput, cx } from "./ui";

interface Props {
  entry: Entry;
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * Reuses the quick-log fields to edit an existing entry. Skill links and
 * evidence rows are replaced atomically by `updateEntry`.
 */
export function EntryEditor({ entry, onCancel, onSaved }: Props) {
  const settings = useAppStore((state) => state.settings);
  const notify = useAppStore((state) => state.notify);

  const [action, setAction] = useState(entry.action ?? "");
  const [learned, setLearned] = useState(entry.learned ?? "");
  const [difficulty, setDifficulty] = useState(entry.difficulty ?? "");
  const [source, setSource] = useState(entry.source ?? "");
  const [evidence, setEvidence] = useState(entry.evidence ?? "");
  const [minutes, setMinutes] = useState(
    entry.minutes != null ? String(entry.minutes) : "",
  );
  const [confidence, setConfidence] = useState(entry.confidence ?? 3);
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(
      entry.difficulty ||
        entry.source ||
        entry.confidence != null ||
        entry.minutes != null,
    ),
  );

  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillIds, setSkillIds] = useState<number[]>([]);
  const [attachments, setAttachments] = useState<EvidenceInput[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTreeId = Number(settings[SETTING_KEYS.activeSkillTree]) || null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getEntryEvidence(entry.id),
      getEntrySkillIds(entry.id),
      getSkills(),
      getSkillTrees(entry.goal_id),
    ])
      .then(([rows, linked, allSkills, trees]) => {
        if (cancelled) return;
        setAttachments(
          rows.map((item) => ({
            id: item.id,
            kind: item.kind,
            path: item.path,
            originalName: item.original_name,
          })),
        );
        setSkillIds(linked);
        const treeIds = new Set(trees.map((tree) => tree.id));
        const scoped = allSkills.filter((skill) => treeIds.has(skill.tree_id));
        setSkills(
          activeTreeId != null && treeIds.has(activeTreeId)
            ? scoped.filter((skill) => skill.tree_id === activeTreeId)
            : scoped,
        );
      })
      .catch((error: unknown) => {
        console.error("Could not load entry details", error);
        if (!cancelled) notify("Could not load entry details", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTreeId, entry.goal_id, entry.id, notify]);

  function applyTemplate(template: EntryTemplate) {
    setAction(template.action);
    setLearned(template.learned ?? "");
    setDifficulty(template.difficulty ?? "");
    setMinutes(template.minutes ?? "");
    setDetailsOpen(template.openDetails);
  }

  function toggleSkill(id: number) {
    setSkillIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function handleAttach(event: ChangeEvent<HTMLInputElement>) {
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

  function moveAttachment(index: number, direction: -1 | 1) {
    setAttachments((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function removeAttachment(index: number) {
    const item = attachments[index];
    if (!item) return;
    if (!window.confirm("Remove this attachment from the entry?")) return;
    if (item.id != null && item.kind !== "link") {
      const alsoDelete = window.confirm(
        "Also delete the copied file from disk after saving?\n\nChoose Cancel to keep the file.",
      );
      if (alsoDelete) {
        setPendingDeletes((current) => [...current, item.path]);
      }
    }
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!action.trim() && !learned.trim()) {
      notify("Add an action or a note first", "error");
      return;
    }

    const parsedMinutes = Number(minutes);
    const selected = skills.filter((skill) => skillIds.includes(skill.id));
    const typedEvidence = evidence.trim();
    const items: EvidenceInput[] = [...attachments];
    if (typedEvidence && !items.some((item) => item.path.trim() === typedEvidence)) {
      const kind = evidenceKindFor(typedEvidence);
      items.push({ kind, path: typedEvidence, originalName: kind === "link" ? typedEvidence : null });
    }

    setSaving(true);
    try {
      await updateEntry(entry.id, {
        goalId: entry.goal_id,
        date: entry.date,
        action: action.trim() || null,
        learned: learned.trim() || null,
        difficulty: difficulty.trim() || null,
        source: source.trim() || null,
        evidence: typedEvidence || null,
        evidenceItems: items,
        minutes:
          minutes.trim() === "" || !Number.isFinite(parsedMinutes)
            ? null
            : Math.max(0, Math.round(parsedMinutes)),
        confidence: detailsOpen ? confidence : null,
        skillIds: selected.map((skill) => skill.id),
        skillTag: selected[0]?.name ?? null,
      });

      for (const path of pendingDeletes) {
        await deleteEvidenceFile(path).catch((error: unknown) => {
          console.warn("Could not delete evidence file", error);
        });
      }

      notify("Entry updated");
      onSaved();
    } catch (error) {
      console.error("Could not update entry", error);
      notify("Could not update entry", "error");
    } finally {
      setSaving(false);
    }
  }

  const skillRows = orderedSkillRows(skills);

  return (
    <Card className="space-y-2.5 border-accent/40">
      <div className="flex items-baseline justify-between">
        <p className="text-[12.5px] font-semibold">Edit entry</p>
        <span className="text-[9.5px] text-muted">{formatShort(entry.date)}</span>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
        {ENTRY_TEMPLATES.map((template) => (
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
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="What did you do?"
          aria-label="Action"
          maxLength={300}
        />

        <textarea
          value={learned}
          onChange={(event) => setLearned(event.target.value)}
          placeholder="What did you learn or practice?"
          aria-label="What you learned"
          spellCheck
          maxLength={4_000}
          className="h-[90px] w-full resize-none rounded-xl border border-line bg-card p-3 text-[13px] leading-relaxed text-ink outline-none transition placeholder:text-muted/60 focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
        />

        <div className="space-y-1.5">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
            Skills {skillIds.length > 0 ? `· ${skillIds.length}` : ""}
          </span>
          {loading ? (
            <p className="text-[10.5px] text-muted">Loading skills…</p>
          ) : skills.length === 0 ? (
            <p className="text-[10.5px] text-muted">No skill nodes in this tree yet.</p>
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
            <Field label="What was hard / open question" htmlFor="edit-difficulty">
              <textarea
                id="edit-difficulty"
                rows={2}
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                placeholder="Where did you get stuck?"
                maxLength={1_500}
                className="w-full resize-none rounded-lg border border-line bg-card2/60 px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none transition placeholder:text-muted/60 focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Source" htmlFor="edit-source" hint="link">
                <TextInput
                  id="edit-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  maxLength={1_000}
                />
              </Field>
              <Field label="Evidence" htmlFor="edit-evidence" hint="link / path">
                <TextInput
                  id="edit-evidence"
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="C:\\… or https://…"
                  maxLength={1_000}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Minutes" htmlFor="edit-minutes">
                <TextInput
                  id="edit-minutes"
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
              <Field label="Confidence" hint={`${confidence} / 5`} htmlFor="edit-confidence">
                <input
                  id="edit-confidence"
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
                  onChange={(event) => void handleAttach(event)}
                />
              </div>

              {attachments.length === 0 ? (
                <p className="text-[10px] leading-relaxed text-muted">
                  Images or PDFs up to 8 MB. Links stay links.
                </p>
              ) : (
                <div className="space-y-1">
                  {attachments.map((item, index) => (
                    <div
                      key={`${item.id ?? "new"}-${item.path}-${index}`}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-card2/50 px-2 py-1"
                    >
                      {item.kind === "image" ? (
                        <ImageIcon className="h-3 w-3 shrink-0 text-muted" />
                      ) : item.kind === "link" ? (
                        <LinkIcon className="h-3 w-3 shrink-0 text-muted" />
                      ) : (
                        <FileIcon className="h-3 w-3 shrink-0 text-muted" />
                      )}
                      {item.id != null ? (
                        <input
                          value={item.originalName ?? ""}
                          onChange={(event) =>
                            setAttachments((current) =>
                              current.map((candidate, itemIndex) =>
                                itemIndex === index
                                  ? { ...candidate, originalName: event.target.value }
                                  : candidate,
                              ),
                            )
                          }
                          aria-label="Attachment label"
                          placeholder="Label"
                          maxLength={200}
                          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px] text-ink outline-none focus:border-line"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-[10px] text-ink/90">
                          {item.originalName ?? item.path.split(/[\\/]/).pop()}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => moveAttachment(index, -1)}
                        disabled={index === 0}
                        aria-label="Move attachment up"
                        className="text-[10px] text-muted hover:text-ink disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveAttachment(index, 1)}
                        disabled={index === attachments.length - 1}
                        aria-label="Move attachment down"
                        className="text-[10px] text-muted hover:text-ink disabled:opacity-30"
                      >
                        ↓
                      </button>
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
          </Card>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" className="h-9 flex-1 text-[12px]" disabled={saving || loading}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="subtle"
            className="h-9 px-3 text-[12px]"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
