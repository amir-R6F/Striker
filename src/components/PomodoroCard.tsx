import { useCallback, useEffect, useRef, useState } from "react";
import { addMinutesToEntry, getLatestEntry } from "../lib/db";
import { todayKey } from "../lib/dates";
import {
  pomodoroBreakMinutes,
  pomodoroFocusMinutes,
} from "../lib/settings";
import type { EntryOption } from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import { PauseIcon, PlayIcon, RotateIcon } from "./icons";
import { Button, Card } from "./ui";

type Phase = "focus" | "break";

function entryLabel(entry: EntryOption): string {
  const text = entry.action ?? entry.learned ?? entry.text;
  return text.length > 44 ? `${text.slice(0, 43)}…` : text;
}

function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
}

/**
 * A minimal Pomodoro timer. It only ticks while the widget is visible and logs
 * completed focus minutes to the most recent entry earned today.
 */
export function PomodoroCard({ active }: { active: boolean }) {
  const goal = useAppStore((state) => state.goal);
  const settings = useAppStore((state) => state.settings);
  const visible = useAppStore((state) => state.visible);
  const revision = useAppStore((state) => state.revision);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);

  const focusMinutes = pomodoroFocusMinutes(settings);
  const breakMinutes = pomodoroBreakMinutes(settings);

  const [phase, setPhase] = useState<Phase>("focus");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(focusMinutes * 60);
  const [latest, setLatest] = useState<EntryOption | null>(null);
  const [loading, setLoading] = useState(true);
  const deadlineRef = useRef<number | null>(null);
  const completingRef = useRef(false);

  const duration = (phase === "focus" ? focusMinutes : breakMinutes) * 60;
  const elapsedMinutes = Math.max(0, Math.floor((duration - remaining) / 60));

  useEffect(() => {
    if (!active || !goal) return;
    const goalId = goal.id;
    let cancelled = false;
    getLatestEntry(goalId, todayKey())
      .then((entry) => {
        if (!cancelled) setLatest(entry);
      })
      .catch((error: unknown) => {
        console.warn("Could not load the latest entry for the timer", error);
        if (!cancelled) setLatest(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, goal?.id, revision]);

  // Reset only when the configured phase length changes (or after a phase
  // switch); pausing must keep the remaining time intact.
  useEffect(() => {
    if (!running) setRemaining(duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  // Hiding the widget pauses the timer; no interval keeps running in the tray.
  useEffect(() => {
    if (!visible && running) {
      const deadline = deadlineRef.current;
      if (deadline) {
        setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      }
      deadlineRef.current = null;
      setRunning(false);
    }
  }, [running, visible]);

  const complete = useCallback(async () => {
    deadlineRef.current = null;
    setRunning(false);

    if (phase === "focus") {
      try {
        // Re-read at completion so a session that crosses midnight still lands
        // on today's entry, and a newly logged entry is picked up.
        const target = goal ? await getLatestEntry(goal.id, todayKey()) : null;
        if (!target) {
          notify(
            "Log an entry first so focus minutes have somewhere to go",
            "error",
          );
        } else {
          await addMinutesToEntry(target.id, focusMinutes);
          setLatest(target);
          bumpRevision();
          notify(`Logged ${focusMinutes} min to “${entryLabel(target)}”`);
        }
      } catch (error) {
        console.error("Could not log focus minutes", error);
        notify("Could not log focus minutes", "error");
      }
      setPhase("break");
      setRemaining(breakMinutes * 60);
    } else {
      notify("Break finished");
      setPhase("focus");
      setRemaining(focusMinutes * 60);
    }
  }, [breakMinutes, bumpRevision, focusMinutes, goal, notify, phase]);

  useEffect(() => {
    if (!running || !visible) return;

    function tick() {
      const deadline = deadlineRef.current;
      if (!deadline) return;
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds <= 0 && !completingRef.current) {
        completingRef.current = true;
        void complete().finally(() => {
          completingRef.current = false;
        });
      }
    }

    tick();
    const interval = window.setInterval(tick, 1_000);
    return () => window.clearInterval(interval);
  }, [complete, running, visible]);

  function start() {
    if (phase === "focus" && !latest) {
      notify("Log an entry first so focus minutes have somewhere to go", "error");
      return;
    }
    const seconds = remaining > 0 ? remaining : duration;
    deadlineRef.current = Date.now() + seconds * 1_000;
    setRunning(true);
  }

  function pause() {
    const deadline = deadlineRef.current;
    if (deadline) {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)));
    }
    deadlineRef.current = null;
    setRunning(false);
  }

  function reset() {
    deadlineRef.current = null;
    setRunning(false);
    setPhase("focus");
    setRemaining(focusMinutes * 60);
  }

  async function logElapsed() {
    if (!latest || phase !== "focus" || elapsedMinutes < 1) return;
    try {
      await addMinutesToEntry(latest.id, elapsedMinutes);
      bumpRevision();
      notify(`Logged ${elapsedMinutes} min to “${entryLabel(latest)}”`);
      deadlineRef.current = null;
      setRunning(false);
      setRemaining(duration);
    } catch (error) {
      console.error("Could not log elapsed focus minutes", error);
      notify("Could not log focus minutes", "error");
    }
  }

  if (!goal) return null;

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Focus timer
          </p>
          <p className="truncate text-[10.5px] text-muted">
            {loading
              ? "Finding your latest entry…"
              : latest
                ? `Logs to ${entryLabel(latest)}`
                : "Log an entry first"}
          </p>
        </div>
        <span
          className={
            phase === "focus"
              ? "rounded-full bg-accent/15 px-2 py-0.5 text-[9.5px] font-medium text-accent"
              : "rounded-full bg-success/15 px-2 py-0.5 text-[9.5px] font-medium text-success"
          }
        >
          {phase === "focus" ? "Focus" : "Break"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-[66px] shrink-0 text-[24px] font-semibold leading-none tabular-nums">
          {clock(remaining)}
        </span>
        <div className="flex flex-1 gap-1.5">
          {running ? (
            <Button
              className="h-8 flex-1 px-2 text-[11px]"
              onClick={pause}
              aria-label="Pause focus timer"
            >
              <PauseIcon className="h-3.5 w-3.5" />
              Pause
            </Button>
          ) : (
            <Button
              className="h-8 flex-1 px-2 text-[11px]"
              disabled={phase === "focus" && !latest}
              onClick={start}
            >
              <PlayIcon className="h-3.5 w-3.5" />
              {remaining === duration ? "Start" : "Resume"}
            </Button>
          )}
          <Button
            variant="subtle"
            className="h-8 px-2"
            onClick={reset}
            aria-label="Reset focus timer"
          >
            <RotateIcon className="h-3.5 w-3.5" />
          </Button>
          {phase === "focus" ? (
            <Button
              variant="subtle"
              className="h-8 px-2 text-[10.5px]"
              disabled={!latest || elapsedMinutes < 1}
              onClick={() => void logElapsed()}
            >
              Log {elapsedMinutes > 0 ? `${elapsedMinutes}m` : "…"}
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-[9.5px] leading-relaxed text-muted">
        {focusMinutes} min focus · {breakMinutes} min break · paused whenever
        Striker is hidden.
      </p>
    </Card>
  );
}
