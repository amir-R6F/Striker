import { useIdleAutoHide } from "./hooks/useIdleAutoHide";
import { useSmartReminders } from "./hooks/useSmartReminders";
import { useTauriBridge } from "./hooks/useTauriBridge";
import { idleHideMinutes, isIdleHideEnabled } from "./lib/settings";
import { useAppStore } from "./store/useAppStore";
import { TabBar } from "./components/TabBar";
import { Toasts } from "./components/Toasts";
import { WindowChrome } from "./components/WindowChrome";
import { Button } from "./components/ui";
import { DashboardTab } from "./components/tabs/DashboardTab";
import { LogTab } from "./components/tabs/LogTab";
import { ReviewTab } from "./components/tabs/ReviewTab";
import { SearchTab } from "./components/tabs/SearchTab";
import { SettingsTab } from "./components/tabs/SettingsTab";
import { SkillsTab } from "./components/tabs/SkillsTab";
import { BoltIcon } from "./components/icons";

export default function App() {
  useTauriBridge();

  const ready = useAppStore((state) => state.ready);
  const error = useAppStore((state) => state.error);
  const tab = useAppStore((state) => state.tab);
  const visible = useAppStore((state) => state.visible);
  const settings = useAppStore((state) => state.settings);
  const hydrate = useAppStore((state) => state.hydrate);

  useIdleAutoHide(
    isIdleHideEnabled(settings),
    idleHideMinutes(settings),
    visible,
  );

  useSmartReminders(ready && visible && !error);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-line bg-bg text-ink">
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-danger/15 text-danger">
            <BoltIcon className="h-5 w-5" />
          </span>
          <p className="text-[13px] font-semibold">
            Striker could not open its database
          </p>
          <p className="max-w-[300px] break-words text-[11px] leading-relaxed text-muted">
            {error}
          </p>
          <Button className="h-8 px-3" onClick={() => void hydrate(true)}>
            Retry
          </Button>
        </div>
      ) : !ready ? (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-on-accent">
            <BoltIcon className="h-5 w-5" />
          </span>
          <p className="text-[11px] text-muted">Opening your log…</p>
        </div>
      ) : (
        <>
          <WindowChrome />
          <TabBar />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className={tab === "log" ? "block" : "hidden"}>
              <LogTab active={tab === "log"} />
            </div>
            <div className={tab === "dashboard" ? "block" : "hidden"}>
              <DashboardTab active={tab === "dashboard"} />
            </div>
            <div className={tab === "search" ? "block" : "hidden"}>
              <SearchTab active={tab === "search"} />
            </div>
            <div className={tab === "skills" ? "block" : "hidden"}>
              <SkillsTab active={tab === "skills"} />
            </div>
            <div className={tab === "review" ? "block" : "hidden"}>
              <ReviewTab active={tab === "review"} />
            </div>
            <div className={tab === "settings" ? "block" : "hidden"}>
              <SettingsTab />
            </div>
          </main>
        </>
      )}
      <Toasts />
    </div>
  );
}
