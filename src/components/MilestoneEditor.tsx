import { useEffect, useState } from "react";
import {
  deleteMilestone,
  getRecentEntries,
  saveMilestone,
  setMilestoneCompleted,
} from "../lib/db";
import { formatShort } from "../lib/dates";
import type { EntryOption, MilestoneWithProgress } from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import { CheckIcon, TrashIcon } from "./icons";
import { Button, Card, Field, TextInput, cx } from "./ui";

interface Props {
  goalId: number;
  milestone: MilestoneWithProgress | null;
  onClose: () => void;
  onSaved: () => void;
}

export function MilestoneEditor({ goalId, milestone, onClose, onSaved }: Props) {
  const notify = useAppStore((state) => state.notify);

  const [title, setTitle] = useState(milestone?.title ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [targetDate, setTargetDate] = useState(milestone?.target_date ?? "");
  const [targetHours, setTargetHours] = useState(
    milestone
      ? milestone.target_minutes
        ? String(Math.round((milestone.target_minutes / 60) * 10) / 10)
        : ""
      : // Prefill a sensible effort target so new milestones get a progress bar.
        "10",
  );
  const [entryIds, setEntryIds] = useState<number[]>(milestone?.entry_ids ?? []);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingEntries(true);
    getRecentEntries(goalId, 50)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((error: unknown) => {
        console.warn("Could not load entries for linking", error);
      })
      .finally(() => {
        if (!cancelled) setLoadingEntries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [goalId]);

  function toggleEntry(id: number) {
    setEntryIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleSave() {
    if (!title.trim() || saving) return;
    const hours = Number(targetHours);
    setSaving(true);
    try {
      await saveMilestone({
        id: milestone?.id,
        goalId,
        title,
        description: description.trim() || null,
        targetDate: targetDate || null,
        targetMinutes:
          targetHours.trim() !== "" && Number.isFinite(hours)
            ? Math.max(0, Math.round(hours * 60))
            : null,
        entryIds,
      });
      notify(milestone ? "Milestone updated" : "Milestone created");
      onSaved();
    } catch (error) {
      console.error("Could not save milestone", error);
      notify("Could not save milestone", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleComplete() {
    if (!milestone || completing) return;
    setCompleting(true);
    try {
      await setMilestoneCompleted(milestone.id, !milestone.completed_at);
      notify(milestone.completed_at ? "Milestone reopened" : "Milestone completed");
      onSaved();
    } catch (error) {
      console.error("Could not update milestone", error);
      notify("Could not update milestone", "error");
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete() {
    if (!milestone) return;
    try {
      await deleteMilestone(milestone.id);
      notify("Milestone deleted");
      onSaved();
    } catch (error) {
      console.error("Could not delete milestone", error);
      notify("Could not delete milestone", "error");
    }
  }

  return (
    <Card className="space-y-2.5 bg-card/80">
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
          {milestone ? "Edit milestone" : "New milestone"}
        </p>
        <div className="flex items-center gap-2">
          {milestone ? (
            <span
              className={
                milestone.completed_at
                  ? "rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium text-accent"
                  : "rounded-full border border-line px-1.5 py-0.5 text-[9px] text-muted"
              }
            >
              {milestone.completed_at ? "Completed" : "In progress"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>

      <TextInput
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Milestone title"
        aria-label="Milestone title"
        autoFocus
        maxLength={160}
      />

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
        placeholder="What does done look like? (optional)"
        aria-label="Milestone description"
        maxLength={1_000}
        className="w-full resize-none rounded-lg border border-line bg-card2/60 px-2.5 py-2 text-[12px] leading-relaxed text-ink outline-none transition placeholder:text-muted/60 focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
      />

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Target date" htmlFor="milestone-date">
          <TextInput
            id="milestone-date"
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </Field>
        <Field label="Target hours" htmlFor="milestone-hours" hint="optional">
          <TextInput
            id="milestone-hours"
            type="number"
            min={0}
            max={10_000}
            step={0.5}
            value={targetHours}
            onChange={(event) => setTargetHours(event.target.value)}
            placeholder="10"
          />
        </Field>
      </div>

      {milestone ? (
        <button
          type="button"
          onClick={() => void handleToggleComplete()}
          disabled={completing}
          className={cx(
            "flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[11px] font-medium transition disabled:opacity-50",
            milestone.completed_at
              ? "border-line text-muted hover:border-accent/50 hover:text-ink"
              : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15",
          )}
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {completing
            ? "Updating…"
            : milestone.completed_at
              ? "Reopen milestone"
              : "Mark complete"}
        </button>
      ) : null}

      <Field label="Linked entries" hint={`${entryIds.length} selected`}>
        <div className="max-h-36 overflow-y-auto rounded-lg border border-line bg-card2/40 p-1">
          {loadingEntries ? (
            <p className="px-2 py-3 text-center text-[10px] text-muted">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-2 py-3 text-center text-[10px] leading-relaxed text-muted">
              No entries yet — log one and it will appear here.
            </p>
          ) : (
            entries.map((entry) => {
              const selected = entryIds.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => toggleEntry(entry.id)}
                  aria-pressed={selected}
                  className={cx(
                    "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] transition",
                    selected ? "bg-accent/10" : "hover:bg-card2/70",
                  )}
                >
                  <span
                    className={cx(
                      "grid h-3.5 w-3.5 shrink-0 place-items-center rounded border",
                      selected
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line",
                    )}
                  >
                    {selected ? <CheckIcon className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatShort(entry.date)}
                  </span>
                  <span className="truncate text-ink/90">
                    {entry.action ?? entry.learned ?? entry.text}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </Field>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={() => void handleSave()}
          className="h-9 flex-1"
          disabled={saving || !title.trim()}
        >
          {saving ? "Saving…" : milestone ? "Save milestone" : "Create milestone"}
        </Button>

        {milestone ? (
          confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="h-9 rounded-lg bg-danger px-2.5 text-[11px] font-medium text-white"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="h-9 rounded-lg border border-line px-2.5 text-[11px]"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete milestone"
              title="Delete milestone"
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition hover:border-danger/60 hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )
        ) : null}
      </div>
    </Card>
  );
}
