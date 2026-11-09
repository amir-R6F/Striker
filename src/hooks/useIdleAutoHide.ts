import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store/useAppStore";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
] as const;

/**
 * Arms a single timeout while the widget is visible and clears it as soon as
 * the window is hidden, so a hidden widget runs no timers at all.
 */
export function useIdleAutoHide(
  enabled: boolean,
  minutes: number,
  visible: boolean,
): void {
  const setVisible = useAppStore((state) => state.setVisible);

  useEffect(() => {
    if (!enabled || !visible) return;

    const limit = Math.max(1, minutes) * 60_000;
    let timer = 0;
    let lastArm = 0;

    function hide() {
      timer = 0;
      void getCurrentWindow()
        .hide()
        .then(() => setVisible(false))
        .catch(() => undefined);
    }

    function arm() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(hide, limit);
    }

    function onActivity() {
      const now = Date.now();
      // Throttle so mouse movement doesn't reschedule the timeout constantly.
      if (now - lastArm < 1_500) return;
      lastArm = now;
      arm();
    }

    arm();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );

    return () => {
      if (timer) window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity),
      );
    };
  }, [enabled, minutes, setVisible, visible]);
}
