import { useEffect, useMemo, useState } from "react";
import { getGoals, getSkills, getSkillTrees, searchEntries } from "../../lib/db";
import { formatMinutes, formatShort } from "../../lib/dates";
import { openTarget } from "../../lib/export";
import type { Goal, SearchEntry, Skill, SkillTree } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { Highlight } from "../Highlight";
import {
  ChevronDownIcon,
  LinkIcon,
  SearchIcon,
  SparkIcon,
} from "../icons";
import { Card, Field, Select, TextInput, cx } from "../ui";

export function SearchTab({ active }: { active: boolean }) {
  const revision = useAppStore((state) => state.revision);
  const notify = useAppStore((state) => state.notify);
  const openFlashcardDraft = useAppStore((state) => state.openFlashcardDraft);

  const [query, setQuery] = useState("");
  const [skillId, setSkillId] = useState<string>("");
  const [goalId, setGoalId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [trees, setTrees] = useState<SkillTree[]>([]);
  const [goals, setGoals] = useState<Array<Pick<Goal, "id" | "title">>>([]);
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSkills(), getSkillTrees(), getGoals()])
      .then(([nextSkills, nextTrees, nextGoals]) => {
        if (cancelled) return;
        setSkills(nextSkills);
        setTrees(nextTrees);
        setGoals(nextGoals);
      })
      .catch((error: unknown) => {
        console.warn("Could not load search filters", error);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(() => {
      searchEntries({
        query,
        skillId: skillId ? Number(skillId) : null,
        goalId: goalId ? Number(goalId) : null,
        from: from || null,
        to: to || null,
        minConfidence: minConfidence ? Number(minConfidence) : null,
      })
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
          setFailed(false);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.error("Search failed", error);
          setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, from, goalId, minConfidence, query, revision, skillId, to]);

  const parentNames = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill.name])),
    [skills],
  );

  const skillOptions = useMemo(() => {
    const treeNames = new Map(trees.map((tree) => [tree.id, tree.title]));
    return skills.map((skill) => {
      const path =
        skill.parent_id != null
          ? `${parentNames.get(skill.parent_id) ?? "Skill"} › ${skill.name}`
          : skill.name;
      const tree = treeNames.get(skill.tree_id);
      return { id: skill.id, label: tree ? `${tree} · ${path}` : path };
    });
  }, [parentNames, skills, trees]);

  const filterCount = [skillId, goalId, from, to, minConfidence].filter(Boolean).length;
  const hasCriteria = query.trim().length > 0 || filterCount > 0;

  async function openLink(target: string) {
    try {
      await openTarget(target);
    } catch (error) {
      console.error("Could not open target", error);
      notify("Could not open that link", "error");
    }
  }

  return (
    <div className="space-y-3 px-4 pb-5">
      <div>
        <h1 className="text-[14px] font-semibold">Search</h1>
        <p className="text-[10.5px] text-muted">
          Every action, note, question and link you have logged.
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search entries…"
          aria-label="Search entries"
          className="pl-8"
          maxLength={200}
        />
      </div>

      <button
        type="button"
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
        className="flex items-center gap-1 text-[11px] text-muted transition hover:text-ink"
      >
        <ChevronDownIcon
          className={cx("h-3.5 w-3.5 transition-transform", filtersOpen && "rotate-180")}
        />
        Filters
        {filterCount > 0 ? (
          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium text-accent">
            {filterCount}
          </span>
        ) : null}
      </button>

      {filtersOpen ? (
        <Card className="grid gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Skill" htmlFor="search-skill">
              <Select
                id="search-skill"
                value={skillId}
                onChange={(event) => setSkillId(event.target.value)}
              >
                <option value="">Any skill</option>
                {skillOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Confidence ≥" htmlFor="search-confidence">
              <Select
                id="search-confidence"
                value={minConfidence}
                onChange={(event) => setMinConfidence(event.target.value)}
              >
                <option value="">Any</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} / 5
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="From" htmlFor="search-from">
              <TextInput
                id="search-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="search-to">
              <TextInput
                id="search-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Goal" htmlFor="search-goal">
            <Select
              id="search-goal"
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
            >
              <option value="">All goals</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </Select>
          </Field>

          <button
            type="button"
            onClick={() => {
              setSkillId("");
              setGoalId("");
              setFrom("");
              setTo("");
              setMinConfidence("");
            }}
            className="self-start text-[10px] text-muted hover:text-ink"
          >
            Clear filters
          </button>
        </Card>
      ) : null}

      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          {loading
            ? "Searching…"
            : `${results.length} ${results.length === 1 ? "entry" : "entries"}`}
        </span>
      </div>

      {failed ? (
        <Card>
          <p className="py-4 text-center text-[11.5px] text-muted">
            Search is unavailable right now.
          </p>
        </Card>
      ) : null}

      {!failed && !loading && results.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-[11.5px] leading-relaxed text-muted">
            {hasCriteria
              ? "No entries match those filters."
              : "Nothing logged yet. Entries you log will be searchable here."}
          </p>
        </Card>
      ) : null}

      <div className="space-y-2">
        {results.map((entry) => {
          const title = entry.action ?? entry.learned ?? entry.text;
          const body = entry.action ? entry.learned : null;
          return (
            <article
              key={entry.id}
              className="rounded-xl border border-line bg-card p-2.5"
            >
              <div className="flex items-center justify-between gap-2 text-[9.5px] text-muted">
                <span>{formatShort(entry.date)}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  {entry.minutes != null ? (
                    <span>{formatMinutes(entry.minutes)}</span>
                  ) : null}
                  {entry.confidence != null ? (
                    <span>{entry.confidence}/5</span>
                  ) : null}
                </span>
              </div>

              <p className="mt-1 text-[12.5px] font-medium leading-snug">
                <Highlight text={title} query={query} />
              </p>

              {body ? (
                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted">
                  <Highlight text={body} query={query} />
                </p>
              ) : null}

              {entry.difficulty ? (
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                  <span className="font-medium text-ink/70">Hard: </span>
                  <Highlight text={entry.difficulty} query={query} />
                </p>
              ) : null}

              {entry.skills.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {entry.skills.map((skill) => (
                    <span
                      key={skill.id}
                      className="rounded-full border border-line bg-card2/60 px-1.5 py-0.5 text-[9px] text-muted"
                    >
                      {skill.name}
                    </span>
                  ))}
                </div>
              ) : null}

              {entry.source || entry.evidence ? (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {entry.source ? (
                    <button
                      type="button"
                      onClick={() => void openLink(entry.source as string)}
                      className="flex items-center gap-1 text-[9.5px] text-accent hover:underline"
                    >
                      <LinkIcon className="h-3 w-3" /> Source
                    </button>
                  ) : null}
                  {entry.evidence ? (
                    <button
                      type="button"
                      onClick={() => void openLink(entry.evidence as string)}
                      className="flex items-center gap-1 text-[9.5px] text-accent hover:underline"
                    >
                      <LinkIcon className="h-3 w-3" /> Evidence
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() =>
                    openFlashcardDraft({
                      front: title,
                      back:
                        entry.learned && entry.learned !== title
                          ? entry.learned
                          : "",
                      entryId: entry.id,
                    })
                  }
                  className="flex items-center gap-1 text-[9.5px] text-accent hover:underline"
                >
                  <SparkIcon className="h-3 w-3" /> Make card
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
