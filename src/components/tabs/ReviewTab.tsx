import { useEffect, useState, type FormEvent } from "react";
import { summarizeWeek } from "../../lib/ai";
import { createWeeklyPlanIcs, weeklyPlanFileName } from "../../lib/calendar";
import { getReview, getWeeklyDraft, saveReview } from "../../lib/db";
import {
  addDays,
  formatMinutes,
  formatWeekRange,
  isoWeekLabel,
  startOfIsoWeek,
  todayKey,
} from "../../lib/dates";
import { writeExportFile } from "../../lib/export";
import type { AiWeekSummary, WeeklyReviewDraft } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { FlashcardsPanel } from "../FlashcardsPanel";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
} from "../icons";
import { EmptyGoal } from "../GoalSetup";
import {
  Button,
  Card,
  Field,
  IconButton,
  Segmented,
  Skeleton,
  TextArea,
} from "../ui";

interface ReviewForm {
  summary: string;
  plan: string;
  questions: string;
}

const EMPTY_FORM: ReviewForm = { summary: "", plan: "", questions: "" };

export function ReviewTab({ active }: { active: boolean }) {
  const goal = useAppStore((state) => state.goal);
  const mode = useAppStore((state) => state.reviewMode);
  const setMode = useAppStore((state) => state.setReviewMode);

  if (!goal) {
    return (
      <div className="px-4 pb-4">
        <EmptyGoal message="Set up your goal to review cards and close each week." />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-5">
      <div>
        <h1 className="text-[14px] font-semibold">Review</h1>
        <p className="text-[10.5px] text-muted">
          Recall what you learned, then close the week.
        </p>
      </div>

      <Segmented
        value={mode}
        options={[
          { value: "cards", label: "Cards" },
          { value: "weekly", label: "Weekly review" },
        ]}
        onChange={setMode}
      />

      {mode === "cards" ? (
        <FlashcardsPanel active={active} />
      ) : (
        <WeeklyReviewPanel active={active} />
      )}
    </div>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className="flex gap-1 text-[10.5px] leading-relaxed"
          >
            <span className="shrink-0 text-accent">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeeklyReviewPanel({ active }: { active: boolean }) {
  const goal = useAppStore((state) => state.goal);
  const settings = useAppStore((state) => state.settings);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);

  const currentWeek = startOfIsoWeek(todayKey());
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [form, setForm] = useState<ReviewForm>(EMPTY_FORM);
  const [stats, setStats] = useState<WeeklyReviewDraft | null>(null);
  const [hasSavedReview, setHasSavedReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiWeekSummary | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [exportingIcs, setExportingIcs] = useState(false);

  useEffect(() => {
    if (!goal || !active) return;
    const goalId = goal.id;
    let cancelled = false;
    setLoading(true);

    Promise.all([getReview(goalId, weekStart), getWeeklyDraft(goalId, weekStart)])
      .then(([review, draft]) => {
        if (cancelled) return;
        setStats(draft);
        setHasSavedReview(Boolean(review));
        setForm(
          review
            ? {
                summary: review.summary ?? "",
                plan: review.next_week_plan ?? "",
                questions: review.open_questions ?? "",
              }
            : {
                summary: draft.summary,
                plan: draft.nextWeekPlan,
                questions: draft.openQuestions,
              },
        );
      })
      .catch((error: unknown) => {
        console.error("Could not load weekly review", error);
        if (!cancelled) notify("Could not load review", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, goal?.id, notify, weekStart]);

  useEffect(() => {
    setAiSummary(null);
    setAiError(null);
  }, [weekStart]);

  async function handlePrefill() {
    if (!goal || loading) return;
    try {
      const draft = await getWeeklyDraft(goal.id, weekStart);
      setStats(draft);
      setHasSavedReview(false);
      setForm({
        summary: draft.summary,
        plan: draft.nextWeekPlan,
        questions: draft.openQuestions,
      });
      notify("Draft filled from this week's stats");
    } catch (error) {
      console.error("Could not build weekly draft", error);
      notify("Could not build the draft", "error");
    }
  }

  async function handleSummarize() {
    if (!goal || aiBusy || loading) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const summary = await summarizeWeek(
        settings,
        goal.id,
        goal.title,
        weekStart,
      );
      setAiSummary(summary);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not summarize this week";
      console.error("Could not summarize week", error);
      setAiError(message);
      notify(message, "error");
    } finally {
      setAiBusy(false);
    }
  }

  function handleApplyAi() {
    if (!aiSummary) return;
    const list = (items: string[], current: string) =>
      items.length > 0
        ? items.map((item) => `• ${item}`).join("\n")
        : current;
    setForm((prev) => ({
      summary: list(aiSummary.keyLearnings, prev.summary),
      plan: list(aiSummary.suggestions, prev.plan),
      questions: list(aiSummary.openQuestions, prev.questions),
    }));
    notify("AI summary applied — review and save");
  }

  async function handleExportIcs() {
    if (!goal || exportingIcs) return;
    setExportingIcs(true);
    try {
      const contents = createWeeklyPlanIcs({
        goalTitle: goal.title,
        weekStart,
        summary: form.summary,
        plan: form.plan,
        questions: form.questions,
      });
      const path = await writeExportFile(
        weeklyPlanFileName(weekStart),
        contents,
      );
      notify(`Calendar exported to ${path}`);
    } catch (error) {
      console.error("Could not export the calendar plan", error);
      notify("Could not export the calendar plan", "error");
    } finally {
      setExportingIcs(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goal || saving) return;
    setSaving(true);
    try {
      await saveReview({
        goalId: goal.id,
        weekStart,
        summary: form.summary,
        nextWeekPlan: form.plan,
        openQuestions: form.questions,
      });
      setHasSavedReview(true);
      bumpRevision();
      notify("Review saved");
    } catch (error) {
      console.error("Could not save weekly review", error);
      notify("Could not save review", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!goal) return null;

  const isCurrentWeek = weekStart >= currentWeek;

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <IconButton
            label="Previous week"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </IconButton>
          <div className="text-center">
            <p className="text-[12.5px] font-semibold">{isoWeekLabel(weekStart)}</p>
            <p className="text-[10.5px] text-muted">{formatWeekRange(weekStart)}</p>
          </div>
          <IconButton
            label="Next week"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </IconButton>
        </div>
        {!isCurrentWeek ? (
          <button
            type="button"
            onClick={() => setWeekStart(currentWeek)}
            className="mx-auto block text-[10.5px] font-medium text-accent hover:underline"
          >
            Back to this week
          </button>
        ) : null}
        <Button
          variant="subtle"
          className="h-7 w-full text-[10.5px]"
          onClick={() => void handleExportIcs()}
          disabled={exportingIcs || loading}
        >
          <DownloadIcon className="h-3 w-3" />
          {exportingIcs
            ? "Exporting…"
            : "Export plan to calendar (.ics)"}
        </Button>
      </Card>

      {loading ? (
        <Card className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </Card>
      ) : (
        <>
          {stats ? (
            <Card className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-medium">
                  {stats.entries} {stats.entries === 1 ? "entry" : "entries"} ·{" "}
                  {formatMinutes(stats.minutes)}
                </p>
                {stats.confidence != null ? (
                  <span className="text-[10px] text-muted">
                    {stats.confidence.toFixed(1)}/5 avg
                  </span>
                ) : null}
              </div>

              {stats.topSkills.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {stats.topSkills.map((skill) => (
                    <span
                      key={skill.name}
                      className="rounded-full border border-line bg-card2/60 px-1.5 py-0.5 text-[9.5px] text-muted"
                    >
                      {skill.name} · {formatMinutes(skill.minutes)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10.5px] text-muted">
                  No skills tagged this week.
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[9.5px] text-muted">
                  {hasSavedReview
                    ? "Saved review loaded"
                    : "Prefilled from this week's stats"}
                </span>
                <Button
                  variant="subtle"
                  className="h-7 px-2 text-[10.5px]"
                  onClick={() => void handlePrefill()}
                >
                  Pre-fill from stats
                </Button>
              </div>
            </Card>
          ) : null}

          <Card className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-medium">AI summary</p>
                <p className="text-[9.5px] text-muted">
                  Optional; sends this week's entries only when pressed.
                </p>
              </div>
              <Button
                variant="subtle"
                className="h-7 shrink-0 px-2 text-[10.5px]"
                onClick={() => void handleSummarize()}
                disabled={aiBusy || loading || !stats?.entries}
              >
                {aiBusy ? "Thinking…" : "Summarize week"}
              </Button>
            </div>

            {aiError ? (
              <p className="rounded-md border border-line bg-card2/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted">
                {aiError}
              </p>
            ) : null}

            {aiSummary ? (
              <div className="space-y-2 border-t border-line pt-2">
                <AiList title="Key learnings" items={aiSummary.keyLearnings} />
                <AiList title="Suggestions" items={aiSummary.suggestions} />
                <AiList title="Open questions" items={aiSummary.openQuestions} />
                <div className="flex gap-2 pt-0.5">
                  <Button
                    className="h-7 flex-1 text-[10.5px]"
                    onClick={handleApplyAi}
                  >
                    Apply to review
                  </Button>
                  <Button
                    variant="subtle"
                    className="h-7 px-2 text-[10.5px]"
                    onClick={() => setAiSummary(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>

          <form onSubmit={(event) => void handleSave(event)} className="space-y-3">
            <Card className="space-y-3">
              <Field label="Summary" htmlFor="review-summary" hint="what happened">
                <TextArea
                  id="review-summary"
                  rows={3}
                  value={form.summary}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, summary: event.target.value }))
                  }
                  placeholder="What moved forward this week?"
                  maxLength={2_000}
                />
              </Field>

              <Field label="Next week plan" htmlFor="review-plan" hint="what's next">
                <TextArea
                  id="review-plan"
                  rows={3}
                  value={form.plan}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, plan: event.target.value }))
                  }
                  placeholder="Pick the one or two things that matter most."
                  maxLength={2_000}
                />
              </Field>

              <Field
                label="Open questions"
                htmlFor="review-questions"
                hint="parking lot"
              >
                <TextArea
                  id="review-questions"
                  rows={2}
                  value={form.questions}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, questions: event.target.value }))
                  }
                  placeholder="Anything unresolved you want to revisit?"
                  maxLength={2_000}
                />
              </Field>
            </Card>

            <Button type="submit" className="h-10 w-full" disabled={saving}>
              {saving ? "Saving…" : "Save review"}
            </Button>
            <p className="text-center text-[10.5px] text-muted">
              Saved against ISO week {isoWeekLabel(weekStart)}
            </p>
          </form>
        </>
      )}
    </div>
  );
}
