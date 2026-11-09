import { useEffect, useState } from "react";
import {
  MAX_POMODORO_MINUTES,
  MIN_POMODORO_MINUTES,
  SETTING_KEYS,
  pomodoroBreakMinutes,
  pomodoroFocusMinutes,
} from "../../lib/settings";
import { useAppStore } from "../../store/useAppStore";
import { Card, SectionTitle, TextInput } from "../ui";

function clampMinutes(raw: string, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(
    MAX_POMODORO_MINUTES,
    Math.max(MIN_POMODORO_MINUTES, Math.round(parsed)),
  );
}

export function IntegrationsSettings() {
  const settings = useAppStore((state) => state.settings);
  const setSetting = useAppStore((state) => state.setSetting);
  const notify = useAppStore((state) => state.notify);

  const focus = pomodoroFocusMinutes(settings);
  const breakMinutes = pomodoroBreakMinutes(settings);
  const [focusDraft, setFocusDraft] = useState(String(focus));
  const [breakDraft, setBreakDraft] = useState(String(breakMinutes));

  useEffect(() => {
    setFocusDraft(String(focus));
    setBreakDraft(String(breakMinutes));
  }, [focus, breakMinutes]);

  function commit(
    key: string,
    raw: string,
    fallback: number,
    setDraft: (value: string) => void,
  ) {
    const value = clampMinutes(raw, fallback);
    setDraft(String(value));
    void setSetting(key, String(value));
    notify(`Timer set to ${value} minutes`);
  }

  return (
    <section>
      <SectionTitle>Integrations</SectionTitle>
      <Card className="space-y-3 text-[10.5px] leading-relaxed text-muted">
        <div>
          <p className="text-[12.5px] font-medium text-ink">Focus timer</p>
          <p className="mt-0.5">
            The Pomodoro in the Log tab adds completed focus minutes to your
            latest entry today. It pauses whenever the widget is hidden.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
              Focus minutes
              <TextInput
                type="number"
                min={MIN_POMODORO_MINUTES}
                max={MAX_POMODORO_MINUTES}
                step={1}
                value={focusDraft}
                onChange={(event) => setFocusDraft(event.target.value)}
                onBlur={() =>
                  commit(
                    SETTING_KEYS.pomodoroFocus,
                    focusDraft,
                    focus,
                    setFocusDraft,
                  )
                }
                aria-label="Pomodoro focus minutes"
                className="py-1.5"
              />
            </label>
            <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
              Break minutes
              <TextInput
                type="number"
                min={MIN_POMODORO_MINUTES}
                max={MAX_POMODORO_MINUTES}
                step={1}
                value={breakDraft}
                onChange={(event) => setBreakDraft(event.target.value)}
                onBlur={() =>
                  commit(
                    SETTING_KEYS.pomodoroBreak,
                    breakDraft,
                    breakMinutes,
                    setBreakDraft,
                  )
                }
                aria-label="Pomodoro break minutes"
                className="py-1.5"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-line pt-2.5">
          <p className="text-[12.5px] font-medium text-ink">Evidence links</p>
          <p className="mt-0.5">
            In Log → Add details → Integrations, attach a GitHub commit, issue or
            pull request URL, an ArtStation URL, or a local Blender{" "}
            <code>.blend</code> path. They are stored as evidence and opened from
            the dashboard gallery.
          </p>
        </div>

        <div className="border-t border-line pt-2.5">
          <p className="text-[12.5px] font-medium text-ink">Calendar</p>
          <p className="mt-0.5">
            Review → Weekly review → <span className="text-ink">Export plan to calendar</span>{" "}
            writes an all-day <code>.ics</code> event for next week into
            Downloads. Import it into any calendar app.
          </p>
        </div>
      </Card>
    </section>
  );
}
