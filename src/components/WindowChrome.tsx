import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getGoals } from "../lib/db";
import { SETTING_KEYS } from "../lib/settings";
import type { Goal } from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import { BoltIcon, MinusIcon } from "./icons";
import { IconButton, Select } from "./ui";

async function hideWidget(): Promise<void> {
  try {
    await getCurrentWindow().hide();
    useAppStore.getState().setVisible(false);
  } catch (error) {
    console.warn("Could not hide the window", error);
  }
}

export function WindowChrome() {
  const goal = useAppStore((state) => state.goal);
  const revision = useAppStore((state) => state.revision);
  const requestQuickLog = useAppStore((state) => state.requestQuickLog);
  const setGoal = useAppStore((state) => state.setGoal);
  const setSetting = useAppStore((state) => state.setSetting);
  const bumpRevision = useAppStore((state) => state.bumpRevision);

  const [goals, setGoals] = useState<Goal[]>([]);

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

  async function switchGoal(id: number) {
    const next = goals.find((candidate) => candidate.id === id);
    if (!next) return;
    setGoal(next);
    await setSetting(SETTING_KEYS.activeGoal, String(next.id));
    bumpRevision();
  }

  return (
    <header
      data-tauri-drag-region
      className="flex h-[52px] shrink-0 items-center gap-2.5 px-3.5 pt-1"
    >
      <div
        data-tauri-drag-region
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-on-accent shadow-sm"
      >
        <BoltIcon className="h-4 w-4" />
      </div>
      <div data-tauri-drag-region className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-semibold leading-none">Striker</span>
          <span className="h-1 w-1 rounded-full bg-muted/60" />
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted">
            daily log
          </span>
        </div>
        {goals.length > 1 ? (
          <div className="mt-0.5 w-[190px]">
            <Select
              value={goal?.id ?? ""}
              onChange={(event) => void switchGoal(Number(event.target.value))}
              aria-label="Active goal"
              className="h-6 rounded-md py-0 pl-1 text-[10.5px] text-muted"
            >
              {goals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <p className="mt-1 truncate text-[11px] leading-none text-muted">
            {goal?.title ?? "No active goal yet"}
          </p>
        )}
      </div>
      <IconButton label="Quick log (Ctrl+Shift+S)" onClick={requestQuickLog}>
        <BoltIcon className="h-4 w-4" />
      </IconButton>
      <IconButton label="Hide widget" onClick={() => void hideWidget()}>
        <MinusIcon className="h-4 w-4" />
      </IconButton>
    </header>
  );
}
