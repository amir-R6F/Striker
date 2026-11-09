export interface Goal {
  id: number;
  title: string;
  description: string | null;
  start_date: string;
  weekly_hours_goal: number;
  success_criteria: string | null;
  created_at: string;
}

export interface Entry {
  id: number;
  goal_id: number;
  date: string;
  /** Legacy freeform note kept for rows created before structured logging. */
  text: string;
  action: string | null;
  learned: string | null;
  difficulty: string | null;
  source: string | null;
  evidence: string | null;
  minutes: number | null;
  confidence: number | null;
  skill_tag: string | null;
  created_at: string;
}

export interface SkillResource {
  title: string;
  url: string;
}

export interface SkillTree {
  id: number;
  goal_id: number | null;
  title: string;
  description: string | null;
  source: "manual" | "ai" | "imported";
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: number;
  tree_id: number;
  external_id: string | null;
  name: string;
  description: string | null;
  parent_id: number | null;
  order_index: number;
  tags: string[];
  estimated_hours: number;
  resources: SkillResource[];
  created_at: string;
  updated_at: string;
}

export interface SkillWithStats extends Skill {
  minutes: number;
  entries: number;
}

export interface SkillNodeInput {
  treeId: number;
  parentId: number | null;
  title: string;
  description: string | null;
  tags: string[];
  estimatedHours: number;
  resources: SkillResource[];
  orderIndex?: number;
}

export interface SkillNodeUpdate {
  title: string;
  description: string | null;
  tags: string[];
  estimatedHours: number;
  resources: SkillResource[];
}

export interface SkillTreeInput {
  goalId: number | null;
  title: string;
  description: string | null;
  source: "manual" | "ai" | "imported";
}

export interface Milestone {
  id: number;
  goal_id: number;
  title: string;
  description: string | null;
  target_date: string | null;
  /** Optional target so the dashboard can show a meaningful bar. */
  target_minutes: number | null;
  /** Local date (YYYY-MM-DD) when the milestone was manually completed. */
  completed_at: string | null;
  created_at: string;
}

export type EvidenceKind = "image" | "pdf" | "link" | "file";

export interface Evidence {
  id: number;
  entry_id: number;
  kind: EvidenceKind;
  path: string;
  original_name: string | null;
  created_at: string;
}

export interface EvidenceInput {
  kind: EvidenceKind;
  path: string;
  originalName: string | null;
}

export interface EvidenceWithEntry extends Evidence {
  entry_date: string;
  entry_action: string | null;
}

export interface MilestoneWithProgress extends Milestone {
  minutes: number;
  entry_count: number;
  entry_ids: number[];
}

export interface WeeklyReview {
  id: number;
  goal_id: number;
  week_start: string;
  summary: string | null;
  next_week_plan: string | null;
  open_questions: string | null;
}

export interface Flashcard {
  id: number;
  goal_id: number;
  entry_id: number | null;
  front: string;
  back: string;
  due_date: string;
  interval_days: number;
  ease: number;
  repetitions: number;
  lapses: number;
  last_reviewed_at: string | null;
  created_at: string;
}

export type FlashcardGrade = "again" | "hard" | "good" | "easy";

export interface FlashcardInput {
  id?: number;
  goalId: number;
  entryId: number | null;
  front: string;
  back: string;
}

export interface FlashcardWithEntry extends Flashcard {
  entry_date: string | null;
  entry_action: string | null;
  entry_learned: string | null;
}

export interface FlashcardSuggestion {
  entry_id: number;
  entry_date: string;
  front: string;
  back: string;
}

export interface FlashcardReviewResult {
  dueDate: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
}

/** A card draft handed to the Review tab from another view. */
export interface FlashcardDraft {
  front: string;
  back: string;
  entryId: number | null;
  nonce: number;
}

export interface WeeklySkillStat {
  name: string;
  minutes: number;
  entries: number;
}

/** Stats and suggested text used to pre-fill a weekly review. */
export interface WeeklyReviewDraft {
  weekStart: string;
  entries: number;
  minutes: number;
  days: number;
  confidence: number | null;
  topSkills: WeeklySkillStat[];
  summary: string;
  nextWeekPlan: string;
  openQuestions: string;
}

export interface AiWeekSummary {
  keyLearnings: string[];
  suggestions: string[];
  openQuestions: string[];
}

export interface RestoreSummary {
  goals: number;
  entries: number;
  skills: number;
  milestones: number;
  evidence: number;
  reviews: number;
  flashcards: number;
}

export interface ReminderSnapshot {
  lastEntryDate: string | null;
  daysSinceEntry: number | null;
  passiveOnlyDays: number;
  weekStart: string;
  weekEntries: number;
  weekMinutes: number;
  weeklyReviewSaved: boolean;
  dueCards: number;
}

/** A single day aggregated from the entries table. */
export interface DailyRow {
  date: string;
  minutes: number;
  confidence: number | null;
  entries: number;
}

/** Minutes per day and skill, used by the stacked dashboard chart. */
export interface SkillTimeRow {
  date: string;
  skill: string;
  minutes: number;
}

/** Daily average confidence per skill. */
export interface SkillConfidenceRow {
  skill: string;
  date: string;
  confidence: number;
}

export interface GoalInput {
  title: string;
  description: string | null;
  startDate: string;
  weeklyHoursGoal: number;
  successCriteria: string | null;
}

export interface EntryInput {
  goalId: number;
  date: string;
  action: string | null;
  learned: string | null;
  difficulty: string | null;
  source: string | null;
  /** Legacy single-path mirror; new attachments also live in entry_evidence. */
  evidence: string | null;
  evidenceItems: EvidenceInput[];
  minutes: number | null;
  confidence: number | null;
  skillIds: number[];
  /** Mirrors the first selected skill for backwards compatibility. */
  skillTag: string | null;
}

export interface ReviewInput {
  goalId: number;
  weekStart: string;
  summary: string | null;
  nextWeekPlan: string | null;
  openQuestions: string | null;
}

export interface SkillInput {
  id?: number;
  name: string;
  parentId: number | null;
}

export interface MilestoneInput {
  id?: number;
  goalId: number;
  title: string;
  description: string | null;
  targetDate: string | null;
  targetMinutes: number | null;
  entryIds: number[];
}

export interface SearchFilters {
  query: string;
  skillId: number | null;
  goalId: number | null;
  from: string | null;
  to: string | null;
  minConfidence: number | null;
}

export interface SearchEntry extends Entry {
  skills: Skill[];
}

export interface EntryOption {
  id: number;
  date: string;
  action: string | null;
  learned: string | null;
  text: string;
  minutes: number | null;
}

export interface EntrySkillLink {
  entry_id: number;
  skill_id: number;
}

export interface EntrySkillNodeLink {
  entry_id: number;
  node_id: number;
}

export interface MilestoneEntryLink {
  milestone_id: number;
  entry_id: number;
}

export interface DashboardData {
  totalMinutes: number;
  totalXp: number;
  entryCount: number;
  daily: DailyRow[];
  dates: string[];
}

export interface ExportBundle {
  app: "Striker";
  schema_version: 4 | 5;
  exported_at: string;
  goals: Goal[];
  entries: Entry[];
  weekly_reviews: WeeklyReview[];
  flashcards: Flashcard[];
  skills: Skill[];
  entry_skills: EntrySkillLink[];
  skill_trees: SkillTree[];
  skill_nodes: Skill[];
  entry_skill_nodes: EntrySkillNodeLink[];
  milestones: Milestone[];
  milestone_entries: MilestoneEntryLink[];
  entry_evidence: Evidence[];
  settings: Record<string, string>;
}
