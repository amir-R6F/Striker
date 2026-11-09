export type EntryFocusTarget = "action" | "learned" | "difficulty";

export interface EntryTemplate {
  id: string;
  label: string;
  action: string;
  learned?: string;
  difficulty?: string;
  minutes?: string;
  openDetails: boolean;
  focus: EntryFocusTarget;
}

/** Quick-log structures shared by the Log tab and the entry editor. */
export const ENTRY_TEMPLATES: EntryTemplate[] = [
  {
    id: "practice",
    label: "Practice session",
    action: "Practice session",
    minutes: "45",
    openDetails: true,
    focus: "learned",
  },
  {
    id: "problem",
    label: "Problem & solution",
    action: "Problem & solution",
    difficulty: "Open question: ",
    openDetails: true,
    focus: "difficulty",
  },
  {
    id: "idea",
    label: "Project idea",
    action: "Project idea",
    learned: "Idea: ",
    openDetails: false,
    focus: "learned",
  },
  {
    id: "review",
    label: "Weekly review",
    action: "Weekly review",
    minutes: "30",
    openDetails: true,
    focus: "learned",
  },
];
