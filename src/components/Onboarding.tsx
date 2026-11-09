import { useState, type FormEvent } from "react";
import EXAMPLE_ROADMAP from "../assets/example-roadmap.json";
import { appendSkillTreeFromRoadmap, createGoal } from "../lib/db";
import { todayKey } from "../lib/dates";
import { parseRoadmap } from "../lib/skillTree";
import { SETTING_KEYS } from "../lib/settings";
import { useAppStore } from "../store/useAppStore";
import { BoltIcon } from "./icons";
import { Button, Field, TextArea, TextInput } from "./ui";

/**
 * First launch: one goal, one weekly target, one success sentence. Saving also
 * imports the bundled example roadmap so the Skills tab is never empty.
 */
export function Onboarding() {
  const setGoal = useAppStore((state) => state.setGoal);
  const setSetting = useAppStore((state) => state.setSetting);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);

  const [title, setTitle] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("5");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || saving) return;

    const hours = Number(weeklyHours);
    const weeklyHoursGoal = Number.isFinite(hours)
      ? Math.min(168, Math.max(0, hours))
      : 0;

    setSaving(true);
    try {
      const goal = await createGoal({
        title,
        description: null,
        startDate: todayKey(),
        weeklyHoursGoal,
        successCriteria,
      });
      const roadmap = parseRoadmap(JSON.stringify(EXAMPLE_ROADMAP));
      const treeId = await appendSkillTreeFromRoadmap(goal.id, roadmap);
      await setSetting(SETTING_KEYS.activeGoal, String(goal.id));
      await setSetting(SETTING_KEYS.defaultGoal, String(goal.id));
      await setSetting(SETTING_KEYS.activeSkillTree, String(treeId));
      setGoal(goal);
      bumpRevision();
      notify("Goal created with an example roadmap");
    } catch (error) {
      console.error("Could not finish onboarding", error);
      notify("Could not create your goal", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col justify-center overflow-y-auto px-5 pb-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-on-accent shadow-sm">
          <BoltIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
            Welcome
          </p>
          <h1 className="text-[17px] font-semibold leading-tight">
            What are you learning?
          </h1>
        </div>
      </div>

      <p className="mb-4 text-[11.5px] leading-relaxed text-muted">
        One goal to start. Striker seeds it with an editable example roadmap —
        rename anything later.
      </p>

      <form onSubmit={(event) => void handleStart(event)} className="space-y-3">
        <Field label="Goal title" htmlFor="onboarding-title">
          <TextInput
            id="onboarding-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Blender character art"
            autoFocus
            maxLength={120}
            required
          />
        </Field>

        <Field label="Weekly hours target" htmlFor="onboarding-hours">
          <TextInput
            id="onboarding-hours"
            type="number"
            min={0}
            max={168}
            step={0.5}
            value={weeklyHours}
            onChange={(event) => setWeeklyHours(event.target.value)}
          />
        </Field>

        <Field label="Success criteria" htmlFor="onboarding-criteria" hint="optional">
          <TextArea
            id="onboarding-criteria"
            rows={3}
            value={successCriteria}
            onChange={(event) => setSuccessCriteria(event.target.value)}
            placeholder="How will you know you succeeded?"
            maxLength={600}
          />
        </Field>

        <Button
          type="submit"
          className="h-10 w-full"
          disabled={saving || !title.trim()}
        >
          {saving ? "Setting up…" : "Start"}
        </Button>
      </form>
    </div>
  );
}
