import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store/useAppStore";

/**
 * Subscribes the UI to events emitted by the Rust side (tray, global shortcut,
 * hide/show) and boots the store from SQLite.
 */
export function useTauriBridge(): void {
  const hydrate = useAppStore((state) => state.hydrate);
  const setVisible = useAppStore((state) => state.setVisible);
  const requestQuickLog = useAppStore((state) => state.requestQuickLog);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    let disposed = false;
    const unlisten: Array<() => void> = [];

    async function connect() {
      try {
        const window = getCurrentWindow();
        const visible = await window.isVisible();
        if (disposed) return;
        setVisible(visible);

        const subscriptions = await Promise.all([
          window.listen<boolean>("striker://visibility", (event) =>
            setVisible(Boolean(event.payload)),
          ),
          window.listen("striker://quick-log", () => requestQuickLog()),
          window.onFocusChanged(({ payload }) => {
            if (payload) setVisible(true);
          }),
        ]);

        if (disposed) {
          subscriptions.forEach((stop) => stop());
        } else {
          unlisten.push(...subscriptions);
        }
      } catch (error) {
        // Running in a plain browser (no Tauri runtime) is a dev convenience.
        console.warn("Tauri window bridge unavailable:", error);
      }
    }

    void connect();

    return () => {
      disposed = true;
      unlisten.forEach((stop) => stop());
    };
  }, [requestQuickLog, setVisible]);
}
