import { useState, type FormEvent } from "react";
import { createGoal } from "../lib/db";
import { todayKey } from "../lib/dates";
import { SETTING_KEYS } from "../lib/settings";
import { useAppStore } from "../store/useAppStore";
import { Button, Card, Field, TextArea, TextInput } from "./ui";

export function GoalSetup() {
  const setGoal = useAppStore((state) => state.setGoal);
  const setSetting = useAppStore((state) => state.setSetting);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(todayKey());
  const [weeklyHours, setWeeklyHours] = useState("5");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
        description,
        startDate: startDate || todayKey(),
        weeklyHoursGoal,
        successCriteria,
      });
      setGoal(goal);
      await setSetting(SETTING_KEYS.activeGoal, String(goal.id));
      bumpRevision();
      notify("Goal created");
    } catch (error) {
      console.error("Could not create goal", error);
      notify("Could not create goal", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
          Set up
        </p>
        <h2 className="mt-0.5 text-[15px] font-semibold">What are you learning?</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          Goals keep your log focused. You can switch between them from the
          header at any time.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Goal title" htmlFor="goal-title">
          <TextInput
            id="goal-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Blender character art"
            autoFocus
            maxLength={120}
            required
          />
        </Field>

        <Field label="Description" htmlFor="goal-description" hint="optional">
          <TextArea
            id="goal-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What does progress look like?"
            rows={2}
            maxLength={600}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Start date" htmlFor="goal-start">
            <TextInput
              id="goal-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </Field>
          <Field label="Hours / week" htmlFor="goal-hours">
            <TextInput
              id="goal-hours"
              type="number"
              min={0}
              max={168}
              step={0.5}
              value={weeklyHours}
              onChange={(event) => setWeeklyHours(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Success criteria" htmlFor="goal-criteria" hint="optional">
          <TextArea
            id="goal-criteria"
            value={successCriteria}
            onChange={(event) => setSuccessCriteria(event.target.value)}
            placeholder="How will you know you succeeded?"
            rows={2}
            maxLength={600}
          />
        </Field>

        <Button
          type="submit"
          className="h-10 w-full"
          disabled={saving || !title.trim()}
        >
          {saving ? "Creating…" : "Create goal"}
        </Button>
      </form>
    </Card>
  );
}

export function EmptyGoal({ message }: { message: string }) {
  const setTab = useAppStore((state) => state.setTab);
  return (
    <Card className="flex flex-col items-start gap-2 p-4">
      <p className="text-[13px] font-medium">No active goal yet</p>
      <p className="text-[11.5px] leading-relaxed text-muted">{message}</p>
      <Button
        variant="subtle"
        className="h-8 px-3"
        onClick={() => setTab("log")}
      >
        Set up a goal
      </Button>
    </Card>
  );
}
