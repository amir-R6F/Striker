import { useEffect, useState, type FormEvent } from "react";
import {
  deleteFlashcard,
  getFlashcards,
  getFlashcardSuggestions,
  getRecentEntries,
  reviewFlashcard,
  saveFlashcard,
} from "../lib/db";
import { formatShort, todayKey } from "../lib/dates";
import {
  GRADE_LABELS,
  GRADE_ORDER,
  formatInterval,
  previewInterval,
} from "../lib/srs";
import type {
  EntryOption,
  FlashcardGrade,
  FlashcardSuggestion,
  FlashcardWithEntry,
} from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import {
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  SparkIcon,
  TrashIcon,
} from "./icons";
import { EmptyGoal } from "./GoalSetup";
import {
  Button,
  Card,
  Field,
  IconButton,
  Select,
  Skeleton,
  TextArea,
  cx,
} from "./ui";

interface CardForm {
  front: string;
  back: string;
  entryId: string;
}

const EMPTY_FORM: CardForm = { front: "", back: "", entryId: "" };

export function FlashcardsPanel({ active }: { active: boolean }) {
  const goal = useAppStore((state) => state.goal);
  const revision = useAppStore((state) => state.revision);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);
  const draft = useAppStore((state) => state.flashcardDraft);
  const clearFlashcardDraft = useAppStore((state) => state.clearFlashcardDraft);

  const [cards, setCards] = useState<FlashcardWithEntry[]>([]);
  const [suggestions, setSuggestions] = useState<FlashcardSuggestion[]>([]);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [queue, setQueue] = useState<number[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const today = todayKey();
  const dueCount = cards.filter((card) => card.due_date <= today).length;
  const current =
    queue.length > 0
      ? cards.find((card) => card.id === queue[0]) ?? null
      : null;

  useEffect(() => {
    if (!active || !goal) return;
    const goalId = goal.id;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getFlashcards(goalId),
      getFlashcardSuggestions(goalId),
      getRecentEntries(goalId, 100),
    ])
      .then(([nextCards, nextSuggestions, nextEntries]) => {
        if (cancelled) return;
        setCards(nextCards);
        setSuggestions(nextSuggestions);
        setEntries(nextEntries);
        const due = nextCards.filter((card) => card.due_date <= today);
        setQueue(due.map((card) => card.id));
        setSessionTotal(due.length);
        setRevealed(false);
      })
      .catch((error: unknown) => {
        console.error("Could not load flashcards", error);
        if (!cancelled) notify("Could not load flashcards", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, goal?.id, notify, revision, today]);

  useEffect(() => {
    if (!active || !draft) return;
    setForm({
      front: draft.front,
      back: draft.back,
      entryId: draft.entryId != null ? String(draft.entryId) : "",
    });
    setFormOpen(true);
    clearFlashcardDraft();
  }, [active, clearFlashcardDraft, draft]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goal || saving) return;
    const front = form.front.trim();
    const back = form.back.trim();
    if (!front || !back) {
      notify("Add both sides of the card", "error");
      return;
    }
    setSaving(true);
    try {
      await saveFlashcard({
        id: editingId ?? undefined,
        goalId: goal.id,
        entryId: form.entryId ? Number(form.entryId) : null,
        front,
        back,
      });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      setEditingId(null);
      bumpRevision();
      notify(editingId != null ? "Card updated" : "Card added");
    } catch (error) {
      console.error("Could not save flashcard", error);
      notify("Could not save card", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleGrade(grade: FlashcardGrade) {
    if (!current || grading) return;
    setGrading(true);
    try {
      const updated = await reviewFlashcard(current.id, grade);
      setCards((prev) =>
        prev.map((card) => (card.id === updated.id ? updated : card)),
      );
      setQueue((prev) => prev.filter((id) => id !== current.id));
      setRevealed(false);
    } catch (error) {
      console.error("Could not review flashcard", error);
      notify("Could not update the card", "error");
    } finally {
      setGrading(false);
    }
  }

  async function handleSuggestion(suggestion: FlashcardSuggestion) {
    if (!goal) return;
    try {
      await saveFlashcard({
        goalId: goal.id,
        entryId: suggestion.entry_id,
        front: suggestion.front,
        back: suggestion.back,
      });
      bumpRevision();
      notify("Card added");
    } catch (error) {
      console.error("Could not add suggested card", error);
      notify("Could not add that card", "error");
    }
  }

  function startEdit(card: FlashcardWithEntry) {
    setEditingId(card.id);
    setForm({
      front: card.front,
      back: card.back,
      entryId: card.entry_id != null ? String(card.entry_id) : "",
    });
    setFormOpen(true);
  }

  async function handleDelete(id: number) {
    try {
      await deleteFlashcard(id);
      if (editingId === id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormOpen(false);
      }
      bumpRevision();
      notify("Card deleted");
    } catch (error) {
      console.error("Could not delete flashcard", error);
      notify("Could not delete that card", "error");
    }
  }

  if (!goal) {
    return (
      <EmptyGoal message="Set up your goal and turn what you learn into review cards." />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] text-muted">
          {dueCount} due · {cards.length} {cards.length === 1 ? "card" : "cards"}
        </p>
        <Button
          variant="subtle"
          className="h-7 px-2 text-[11px]"
          onClick={() => {
            if (formOpen) setEditingId(null);
            setFormOpen((open) => !open);
          }}
          aria-expanded={formOpen}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add card
        </Button>
      </div>

      {formOpen ? (
        <form onSubmit={(event) => void handleSave(event)}>
          <Card className="space-y-2.5">
            <p className="text-[11px] font-medium text-muted">
              {editingId != null ? "Edit card" : "New card"}
            </p>
            <Field label="Front" htmlFor="card-front" hint="prompt">
              <TextArea
                id="card-front"
                rows={2}
                value={form.front}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, front: event.target.value }))
                }
                placeholder="What do you want to recall?"
                maxLength={500}
              />
            </Field>
            <Field label="Back" htmlFor="card-back" hint="answer">
              <TextArea
                id="card-back"
                rows={3}
                value={form.back}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, back: event.target.value }))
                }
                placeholder="The answer, in your own words."
                maxLength={2_000}
              />
            </Field>
            <Field label="Link to entry" htmlFor="card-entry" hint="optional">
              <Select
                id="card-entry"
                value={form.entryId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, entryId: event.target.value }))
                }
              >
                <option value="">No entry</option>
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {formatShort(entry.date)} —{" "}
                    {(entry.action ?? entry.learned ?? entry.text).slice(0, 40)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                className="h-8 flex-1 text-[12px]"
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : editingId != null
                    ? "Save changes"
                    : "Save card"}
              </Button>
              <Button
                type="button"
                variant="subtle"
                className="h-8 px-3 text-[12px]"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setFormOpen(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </Card>
        </form>
      ) : null}

      {loading ? (
        <Card className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-8 w-full" />
        </Card>
      ) : current ? (
        <Card className="space-y-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>
              Card {sessionTotal - queue.length + 1} of {sessionTotal}
            </span>
            {current.entry_date ? (
              <span>Linked to {formatShort(current.entry_date)}</span>
            ) : (
              <span>New card</span>
            )}
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Front
          </p>
          <p className="whitespace-pre-wrap text-[13.5px] font-medium leading-relaxed">
            {current.front}
          </p>

          {revealed ? (
            <>
              <div className="space-y-2 border-t border-line pt-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Back
                </p>
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">
                  {current.back}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {GRADE_ORDER.map((grade) => (
                  <Button
                    key={grade}
                    variant={grade === "good" ? "primary" : "subtle"}
                    className="h-10 px-0"
                    disabled={grading}
                    onClick={() => void handleGrade(grade)}
                    aria-label={`${GRADE_LABELS[grade]} — next review in ${formatInterval(
                      previewInterval(current, grade),
                    )}`}
                  >
                    <span className="flex flex-col items-center gap-0.5 leading-none">
                      <span className="text-[11px]">{GRADE_LABELS[grade]}</span>
                      <span className="text-[8.5px] opacity-70">
                        {formatInterval(previewInterval(current, grade))}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <Button
              className="h-9 w-full text-[12px]"
              onClick={() => setRevealed(true)}
            >
              Show answer
            </Button>
          )}
        </Card>
      ) : (
        <Card>
          <p className="py-4 text-center text-[11.5px] leading-relaxed text-muted">
            {cards.length > 0
              ? "All caught up — no cards are due today."
              : "No cards yet. Add one, or pull a suggestion from your entries below."}
          </p>
        </Card>
      )}

      {suggestions.length > 0 ? (
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              From your entries
            </p>
            <span className="text-[10px] text-muted">{suggestions.length}</span>
          </div>
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <Card
                key={suggestion.entry_id}
                className="flex items-start gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[12px] font-medium leading-snug">
                    {suggestion.front}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-muted">
                    {suggestion.back}
                  </p>
                  <p className="mt-1 text-[9.5px] text-muted">
                    {formatShort(suggestion.entry_date)}
                  </p>
                </div>
                <Button
                  variant="subtle"
                  className="h-7 shrink-0 px-2 text-[10.5px]"
                  onClick={() => void handleSuggestion(suggestion)}
                  aria-label={`Make a card from the ${formatShort(
                    suggestion.entry_date,
                  )} entry`}
                >
                  <SparkIcon className="h-3 w-3" />
                  Add
                </Button>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {cards.length > 0 ? (
        <section>
          <button
            type="button"
            onClick={() => setManageOpen((open) => !open)}
            aria-expanded={manageOpen}
            className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
          >
            All cards
            <span className="flex items-center gap-1 text-[10px] font-normal normal-case tracking-normal">
              {cards.length}
              <ChevronDownIcon
                className={cx(
                  "h-3.5 w-3.5 transition-transform",
                  manageOpen && "rotate-180",
                )}
              />
            </span>
          </button>

          {manageOpen ? (
            <div className="mt-2 space-y-1.5">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-start gap-2 rounded-lg border border-line bg-card px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[11.5px] font-medium">
                      {card.front}
                    </p>
                    <p className="text-[9.5px] text-muted">
                      {card.due_date <= today
                        ? "Due today"
                        : `Due ${formatShort(card.due_date)}`}
                      {" · "}
                      {card.repetitions > 0
                        ? `${card.repetitions} rep${
                            card.repetitions === 1 ? "" : "s"
                          }`
                        : "new"}
                      {card.lapses > 0
                        ? ` · ${card.lapses} lapse${card.lapses === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <IconButton
                    label={`Edit card: ${card.front.slice(0, 40)}`}
                    className="h-6 w-6"
                    onClick={() => startEdit(card)}
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Delete card: ${card.front.slice(0, 40)}`}
                    className="h-6 w-6"
                    onClick={() => void handleDelete(card.id)}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
