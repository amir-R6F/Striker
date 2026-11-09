import type { StrikerScore } from "../lib/score";
import { InfoIcon } from "./icons";
import { Card, cx } from "./ui";

export function StrikerScoreCard({ score }: { score: StrikerScore }) {
  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Striker Score
          </h2>
          <span
            title={score.explanation}
            aria-label={score.explanation}
            className="text-muted/80"
          >
            <InfoIcon className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] font-semibold leading-none tabular-nums">
            {score.total}
          </span>
          <span className="text-[10px] text-muted">/ 100</span>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-muted">{score.explanation}</p>

      <div className="space-y-1.5">
        {score.parts.map((part) => (
          <div key={part.key} title={part.detail}>
            <div className="flex items-baseline justify-between gap-2 text-[10px]">
              <span className="font-medium text-ink/90">
                {part.label}{" "}
                <span className="font-normal text-muted">{part.weight}%</span>
              </span>
              <span className="tabular-nums text-muted">
                {part.value}% · {Math.round(part.points)} pts
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-card2">
              <div
                className={cx(
                  "h-full rounded-full",
                  part.value >= 67
                    ? "bg-accent"
                    : part.value >= 34
                      ? "bg-accent/70"
                      : "bg-accent/40",
                )}
                style={{ width: `${Math.max(2, part.value)}%` }}
              />
            </div>
            <p className="mt-0.5 text-[9px] leading-snug text-muted">{part.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
