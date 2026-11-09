import type { ComponentType, SVGProps } from "react";
import { useAppStore, type Tab } from "../store/useAppStore";
import {
  CalendarCheckIcon,
  ChartIcon,
  PenIcon,
  SearchIcon,
  SlidersIcon,
  TreeIcon,
} from "./icons";
import { cx } from "./ui";

const TABS: Array<{
  id: Tab;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  { id: "log", label: "Log", Icon: PenIcon },
  { id: "dashboard", label: "Dashboard", Icon: ChartIcon },
  { id: "search", label: "Search", Icon: SearchIcon },
  { id: "skills", label: "Skills", Icon: TreeIcon },
  { id: "review", label: "Review", Icon: CalendarCheckIcon },
  { id: "settings", label: "Settings", Icon: SlidersIcon },
];

export function TabBar() {
  const tab = useAppStore((state) => state.tab);
  const setTab = useAppStore((state) => state.setTab);

  return (
    <nav
      aria-label="Sections"
      className="mx-3 mb-2 grid shrink-0 grid-cols-6 gap-0.5 rounded-xl border border-line bg-card/70 p-0.5"
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex flex-col items-center gap-1 rounded-[9px] px-0.5 py-1.5 text-[8.5px] font-medium leading-none transition",
              active
                ? "bg-accent text-on-accent shadow-sm"
                : "text-muted hover:bg-card2/60 hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
