import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMiniStore } from "../store/useMiniStore";

export function useWindowBridge(): void {
  const hydrate = useMiniStore((state) => state.hydrate);
  const setVisible = useMiniStore((state) => state.setVisible);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    let disposed = false;
    const stops: Array<() => void> = [];

    async function connect() {
      try {
        const window = getCurrentWindow();
        const visible = await window.isVisible();
        if (disposed) return;
        setVisible(visible);

        const subscriptions = await Promise.all([
          window.listen<boolean>("striker-mini://visibility", (event) => {
            setVisible(Boolean(event.payload));
          }),
          window.onFocusChanged(({ payload }) => {
            if (payload) setVisible(true);
          }),
        ]);

        if (disposed) subscriptions.forEach((stop) => stop());
        else stops.push(...subscriptions);
      } catch (error) {
        console.warn("Tauri window bridge unavailable:", error);
      }
    }

    void connect();

    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
    };
  }, [setVisible]);
}
