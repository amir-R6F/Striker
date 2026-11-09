import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store/useAppStore";
import { BoltIcon, MinusIcon } from "./icons";
import { IconButton } from "./ui";

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
  const requestQuickLog = useAppStore((state) => state.requestQuickLog);

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
        <p className="mt-1 truncate text-[11px] leading-none text-muted">
          {goal?.title ?? "No active goal yet"}
        </p>
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
