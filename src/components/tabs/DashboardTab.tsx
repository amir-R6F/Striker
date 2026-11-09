import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getDashboard,
  getMilestones,
  getSkillConfidenceSeries,
  getSkillTimeSeries,
} from "../../lib/db";
import {
  addDays,
  daysBetween,
  formatMinutes,
  formatShort,
  startOfIsoWeek,
  todayKey,
} from "../../lib/dates";
import {
  buildCalendar,
  heatmapLevel,
  streakInfo,
  weekGoalProgress,
  type CalendarCell,
} from "../../lib/stats";
import { challengeProgress } from "../../lib/gamification";
import { computeStrikerScore } from "../../lib/score";
import {
  SETTING_KEYS,
  challengeStart,
  isChallengeEnabled,
  isGamificationEnabled,
} from "../../lib/settings";
import { CHART_COLORS, SKILL_PALETTE } from "../../lib/theme";
import type {
  DashboardData,
  MilestoneWithProgress,
  SkillConfidenceRow,
  SkillTimeRow,
} from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { EvidenceGallery } from "../EvidenceGallery";
import { GamificationCard } from "../GamificationCard";
import { MilestoneEditor } from "../MilestoneEditor";
import { StrikerScoreCard } from "../StrikerScoreCard";
import {
  CheckIcon,
  ClockIcon,
  FlagIcon,
  FlameIcon,
  PlusIcon,
  TrophyIcon,
} from "../icons";
import { EmptyGoal } from "../GoalSetup";
import { Button, Card, Skeleton, cx } from "../ui";

// Recharts and the chart code only ship when the dashboard is actually viewed.
const DashboardCharts = lazy(() => import("../charts/DashboardCharts"));

const HEATMAP_DAYS = 90;

const LEVEL_CLASSES = [
  "bg-line/40",
  "bg-accent/25",
  "bg-accent/45",
  "bg-accent/65",
  "bg-accent",
] as const;

function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-2.5">
      <div className="flex items-center gap-1 text-muted">
        {icon}
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em]">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-[17px] font-semibold leading-none tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10px] text-muted">{hint}</p>
    </div>
  );
}

function Heatmap({ cells }: { cells: Array<CalendarCell | null> }) {
  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
        {cells.map((cell, index) =>
          cell ? (
            <div
              key={cell.date}
              title={`${formatShort(cell.date)} — ${formatMinutes(cell.minutes)} · ${
                cell.entries
              } ${cell.entries === 1 ? "entry" : "entries"}`}
              className={cx(
                "h-[11px] w-[11px] rounded-[3px]",
                LEVEL_CLASSES[heatmapLevel(cell.minutes, cell.entries)],
              )}
            />
          ) : (
            <div key={`pad-${index}`} className="h-[11px] w-[11px]" />
          ),
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[9.5px] text-muted">
        <span>
          {formatShort(addDays(todayKey(), -(HEATMAP_DAYS - 1)))} — today
        </span>
        <span className="flex items-center gap-1">
          Less
          {LEVEL_CLASSES.map((level, index) => (
            <span
              key={`legend-${index}`}
              className={cx("h-2 w-2 rounded-[2px]", level)}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

function targetLabel(target: string | null): string | null {
  if (!target) return null;
  const diff = daysBetween(todayKey(), target);
  if (diff === 0) return "today";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `in ${diff}d`;
}

export function DashboardTab({ active }: { active: boolean }) {
  const goal = useAppStore((state) => state.goal);
  const theme = useAppStore((state) => state.theme);
  const visible = useAppStore((state) => state.visible);
  const revision = useAppStore((state) => state.revision);
  const settings = useAppStore((state) => state.settings);
  const setSetting = useAppStore((state) => state.setSetting);
  const notify = useAppStore((state) => state.notify);
  const bumpRevision = useAppStore((state) => state.bumpRevision);

  const [data, setData] = useState<DashboardData | null>(null);
  const [milestones, setMilestones] = useState<MilestoneWithProgress[]>([]);
  const [skillTime, setSkillTime] = useState<SkillTimeRow[]>([]);
  const [skillConfidence, setSkillConfidence] = useState<SkillConfidenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editor, setEditor] = useState<number | "new" | null>(null);

  useEffect(() => {
    if (!goal || !visible || !active) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getDashboard(goal.id, addDays(todayKey(), -(HEATMAP_DAYS - 1))),
      getMilestones(goal.id),
      getSkillTimeSeries(goal.id, addDays(todayKey(), -29)),
      getSkillConfidenceSeries(goal.id, addDays(todayKey(), -55)),
    ])
      .then(([nextData, nextMilestones, nextSkillTime, nextSkillConfidence]) => {
        if (cancelled) return;
        setData(nextData);
        setMilestones(nextMilestones);
        setSkillTime(nextSkillTime);
        setSkillConfidence(nextSkillConfidence);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Could not load dashboard", error);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, goal, revision, visible]);

  const weekStart = useMemo(() => startOfIsoWeek(todayKey()), []);
  const streaks = useMemo(() => streakInfo(data?.dates ?? []), [data]);
  const progress = useMemo(
    () =>
      weekGoalProgress(
        data?.daily ?? [],
        weekStart,
        goal?.weekly_hours_goal ?? 0,
      ),
    [data, goal?.weekly_hours_goal, weekStart],
  );
  const calendar = useMemo(
    () => buildCalendar(data?.daily ?? [], HEATMAP_DAYS),
    [data],
  );
  const completedMilestones = milestones.filter(
    (milestone) => milestone.completed_at != null,
  ).length;
  const score = useMemo(
    () =>
      computeStrikerScore({
        currentStreak: streaks.current,
        weeklyMinutes: progress.logged,
        weeklyGoalMinutes: progress.goal,
        distinctSkills30d: new Set(skillTime.map((row) => row.skill)).size,
        completedMilestones,
        totalMilestones: milestones.length,
      }),
    [completedMilestones, milestones.length, progress, skillTime, streaks.current],
  );
  const gamificationEnabled = isGamificationEnabled(settings);
  const challengeEnabled = isChallengeEnabled(settings);
  const challenge = challengeEnabled
    ? challengeProgress(challengeStart(settings), data?.dates ?? [])
    : null;

  async function handleStartChallenge() {
    await setSetting(SETTING_KEYS.challenge, "true");
    await setSetting(SETTING_KEYS.challengeStart, todayKey());
    notify("7-day challenge started");
  }

  if (!goal) {
    return (
      <div className="px-4 pb-4">
        <EmptyGoal message="Create your goal first, then your sessions and streaks will appear here." />
      </div>
    );
  }

  const activeMilestone =
    typeof editor === "number"
      ? milestones.find((milestone) => milestone.id === editor) ?? null
      : null;
  const editorOpen = editor === "new" || activeMilestone !== null;
  const showCharts =
    active && visible && data !== null && (data.entryCount > 0 || skillTime.length > 0);

  return (
    <div className="space-y-3 px-4 pb-5">
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Total"
          value={data ? formatMinutes(data.totalMinutes) : "—"}
          hint={data ? `${data.entryCount} entries` : "loading"}
          icon={<ClockIcon className="h-3 w-3" />}
        />
        <StatTile
          label="Streak"
          value={data ? `${streaks.current}d` : "—"}
          hint="current"
          icon={<FlameIcon className="h-3 w-3" />}
        />
        <StatTile
          label="Best"
          value={data ? `${streaks.longest}d` : "—"}
          hint="longest run"
          icon={<TrophyIcon className="h-3 w-3" />}
        />
      </div>

      <StrikerScoreCard score={score} />

      <Card className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
            This week
          </p>
          <p className="text-[10.5px] tabular-nums text-muted">
            {formatMinutes(progress.logged)}
            {progress.goal > 0 ? ` / ${formatMinutes(progress.goal)}` : ""}
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-card2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-muted">
          {progress.goal > 0
            ? `${Math.round(progress.ratio * 100)}% of your weekly target`
            : "No weekly hours target set for this goal"}
        </p>
      </Card>

      {gamificationEnabled ? (
        <GamificationCard
          xp={data?.totalXp ?? 0}
          longestStreak={streaks.longest}
          completedMilestones={completedMilestones}
          totalMinutes={data?.totalMinutes ?? 0}
          challengeEnabled={challengeEnabled}
          challenge={challenge}
          onStartChallenge={() => void handleStartChallenge()}
        />
      ) : null}

      <Card className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FlagIcon className="h-3.5 w-3.5 text-muted" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Milestones
            </h2>
          </div>
          {editor === null ? (
            <Button
              variant="ghost"
              className="h-7 gap-1 px-2 text-[10px]"
              onClick={() => setEditor("new")}
            >
              <PlusIcon className="h-3 w-3" /> Add
            </Button>
          ) : null}
        </div>

        {editorOpen ? (
          <MilestoneEditor
            key={editor === "new" ? "new" : activeMilestone?.id}
            goalId={goal.id}
            milestone={activeMilestone}
            onClose={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              bumpRevision();
            }}
          />
        ) : null}

        {milestones.length === 0 ? (
          <p className="py-2 text-[11px] leading-relaxed text-muted">
            Set a target and link entries to watch progress build up.
          </p>
        ) : (
          <div className="space-y-2">
            {milestones.map((milestone) => {
              const target = milestone.target_minutes ?? 0;
              const ratio =
                target > 0 ? Math.min(1, milestone.minutes / target) : 0;
              const due = targetLabel(milestone.target_date);
              return (
                <button
                  key={milestone.id}
                  type="button"
                  onClick={() => setEditor(milestone.id)}
                  className={cx(
                    "w-full rounded-lg border p-2 text-left transition hover:border-accent/40",
                    milestone.completed_at
                      ? "border-accent/40 bg-accent/5"
                      : "border-line/70 bg-card2/30",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1 truncate text-[11.5px] font-medium">
                      {milestone.completed_at ? (
                        <CheckIcon className="h-3 w-3 shrink-0 text-accent" />
                      ) : null}
                      <span className="truncate">{milestone.title}</span>
                    </p>
                    <span className="shrink-0 text-[9px] text-muted">
                      {milestone.completed_at
                        ? `done ${formatShort(milestone.completed_at)}`
                        : due ?? "no date"}
                    </span>
                  </div>
                  {target > 0 ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-card2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                  ) : null}
                  <p className="mt-1 text-[9.5px] tabular-nums text-muted">
                    {formatMinutes(milestone.minutes)}
                    {target > 0
                      ? ` / ${formatMinutes(target)}`
                      : " · add target hours for a bar"}{" "}
                    · {milestone.entry_count}{" "}
                    {milestone.entry_count === 1 ? "entry" : "entries"} linked
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {active && visible ? (
        <EvidenceGallery
          goalId={goal.id}
          milestones={milestones}
          active={active && visible}
        />
      ) : null}

      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Activity
          </h2>
          <span className="text-[10px] text-muted">90 days</span>
        </div>
        <Heatmap cells={calendar} />
      </Card>

      {failed ? (
        <Card className="flex items-center justify-between gap-2">
          <p className="text-[11.5px] text-muted">Could not load your dashboard.</p>
          <button
            type="button"
            onClick={bumpRevision}
            className="rounded-lg border border-line px-2 py-1 text-[11px] text-ink hover:bg-card2"
          >
            Retry
          </button>
        </Card>
      ) : null}

      {loading && !data ? (
        <>
          <Card className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-[140px] w-full" />
          </Card>
          <Card className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-[130px] w-full" />
          </Card>
        </>
      ) : null}

      {data && data.entryCount === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11.5px] leading-relaxed text-muted">
          Log your first session and your minutes, confidence and streaks will
          show up here.
        </p>
      ) : null}

      {showCharts ? (
        <Suspense
          fallback={
            <Card className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-[140px] w-full" />
            </Card>
          }
        >
          <DashboardCharts
            daily={data.daily}
            skillTime={skillTime}
            skillConfidence={skillConfidence}
            colors={CHART_COLORS[theme]}
            palette={SKILL_PALETTE[theme]}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
