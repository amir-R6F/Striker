import { useEffect } from "react";
import { selectTheme, useMiniStore } from "../store/useMiniStore";

export function useTheme(): void {
  const settings = useMiniStore((state) => state.settings);
  const choice = selectTheme(settings);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const dark = choice === "dark" || (choice === "system" && media.matches);
      const root = document.documentElement;
      root.classList.toggle("dark", dark);
      root.dataset.theme = dark ? "dark" : "light";
      root.style.colorScheme = dark ? "dark" : "light";
    }

    apply();
    if (choice !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [choice]);
}
