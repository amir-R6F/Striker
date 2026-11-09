export type Theme = "dark" | "light";

export interface ChartColors {
  accent: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  text: string;
}

export const CHART_COLORS: Record<Theme, ChartColors> = {
  dark: {
    accent: "#7d9bff",
    grid: "#252b38",
    axis: "#8b94a8",
    tooltipBg: "#141820",
    tooltipBorder: "#2b3342",
    text: "#eef1f8",
  },
  light: {
    accent: "#3d63f5",
    grid: "#e3e7f0",
    axis: "#667085",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e3e7f0",
    text: "#12151d",
  },
};

/** Stable colors for skill series; index-matched across charts. */
export const SKILL_PALETTE: Record<Theme, string[]> = {
  dark: [
    "#7d9bff",
    "#4fd1c5",
    "#f6c177",
    "#f472b6",
    "#86efac",
    "#c4b5fd",
    "#fb923c",
    "#38bdf8",
  ],
  light: [
    "#3d63f5",
    "#0d9488",
    "#b45309",
    "#db2777",
    "#15803d",
    "#7c3aed",
    "#c2410c",
    "#0284c7",
  ],
};

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
