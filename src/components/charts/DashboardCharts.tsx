import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  addDays,
  formatShort,
  lastIsoWeekStarts,
  startOfIsoWeek,
  todayKey,
} from "../../lib/dates";
import type { ChartColors } from "../../lib/theme";
import type {
  DailyRow,
  SkillConfidenceRow,
  SkillTimeRow,
} from "../../lib/types";

const WINDOW_DAYS = 30;
const CONFIDENCE_WEEKS = 8;

interface Props {
  daily: DailyRow[];
  skillTime: SkillTimeRow[];
  skillConfidence: SkillConfidenceRow[];
  colors: ChartColors;
  palette: string[];
}

const tooltipStyleFor = (colors: ChartColors) => ({
  background: colors.tooltipBg,
  border: `1px solid ${colors.tooltipBorder}`,
  borderRadius: 10,
  fontSize: 11,
  color: colors.text,
  padding: "6px 9px",
});

export default function DashboardCharts({
  daily,
  skillTime,
  skillConfidence,
  colors,
  palette,
}: Props) {
  const byDate = new Map(daily.map((row) => [row.date, row]));
  const days = Array.from({ length: WINDOW_DAYS }, (_, index) =>
    addDays(todayKey(), index - (WINDOW_DAYS - 1)),
  );

  const minuteData = days.map((date) => ({
    label: formatShort(date),
    minutes: Math.round(byDate.get(date)?.minutes ?? 0),
  }));

  const confidenceData = days.map((date) => {
    const value = byDate.get(date)?.confidence;
    return {
      label: formatShort(date),
      confidence: value == null ? null : Number(value.toFixed(2)),
    };
  });

  const hasConfidence = confidenceData.some((point) => point.confidence != null);
  const tooltipStyle = tooltipStyleFor(colors);

  /* ---------------- stacked time by skill ---------------- */

  const totalsBySkill = new Map<string, number>();
  for (const row of skillTime) {
    totalsBySkill.set(
      row.skill,
      (totalsBySkill.get(row.skill) ?? 0) + row.minutes,
    );
  }
  const rankedSkills = [...totalsBySkill.entries()]
    .filter(([, minutes]) => minutes > 0)
    .sort((a, b) => b[1] - a[1]);
  const topSkills = rankedSkills.slice(0, 6).map(([name]) => name);
  let otherLabel = "Other";
  while (topSkills.includes(otherLabel)) otherLabel = `${otherLabel} +`;
  const stackedNames =
    rankedSkills.length > topSkills.length
      ? [...topSkills, otherLabel]
      : topSkills;

  const rowsByDate = new Map<string, SkillTimeRow[]>();
  for (const row of skillTime) {
    const list = rowsByDate.get(row.date) ?? [];
    list.push(row);
    rowsByDate.set(row.date, list);
  }

  const stackedData = days.map((date) => {
    const record: Record<string, string | number> = { label: formatShort(date) };
    for (const name of stackedNames) record[name] = 0;
    for (const row of rowsByDate.get(date) ?? []) {
      const name = topSkills.includes(row.skill) ? row.skill : otherLabel;
      if (!(name in record)) continue;
      record[name] = Number(record[name]) + row.minutes;
    }
    return record;
  });

  /* ---------------- confidence per skill (weekly) ---------------- */

  const weekStarts = lastIsoWeekStarts(CONFIDENCE_WEEKS);
  const confidenceCounts = new Map<string, number>();
  const weeklyBySkill = new Map<string, Map<string, { sum: number; count: number }>>();

  for (const row of skillConfidence) {
    const week = startOfIsoWeek(row.date);
    if (!weekStarts.includes(week)) continue;
    confidenceCounts.set(row.skill, (confidenceCounts.get(row.skill) ?? 0) + 1);
    const weeks = weeklyBySkill.get(row.skill) ?? new Map();
    const bucket = weeks.get(week) ?? { sum: 0, count: 0 };
    bucket.sum += row.confidence;
    bucket.count += 1;
    weeks.set(week, bucket);
    weeklyBySkill.set(row.skill, weeks);
  }

  const confidenceSkills = [...confidenceCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([name]) => name);

  const confidenceWeekly = weekStarts.map((week) => {
    const record: Record<string, string | number | null> = {
      label: formatShort(week),
    };
    for (const name of confidenceSkills) {
      const bucket = weeklyBySkill.get(name)?.get(week);
      record[name] =
        bucket && bucket.count > 0
          ? Number((bucket.sum / bucket.count).toFixed(2))
          : null;
    }
    return record;
  });

  const allSkills = [
    ...new Set([
      ...skillTime.map((row) => row.skill),
      ...skillConfidence.map((row) => row.skill),
    ]),
  ].sort();

  const colorFor = (name: string): string => {
    if (name === otherLabel) return colors.axis;
    const index = allSkills.indexOf(name);
    return palette[(index < 0 ? 0 : index) % palette.length];
  };

  function Legend({ names }: { names: string[] }) {
    return (
      <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
        {names.map((name) => (
          <span
            key={name}
            className="flex items-center gap-1 text-[9px] text-muted"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: colorFor(name) }}
            />
            {name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <>
      <section className="rounded-xl border border-line bg-card p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Daily minutes
          </h2>
          <span className="text-[10px] text-muted">last {WINDOW_DAYS} days</span>
        </div>
        <div
          role="img"
          aria-label={`Daily learning minutes over the last ${WINDOW_DAYS} days`}
          className="h-[146px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={minuteData} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
              <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 4" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={26}
                interval="preserveStartEnd"
                tick={{ fill: colors.axis, fontSize: 9.5 }}
                tickMargin={6}
              />
              <YAxis
                allowDecimals={false}
                width={34}
                tickLine={false}
                axisLine={false}
                tick={{ fill: colors.axis, fontSize: 9.5 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: colors.axis }}
                itemStyle={{ color: colors.text }}
                cursor={{ stroke: colors.grid }}
              />
              <Line
                type="monotone"
                dataKey="minutes"
                name="Minutes"
                unit=" min"
                stroke={colors.accent}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: colors.accent }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Time by skill node
          </h2>
          <span className="text-[10px] text-muted">last {WINDOW_DAYS} days</span>
        </div>

        {topSkills.length === 0 ? (
          <p className="py-10 text-center text-[11.5px] leading-relaxed text-muted">
            Tag entries with skill nodes to see where your time goes.
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label="Stacked daily minutes by skill node"
              className="h-[168px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stackedData}
                  margin={{ top: 8, right: 4, bottom: 0, left: -22 }}
                >
                  <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 4" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={26}
                    interval="preserveStartEnd"
                    tick={{ fill: colors.axis, fontSize: 9.5 }}
                    tickMargin={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={34}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: colors.axis, fontSize: 9.5 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: colors.axis }}
                    itemStyle={{ color: colors.text }}
                    cursor={{ fill: colors.grid, fillOpacity: 0.25 }}
                  />
                  {stackedNames.map((name, index) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="skills"
                      fill={colorFor(name)}
                      isAnimationActive={false}
                      radius={
                        index === stackedNames.length - 1
                          ? [2, 2, 0, 0]
                          : undefined
                      }
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Legend names={stackedNames} />
          </>
        )}
      </section>

      <section className="rounded-xl border border-line bg-card p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Confidence
          </h2>
          <span className="text-[10px] text-muted">1–5 scale</span>
        </div>
        {hasConfidence ? (
          <div
            role="img"
            aria-label="Average confidence per day over the last 30 days"
            className="h-[136px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={confidenceData}
                margin={{ top: 8, right: 4, bottom: 0, left: -30 }}
              >
                <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 4" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={26}
                  interval="preserveStartEnd"
                  tick={{ fill: colors.axis, fontSize: 9.5 }}
                  tickMargin={6}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  width={30}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: colors.axis, fontSize: 9.5 }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: colors.axis }}
                  itemStyle={{ color: colors.text }}
                  cursor={{ stroke: colors.grid }}
                />
                <Line
                  type="monotone"
                  dataKey="confidence"
                  name="Confidence"
                  stroke={colors.accent}
                  strokeWidth={2}
                  dot={{ r: 2, fill: colors.accent, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-[11.5px] text-muted">
            Add a confidence rating to see this trend.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-card p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Confidence by skill node
          </h2>
          <span className="text-[10px] text-muted">weekly</span>
        </div>
        {confidenceSkills.length === 0 ? (
          <p className="py-10 text-center text-[11.5px] leading-relaxed text-muted">
            Rate confidence on tagged entries to compare skills over time.
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label="Weekly average confidence per skill node"
              className="h-[150px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={confidenceWeekly}
                  margin={{ top: 8, right: 4, bottom: 0, left: -30 }}
                >
                  <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 4" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={20}
                    interval="preserveStartEnd"
                    tick={{ fill: colors.axis, fontSize: 9.5 }}
                    tickMargin={6}
                  />
                  <YAxis
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    width={30}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: colors.axis, fontSize: 9.5 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: colors.axis }}
                    itemStyle={{ color: colors.text }}
                    cursor={{ stroke: colors.grid }}
                  />
                  {confidenceSkills.map((name) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      name={name}
                      stroke={colorFor(name)}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Legend names={confidenceSkills} />
          </>
        )}
      </section>
    </>
  );
}
