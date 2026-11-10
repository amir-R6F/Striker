import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMiniStore } from "../store/useMiniStore";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
] as const;

/** Arms one timeout while visible; no timer runs while the widget is hidden. */
export function useIdleAutoHide(minutes: number, visible: boolean): void {
  const setVisible = useMiniStore((state) => state.setVisible);

  useEffect(() => {
    if (!visible) return;

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
      if (now - lastArm < 1_500) return;
      lastArm = now;
      arm();
    }

    arm();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      if (timer) window.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [minutes, setVisible, visible]);
}
