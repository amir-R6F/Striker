import { useIdleAutoHide } from "./hooks/useIdleAutoHide";
import { useTheme } from "./hooks/useTheme";
import { useWindowBridge } from "./hooks/useWindowBridge";
import { idleHideMinutes } from "./lib/settings";
import { useMiniStore } from "./store/useMiniStore";
import { FocusScreen } from "./components/FocusScreen";
import { Onboarding } from "./components/Onboarding";
import { SettingsSheet } from "./components/SettingsSheet";
import { Toast } from "./components/Toast";
import { Button } from "./components/ui";
import { BoltIcon } from "./components/icons";

export default function App() {
  useWindowBridge();
  useTheme();

  const ready = useMiniStore((state) => state.ready);
  const error = useMiniStore((state) => state.error);
  const trees = useMiniStore((state) => state.trees);
  const settings = useMiniStore((state) => state.settings);
  const visible = useMiniStore((state) => state.visible);
  const onboardSkipped = useMiniStore((state) => state.onboardSkipped);
  const settingsOpen = useMiniStore((state) => state.settingsOpen);
  const hydrate = useMiniStore((state) => state.hydrate);

  useIdleAutoHide(idleHideMinutes(settings), visible);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-line bg-bg text-ink">
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-danger/15 text-danger">
            <BoltIcon className="h-5 w-5" />
          </span>
          <p className="text-[13px] font-semibold">
            Striker Mini could not open its database
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
          <p className="text-[11px] text-muted">Loading your trees…</p>
        </div>
      ) : trees.length === 0 && !onboardSkipped ? (
        <Onboarding />
      ) : (
        <FocusScreen />
      )}

      <SettingsSheet open={settingsOpen} />
      <Toast />
    </div>
  );
}
