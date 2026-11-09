import {
  XP_FORMULA,
  badgesFor,
  type Badge,
  type ChallengeProgress,
} from "../lib/gamification";
import { formatMinutes, formatShort } from "../lib/dates";
import { CheckIcon, InfoIcon, SparkIcon, TrophyIcon } from "./icons";
import { Card, cx } from "./ui";

interface Props {
  xp: number;
  longestStreak: number;
  completedMilestones: number;
  totalMinutes: number;
  challengeEnabled: boolean;
  challenge: ChallengeProgress | null;
  onStartChallenge: () => void;
}

function badgeProgress(badge: Badge): string {
  if (badge.earned) return "Earned";
  if (badge.group === "Time") {
    return `${formatMinutes(badge.current)} / ${formatMinutes(badge.target)}`;
  }
  return `${Math.min(badge.current, badge.target)} / ${badge.target}`;
}

function ChallengePanel({
  challenge,
  onStartChallenge,
}: {
  challenge: ChallengeProgress | null;
  onStartChallenge: () => void;
}) {
  if (!challenge) {
    return (
      <div className="rounded-lg border border-dashed border-line p-2.5">
        <p className="text-[11px] font-medium">7-day challenge</p>
        <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted">
          Log at least one entry each day for seven days.
        </p>
        <button
          type="button"
          onClick={onStartChallenge}
          className="mt-2 rounded-lg border border-accent/50 bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent transition hover:bg-accent/15"
        >
          Start challenge
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-card2/40 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium">7-day challenge</p>
        <span className="text-[9.5px] tabular-nums text-muted">
          {challenge.completedDays} / 7
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1">
        {challenge.days.map((day, index) => (
          <span
            key={day.date}
            title={`${formatShort(day.date)}${day.done ? " · logged" : ""}`}
            className={cx(
              "grid h-5 w-5 place-items-center rounded-full border text-[9px] font-medium tabular-nums",
              day.done
                ? "border-accent bg-accent text-on-accent"
                : day.isToday
                  ? "border-accent/70 text-accent"
                  : day.isFuture
                    ? "border-line/60 text-muted/50"
                    : "border-line text-muted",
            )}
          >
            {day.done ? <CheckIcon className="h-3 w-3" /> : index + 1}
          </span>
        ))}
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-card2">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${Math.round(challenge.ratio * 100)}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-[9px] leading-relaxed text-muted">
          {challenge.complete
            ? "Challenge complete — seven days in a row."
            : challenge.ended
              ? "This challenge window has ended."
              : challenge.started
                ? `Keep it going through ${formatShort(challenge.end)}.`
                : `Starts ${formatShort(challenge.start)}.`}
        </p>
        <button
          type="button"
          onClick={onStartChallenge}
          className="shrink-0 text-[9px] font-medium text-accent hover:underline"
        >
          {challenge.complete || challenge.ended ? "Restart" : "Reset"}
        </button>
      </div>
    </div>
  );
}

export function GamificationCard({
  xp,
  longestStreak,
  completedMilestones,
  totalMinutes,
  challengeEnabled,
  challenge,
  onStartChallenge,
}: Props) {
  const badges = badgesFor({
    longestStreak,
    completedMilestones,
    totalMinutes,
  });
  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SparkIcon className="h-3.5 w-3.5 text-muted" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Momentum
          </h2>
        </div>
        <div className="flex items-center gap-1" title={XP_FORMULA}>
          <span className="text-[17px] font-semibold leading-none tabular-nums">
            {xp}
          </span>
          <span className="text-[9.5px] text-muted">XP</span>
          <InfoIcon className="h-3 w-3 text-muted/70" />
        </div>
      </div>

      <div className="flex items-center justify-between text-[9.5px] text-muted">
        <span>
          {earned} of {badges.length} badges
        </span>
        <span className="truncate pl-2" title={XP_FORMULA}>
          {XP_FORMULA}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {badges.map((badge) => (
          <div
            key={badge.id}
            title={badge.description}
            className={cx(
              "rounded-lg border p-1.5",
              badge.earned
                ? "border-accent/40 bg-accent/10"
                : "border-line/70 bg-card2/30 opacity-70",
            )}
          >
            <div className="flex items-center gap-1">
              <TrophyIcon
                className={cx(
                  "h-3 w-3 shrink-0",
                  badge.earned ? "text-accent" : "text-muted",
                )}
              />
              <p className="truncate text-[9.5px] font-medium">{badge.title}</p>
            </div>
            <p className="mt-0.5 truncate text-[8.5px] tabular-nums text-muted">
              {badgeProgress(badge)}
            </p>
          </div>
        ))}
      </div>

      {challengeEnabled ? (
        <ChallengePanel challenge={challenge} onStartChallenge={onStartChallenge} />
      ) : null}
    </Card>
  );
}
