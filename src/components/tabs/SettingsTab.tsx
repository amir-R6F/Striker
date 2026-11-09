import { useEffect, useState } from "react";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { backupDatabaseTo } from "../../lib/backup";
import {
  archiveGoal,
  getActiveGoal,
  getExportBundle,
  getGoals,
} from "../../lib/db";
import {
  currentMonthKey,
  formatShort,
  monthRange,
  quarterRange,
  todayKey,
} from "../../lib/dates";
import { entriesToCsv, toJson, writeExportFile } from "../../lib/export";
import {
  MAX_IDLE_MINUTES,
  MIN_IDLE_MINUTES,
  SETTING_KEYS,
  areRemindersEnabled,
  idleHideMinutes,
  isChallengeEnabled,
  isDoNotDisturb,
  isGamificationEnabled,
  isIdleHideEnabled,
  isReminderCategoryEnabled,
  reminderWakeHour,
} from "../../lib/settings";
import type { Goal } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { DownloadIcon } from "../icons";
import { GoalSetup } from "../GoalSetup";
import { AiSettings } from "../settings/AiSettings";
import { EncryptionSettings } from "../settings/EncryptionSettings";
import { IntegrationsSettings } from "../settings/IntegrationsSettings";
import { SyncSettings } from "../settings/SyncSettings";
import {
  Button,
  Card,
  SectionTitle,
  Segmented,
  Select,
  TextInput,
  Toggle,
} from "../ui";

type ExportKind =
  | "json"
  | "csv"
  | "report-md"
  | "report-pdf"
  | "full-md"
  | "full-pdf";

export function SettingsTab() {
  const goal = useAppStore((state) => state.goal);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const settings = useAppStore((state) => state.settings);
  const setSetting = useAppStore((state) => state.setSetting);
  const setGoal = useAppStore((state) => state.setGoal);
  const revision = useAppStore((state) => state.revision);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);

  const idleEnabled = isIdleHideEnabled(settings);
  const idleMinutes = idleHideMinutes(settings);
  const gamificationEnabled = isGamificationEnabled(settings);
  const challengeEnabled = isChallengeEnabled(settings);
  const remindersEnabled = areRemindersEnabled(settings);
  const doNotDisturb = isDoNotDisturb(settings);

  const [autoStart, setAutoStart] = useState(false);
  const [autoStartBusy, setAutoStartBusy] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState(String(idleMinutes));
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [reportKind, setReportKind] = useState<"month" | "quarter">("month");
  const [reportMonth, setReportMonth] = useState(currentMonthKey());
  const [goals, setGoals] = useState<Goal[]>([]);
  const [wakeHourDraft, setWakeHourDraft] = useState(
    String(reminderWakeHour(settings)),
  );
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [backupFolder, setBackupFolder] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  useEffect(() => {
    setWakeHourDraft(String(reminderWakeHour(settings)));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    getGoals()
      .then((rows) => {
        if (!cancelled) setGoals(rows);
      })
      .catch((error: unknown) => {
        console.warn("Could not load goals", error);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  useEffect(() => {
    setMinutesDraft(String(idleMinutes));
  }, [idleMinutes]);

  useEffect(() => {
    let cancelled = false;
    isAutostartEnabled()
      .then((enabled) => {
        if (!cancelled) setAutoStart(enabled);
      })
      .catch((error: unknown) => {
        console.warn("Auto-start is unavailable", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAutoStart(next: boolean) {
    if (autoStartBusy) return;
    setAutoStartBusy(true);
    try {
      if (next) await enableAutostart();
      else await disableAutostart();
      setAutoStart(next);
      await setSetting(SETTING_KEYS.autoStart, String(next));
      notify(next ? "Auto-start enabled" : "Auto-start disabled");
    } catch (error) {
      console.error("Could not change auto-start", error);
      notify("Could not change auto-start", "error");
    } finally {
      setAutoStartBusy(false);
    }
  }

  async function handleIdleToggle(next: boolean) {
    await setSetting(SETTING_KEYS.idleHideEnabled, String(next));
    notify(
      next ? `Widget hides after ${idleMinutes} min idle` : "Idle auto-hide off",
    );
  }

  async function handleGamificationToggle(next: boolean) {
    await setSetting(SETTING_KEYS.gamification, String(next));
    notify(next ? "Gamification on" : "Gamification off");
  }

  async function handleChallengeToggle(next: boolean) {
    await setSetting(SETTING_KEYS.challenge, String(next));
    if (next) {
      await setSetting(SETTING_KEYS.challengeStart, todayKey());
      notify("7-day challenge started");
    } else {
      notify("Challenge mode off");
    }
  }

  async function handleRemindersToggle(next: boolean) {
    await setSetting(SETTING_KEYS.reminders, String(next));
    notify(next ? "Smart reminders on" : "Smart reminders off");
  }

  async function handleDoNotDisturbToggle(next: boolean) {
    await setSetting(SETTING_KEYS.doNotDisturb, String(next));
    notify(next ? "Do not disturb on" : "Do not disturb off");
  }

  function commitWakeHour() {
    const parsed = Number(wakeHourDraft);
    const clamped = Number.isFinite(parsed)
      ? Math.min(23, Math.max(0, Math.round(parsed)))
      : reminderWakeHour(settings);
    setWakeHourDraft(String(clamped));
    void setSetting(SETTING_KEYS.reminderWakeHour, String(clamped));
  }

  async function toggleReminderCategory(
    key: string,
    label: string,
    next: boolean,
  ) {
    await setSetting(key, String(next));
    notify(`${label} reminder ${next ? "on" : "off"}`);
  }

  async function handleArchiveGoal() {
    if (!goal || archiving) return;
    if (
      !window.confirm(
        `Archive "${goal.title}"? Its entries, milestones and roadmaps stay in the database.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      await archiveGoal(goal.id);
      const next = await getActiveGoal();
      await setSetting(SETTING_KEYS.activeGoal, next ? String(next.id) : "");
      setGoal(next);
      bumpRevision();
      notify("Goal archived");
    } catch (error) {
      console.error("Could not archive goal", error);
      notify("Could not archive goal", "error");
    } finally {
      setArchiving(false);
    }
  }

  async function handleBackupNow() {
    if (backupBusy) return;
    if (!/^([A-Za-z]:[\\/]|\\\\)/.test(backupFolder.trim())) {
      notify("Enter an absolute Windows folder path", "error");
      return;
    }
    setBackupBusy(true);
    try {
      const path = await backupDatabaseTo(backupFolder);
      setLastBackup(path);
      notify("Database backed up");
    } catch (error) {
      console.error("Could not back up the database", error);
      notify("Could not back up the database", "error");
    } finally {
      setBackupBusy(false);
    }
  }

  function commitIdleMinutes() {
    const parsed = Number(minutesDraft);
    const clamped = Number.isFinite(parsed)
      ? Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(parsed)))
      : idleMinutes;
    setMinutesDraft(String(clamped));
    void setSetting(SETTING_KEYS.idleHideMinutes, String(clamped));
  }

  async function handleExport(kind: ExportKind) {
    if (exporting) return;
    if ((kind === "report-md" || kind === "report-pdf") && !goal) {
      notify("Create a goal before generating a report", "error");
      return;
    }
    setExporting(kind);
    try {
      const bundle = await getExportBundle();
      const stamp = todayKey();

      if (kind === "json" || kind === "csv") {
        const fileName =
          kind === "json"
            ? `striker-backup-${stamp}.json`
            : `striker-entries-${stamp}.csv`;
        const contents = kind === "json" ? toJson(bundle) : entriesToCsv(bundle);
        const path = await writeExportFile(fileName, contents);
        setLastExport(path);
        notify(`Exported ${fileName}`);
        return;
      }

      if (kind === "full-md" || kind === "full-pdf") {
        const { createFullReport, writeMarkdownReport, writePdfReport } = await import(
          "../../lib/report"
        );
        const model = createFullReport(bundle);
        const base = `striker-full-export-${stamp}`;
        const fileName = kind === "full-md" ? `${base}.md` : `${base}.pdf`;
        const path =
          kind === "full-md"
            ? await writeMarkdownReport(model, fileName)
            : await writePdfReport(model, fileName);
        setLastExport(path);
        notify(`Exported ${fileName}`);
        return;
      }

      if (!goal) return;
      const { createPeriodReport, writeMarkdownReport, writePdfReport } = await import(
        "../../lib/report"
      );
      const reportStamp = reportMonth || currentMonthKey();
      const range =
        reportKind === "month"
          ? monthRange(reportStamp)
          : quarterRange(reportStamp);
      const model = createPeriodReport(bundle, {
        goalId: goal.id,
        from: range.from,
        to: range.to,
        label: range.label,
        kind: reportKind,
      });
      const base = `striker-${reportKind === "month" ? "monthly" : "quarterly"}-${reportStamp}`;
      const fileName = kind === "report-md" ? `${base}.md` : `${base}.pdf`;
      const path =
        kind === "report-md"
          ? await writeMarkdownReport(model, fileName)
          : await writePdfReport(model, fileName);
      setLastExport(path);
      notify(`Exported ${fileName}`);
    } catch (error) {
      console.error("Export failed", error);
      notify("Export failed", "error");
    } finally {
      setExporting(null);
    }
  }

  const reportRange =
    reportKind === "month"
      ? monthRange(reportMonth || currentMonthKey())
      : quarterRange(reportMonth || currentMonthKey());

  return (
    <div className="space-y-4 px-4 pb-5">
      <section>
        <SectionTitle>Appearance</SectionTitle>
        <Card className="space-y-2">
          <p className="text-[12.5px] font-medium">Theme</p>
          <Segmented
            value={theme}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
            onChange={setTheme}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>Behavior</SectionTitle>
        <Card className="divide-y divide-line">
          <div className="flex items-start justify-between gap-3 pb-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium">Start with Windows</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                Launch hidden in the tray when you sign in.
              </p>
            </div>
            <Toggle
              checked={autoStart}
              disabled={autoStartBusy}
              onChange={(value) => void handleAutoStart(value)}
              label="Start with Windows"
            />
          </div>

          <div className="pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">Hide when idle</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                  Tuck the widget away after{" "}
                  {idleEnabled ? `${idleMinutes} minutes` : "a while"} without
                  activity. No timers run while it is hidden.
                </p>
              </div>
              <Toggle
                checked={idleEnabled}
                onChange={(value) => void handleIdleToggle(value)}
                label="Hide when idle"
              />
            </div>

            {idleEnabled ? (
              <label className="mt-2.5 flex items-center gap-2 text-[11px] text-muted">
                Hide after
                <span className="w-16">
                  <TextInput
                    type="number"
                    min={MIN_IDLE_MINUTES}
                    max={MAX_IDLE_MINUTES}
                    step={1}
                    value={minutesDraft}
                    onChange={(event) => setMinutesDraft(event.target.value)}
                    onBlur={commitIdleMinutes}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitIdleMinutes();
                        event.currentTarget.blur();
                      }
                    }}
                    className="py-1 text-center"
                    aria-label="Idle minutes before hiding"
                  />
                </span>
                minutes
              </label>
            ) : null}
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Reminders</SectionTitle>
        <Card className="divide-y divide-line">
          <div className="space-y-2 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">Smart reminders</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                  One background check a day from Rust, sent as a Windows toast.
                  A second weekly nudge goes out on Sunday. The widget never
                  wakes for it.
                </p>
              </div>
              <Toggle
                checked={remindersEnabled}
                onChange={(value) => void handleRemindersToggle(value)}
                label="Smart reminders"
              />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted">
              Check around
              <span className="w-14">
                <TextInput
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  value={wakeHourDraft}
                  onChange={(event) => setWakeHourDraft(event.target.value)}
                  onBlur={commitWakeHour}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitWakeHour();
                      event.currentTarget.blur();
                    }
                  }}
                  className="py-1 text-center"
                  aria-label="Daily reminder hour"
                  disabled={!remindersEnabled}
                />
              </span>
              :00 local time
            </label>
          </div>

          <div className="space-y-2 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11.5px]">Quiet-day nudge</p>
              <Toggle
                checked={isReminderCategoryEnabled(settings, "inactivity")}
                disabled={!remindersEnabled}
                onChange={(value) =>
                  void toggleReminderCategory(
                    SETTING_KEYS.reminderInactivity,
                    "Quiet-day",
                    value,
                  )
                }
                label="Quiet-day nudge"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11.5px]">Input-only streak nudge</p>
              <Toggle
                checked={isReminderCategoryEnabled(settings, "passive")}
                disabled={!remindersEnabled}
                onChange={(value) =>
                  void toggleReminderCategory(
                    SETTING_KEYS.reminderPassive,
                    "Input-only",
                    value,
                  )
                }
                label="Input-only streak nudge"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11.5px]">Sunday weekly review</p>
              <Toggle
                checked={isReminderCategoryEnabled(settings, "weekly")}
                disabled={!remindersEnabled}
                onChange={(value) =>
                  void toggleReminderCategory(
                    SETTING_KEYS.reminderWeekly,
                    "Weekly review",
                    value,
                  )
                }
                label="Sunday weekly review"
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 pt-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium">Do not disturb</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                Silence every reminder without turning them off.
              </p>
            </div>
            <Toggle
              checked={doNotDisturb}
              disabled={!remindersEnabled}
              onChange={(value) => void handleDoNotDisturbToggle(value)}
              label="Do not disturb"
            />
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Gamification</SectionTitle>
        <Card className="divide-y divide-line">
          <div className="flex items-start justify-between gap-3 pb-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium">XP and badges</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                Earn XP for logged entries and unlock streak, milestone and time
                badges on the dashboard.
              </p>
            </div>
            <Toggle
              checked={gamificationEnabled}
              onChange={(value) => void handleGamificationToggle(value)}
              label="XP and badges"
            />
          </div>

          <div className="pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">7-day challenge</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                  Log something for seven days in a row. Reset the challenge from
                  the dashboard.
                </p>
              </div>
              <Toggle
                checked={challengeEnabled}
                disabled={!gamificationEnabled}
                onChange={(value) => void handleChallengeToggle(value)}
                label="7-day challenge"
              />
            </div>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Goal</SectionTitle>
        <Card className="space-y-2">
          {goal ? (
            <>
              <p className="text-[13px] font-medium leading-snug">{goal.title}</p>
              <p className="text-[10.5px] text-muted">
                Started {formatShort(goal.start_date)}
                {goal.weekly_hours_goal > 0
                  ? ` · ${goal.weekly_hours_goal}h / week target`
                  : " · no weekly target"}
              </p>
              {goal.description ? (
                <p className="text-[11.5px] leading-relaxed text-muted">
                  {goal.description}
                </p>
              ) : null}
              {goal.success_criteria ? (
                <p className="rounded-lg bg-card2/60 px-2.5 py-2 text-[11px] leading-relaxed text-ink/80">
                  <span className="font-medium text-ink">Success: </span>
                  {goal.success_criteria}
                </p>
              ) : null}
              <p className="text-[10px] leading-relaxed text-muted">
                Switch goals from the header. Archived goals keep their data but
                disappear from the switcher.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant="subtle"
                  className="h-8 px-2.5 text-[10.5px]"
                  onClick={() => setShowGoalForm((open) => !open)}
                >
                  {showGoalForm ? "Close" : "Add goal"}
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 px-2.5 text-[10.5px]"
                  onClick={() => void handleArchiveGoal()}
                  disabled={archiving}
                >
                  {archiving ? "Archiving…" : "Archive this goal"}
                </Button>
              </div>
              {showGoalForm ? (
                <div className="pt-2">
                  <GoalSetup />
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-[11.5px] text-muted">
              No active goal — add one above.
            </p>
          )}

          <div className="border-t border-line pt-2.5">
            <label
              htmlFor="default-goal"
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted"
            >
              Default goal at launch
            </label>
            <Select
              id="default-goal"
              value={settings[SETTING_KEYS.defaultGoal] ?? ""}
              onChange={(event) =>
                void setSetting(SETTING_KEYS.defaultGoal, event.target.value)
              }
              className="mt-1.5"
            >
              <option value="">Most recent goal</option>
              {goals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </Select>
          </div>
        </Card>
      </section>

      <IntegrationsSettings />
      <AiSettings />
      <SyncSettings />
      <EncryptionSettings />

      <section>
        <SectionTitle>Reports</SectionTitle>
        <Card className="space-y-2.5">
          <Segmented
            value={reportKind}
            options={[
              { value: "month", label: "Monthly" },
              { value: "quarter", label: "Quarterly" },
            ]}
            onChange={setReportKind}
          />
          <label className="block space-y-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
            Report month
            <TextInput
              type="month"
              value={reportMonth}
              onChange={(event) => setReportMonth(event.target.value)}
              aria-label="Report month"
            />
          </label>
          <p className="text-[10px] text-muted">
            {reportRange.label} · {formatShort(reportRange.from)} –{" "}
            {formatShort(reportRange.to)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="subtle"
              className="h-9 px-2 text-[11px]"
              onClick={() => void handleExport("report-md")}
              disabled={exporting !== null || !goal}
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {exporting === "report-md" ? "Writing…" : "Markdown"}
            </Button>
            <Button
              variant="subtle"
              className="h-9 px-2 text-[11px]"
              onClick={() => void handleExport("report-pdf")}
              disabled={exporting !== null || !goal}
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {exporting === "report-pdf" ? "Rendering…" : "PDF"}
            </Button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            A templated summary with time, skills, completed milestones, top
            learnings and the evidence gallery. Generated only when you ask.
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Data</SectionTitle>
        <Card className="space-y-2">
          <Button
            variant="subtle"
            className="h-9 w-full justify-start px-3"
            onClick={() => void handleExport("json")}
            disabled={exporting !== null}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {exporting === "json" ? "Exporting…" : "Export JSON backup"}
          </Button>
          <Button
            variant="subtle"
            className="h-9 w-full justify-start px-3"
            onClick={() => void handleExport("csv")}
            disabled={exporting !== null}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {exporting === "csv" ? "Exporting…" : "Export entries CSV"}
          </Button>
          <Button
            variant="subtle"
            className="h-9 w-full justify-start px-3"
            onClick={() => void handleExport("full-md")}
            disabled={exporting !== null}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {exporting === "full-md" ? "Exporting…" : "Export full Markdown"}
          </Button>
          <Button
            variant="subtle"
            className="h-9 w-full justify-start px-3"
            onClick={() => void handleExport("full-pdf")}
            disabled={exporting !== null}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {exporting === "full-pdf" ? "Rendering…" : "Export full PDF"}
          </Button>
          <p className="text-[10px] leading-relaxed text-muted">
            Files are written to your Downloads folder. JSON includes goals,
            entries, skills, milestones, evidence, weekly reviews and settings.
          </p>
          {lastExport ? (
            <p className="break-all rounded-lg bg-card2/60 px-2 py-1.5 text-[9.5px] leading-relaxed text-muted">
              Saved to {lastExport}
            </p>
          ) : null}

          <div className="space-y-1.5 border-t border-line pt-2.5">
            <label
              htmlFor="backup-folder"
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted"
            >
              Database backup
            </label>
            <TextInput
              id="backup-folder"
              value={backupFolder}
              onChange={(event) => setBackupFolder(event.target.value)}
              placeholder="D:\\Backups\\Striker"
              aria-label="Database backup folder"
            />
            <Button
              variant="subtle"
              className="h-9 w-full justify-start px-3"
              onClick={() => void handleBackupNow()}
              disabled={backupBusy}
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {backupBusy ? "Copying…" : "Backup database now"}
            </Button>
            <p className="text-[10px] leading-relaxed text-muted">
              Copies striker.db into the folder using SQLite&apos;s backup API.
              Before any migration, Striker also keeps the last five automatic
              snapshots next to the database.
            </p>
            {lastBackup ? (
              <p className="break-all rounded-lg bg-card2/60 px-2 py-1.5 text-[9.5px] leading-relaxed text-muted">
                Saved to {lastBackup}
              </p>
            ) : null}
          </div>

          {__STRIKER_BROWSER__ ? (
            <div className="space-y-1.5 border-t border-line pt-2.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                Browser preview
              </p>
              <p className="text-[10px] leading-relaxed text-muted">
                This web build keeps its database in localStorage. Resetting
                clears entries, goals and settings in this browser only.
              </p>
              <Button
                variant="subtle"
                className="h-9 w-full justify-start px-3"
                onClick={() => {
                  window.localStorage.removeItem("striker-browser-db");
                  window.location.reload();
                }}
              >
                Reset browser DB
              </Button>
            </div>
          ) : null}
        </Card>
      </section>

      <section>
        <SectionTitle>About</SectionTitle>
        <Card className="space-y-1.5 text-[10.5px] leading-relaxed text-muted">
          <p className="text-[12px] font-medium text-ink">Striker 0.1.0</p>
          <p>
            Local-first: data lives in a SQLite file on this PC. There is no
            account; network access happens only when you press Summarize week
            or run a sync backup/restore.
          </p>
          <div className="space-y-0.5 pt-1">
            <p>
              <span className="text-ink">Ctrl + Shift + S</span> — show and
              focus quick log
            </p>
            <p>
              <span className="text-ink">Tray left click</span> — show / hide
              widget
            </p>
            <p>
              <span className="text-ink">Ctrl + Enter</span> — save an entry
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
