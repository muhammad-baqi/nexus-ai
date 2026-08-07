"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ReminderType = "one_time" | "daily" | "weekly" | "monthly" | "custom";

type Reminder = {
  id: string;
  type: ReminderType;
  schedule: Record<string, unknown>;
  next_fire_at: string | null;
  is_active: boolean;
  created_at: string;
};

type Props = {
  itemId: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function describeSchedule(reminder: Reminder): string {
  const s = reminder.schedule;
  const time = typeof s.hour === "number" && typeof s.minute === "number" ? `${pad(s.hour)}:${pad(s.minute)} UTC` : "";
  switch (reminder.type) {
    case "one_time":
      return reminder.next_fire_at ? new Date(reminder.next_fire_at).toLocaleString() : "One-time";
    case "daily":
      return `Daily at ${time}`;
    case "weekly":
      return `Weekly on ${DAY_NAMES[s.dayOfWeek as number] ?? "?"} at ${time}`;
    case "monthly":
      return `Monthly on day ${s.dayOfMonth} at ${time}`;
    case "custom":
      return s.kind === "every_n_days" ? `Every ${s.intervalDays} days at ${time}` : `Every weekday at ${time}`;
  }
}

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

// Self-contained fetch/state, embedded in every item-view component next to TagInput/
// MoveItemControl (same shape as both — see components/notes/tag-input.tsx).
export function RemindersPanel({ itemId }: Props) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const [draftType, setDraftType] = useState<ReminderType>("one_time");
  const [draftFireAt, setDraftFireAt] = useState("");
  const [draftTime, setDraftTime] = useState("09:00");
  const [draftDayOfWeek, setDraftDayOfWeek] = useState(1);
  const [draftDayOfMonth, setDraftDayOfMonth] = useState(1);
  const [draftCustomKind, setDraftCustomKind] = useState<"every_n_days" | "every_weekday">("every_n_days");
  const [draftIntervalDays, setDraftIntervalDays] = useState(3);

  const load = useCallback(async () => {
    const response = await fetch(`/api/items/${itemId}/reminders`);
    if (!response.ok) {
      setLoadError("Couldn't load reminders.");
      return;
    }
    const body: { reminders: Reminder[] } = await response.json();
    setReminders(body.reminders);
    setLoadError(undefined);
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setDraftType("one_time");
    setDraftFireAt("");
    setDraftTime("09:00");
    setDraftDayOfWeek(1);
    setDraftDayOfMonth(1);
    setDraftCustomKind("every_n_days");
    setDraftIntervalDays(3);
    setFormError(undefined);
  }

  function startCreate() {
    resetForm();
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(reminder: Reminder) {
    resetForm();
    setDraftType(reminder.type);
    const s = reminder.schedule;
    if (reminder.type === "one_time" && reminder.next_fire_at) {
      // datetime-local wants a local-timezone value with no trailing "Z" — this is the one field
      // that's a real instant (not a recurring UTC hour/minute), so round-tripping through the
      // browser's local timezone here is correct, unlike the recurring types' UTC time inputs.
      const d = new Date(reminder.next_fire_at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
      setDraftFireAt(local.toISOString().slice(0, 16));
    }
    if (typeof s.hour === "number" && typeof s.minute === "number") {
      setDraftTime(`${pad(s.hour as number)}:${pad(s.minute as number)}`);
    }
    if (typeof s.dayOfWeek === "number") setDraftDayOfWeek(s.dayOfWeek as number);
    if (typeof s.dayOfMonth === "number") setDraftDayOfMonth(s.dayOfMonth as number);
    if (s.kind === "every_n_days" || s.kind === "every_weekday") setDraftCustomKind(s.kind);
    if (typeof s.intervalDays === "number") setDraftIntervalDays(s.intervalDays as number);
    setEditingId(reminder.id);
    setShowForm(true);
  }

  function buildPayload(): Record<string, unknown> | null {
    if (draftType === "one_time") {
      if (!draftFireAt) return null;
      return { type: "one_time", fire_at: new Date(draftFireAt).toISOString() };
    }
    const [hourStr, minuteStr] = draftTime.split(":");
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

    if (draftType === "daily") return { type: "daily", hour, minute };
    if (draftType === "weekly") return { type: "weekly", hour, minute, dayOfWeek: draftDayOfWeek };
    if (draftType === "monthly") return { type: "monthly", hour, minute, dayOfMonth: draftDayOfMonth };
    return draftCustomKind === "every_n_days"
      ? { type: "custom", kind: "every_n_days", hour, minute, intervalDays: draftIntervalDays }
      : { type: "custom", kind: "every_weekday", hour, minute };
  }

  async function handleSubmit() {
    const payload = buildPayload();
    if (!payload) {
      setFormError("Please fill in all fields.");
      return;
    }

    setFormError(undefined);
    setIsSaving(true);
    const response = editingId
      ? await fetch(`/api/reminders/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/items/${itemId}/reminders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setIsSaving(false);

    if (!response.ok) {
      setFormError(await parseErrorMessage(response, "Something went wrong saving this reminder."));
      return;
    }

    setShowForm(false);
    setEditingId(null);
    await load();
  }

  async function handleCancel(reminder: Reminder) {
    setFormError(undefined);
    const response = await fetch(`/api/reminders/${reminder.id}`, { method: "DELETE" });
    if (!response.ok) {
      setFormError(await parseErrorMessage(response, "Something went wrong cancelling this reminder."));
      return;
    }
    await load();
  }

  const activeReminders = (reminders ?? []).filter((r) => r.is_active);
  const cancelledReminders = (reminders ?? []).filter((r) => !r.is_active);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Reminders</Label>
        {!showForm && (
          <Button type="button" variant="outline" size="sm" onClick={startCreate}>
            Add reminder
          </Button>
        )}
      </div>

      {loadError && (
        <p className="text-destructive text-sm" role="alert">
          {loadError}
        </p>
      )}

      {reminders !== null && activeReminders.length === 0 && !showForm && (
        <p className="text-muted-foreground text-sm">No active reminders.</p>
      )}

      <ul className="flex flex-col gap-1">
        {activeReminders.map((reminder) => (
          <li key={reminder.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{describeSchedule(reminder)}</span>
            {/* While this reminder is the one being edited, its own actions are replaced by the
                edit form below — otherwise its "Cancel" (soft-cancel this reminder) and the form's
                own "Cancel" (abort editing) would render side by side with the same label. */}
            {reminder.id === editingId ? (
              <span className="text-muted-foreground text-xs">Editing…</span>
            ) : (
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(reminder)}>
                  Edit
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleCancel(reminder)}>
                  Cancel
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {cancelledReminders.length > 0 && (
        <ul className="flex flex-col gap-1">
          {cancelledReminders.map((reminder) => (
            <li key={reminder.id} className="text-muted-foreground text-xs">
              Cancelled — {describeSchedule(reminder)}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-type">Type</Label>
            <select
              id="reminder-type"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as ReminderType)}
              disabled={editingId !== null}
            >
              <option value="one_time">One-time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {draftType === "one_time" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-fire-at">Date &amp; time</Label>
              <Input
                id="reminder-fire-at"
                type="datetime-local"
                value={draftFireAt}
                onChange={(e) => setDraftFireAt(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-time">Time (UTC)</Label>
              <Input
                id="reminder-time"
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
              />
            </div>
          )}

          {draftType === "weekly" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-day-of-week">Day of week</Label>
              <select
                id="reminder-day-of-week"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={draftDayOfWeek}
                onChange={(e) => setDraftDayOfWeek(Number(e.target.value))}
              >
                {DAY_NAMES.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {draftType === "monthly" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-day-of-month">Day of month</Label>
              <Input
                id="reminder-day-of-month"
                type="number"
                min={1}
                max={31}
                value={draftDayOfMonth}
                onChange={(e) => setDraftDayOfMonth(Number(e.target.value))}
              />
              <p className="text-muted-foreground text-xs">
                Falls back to a shorter month&apos;s last day automatically.
              </p>
            </div>
          )}

          {draftType === "custom" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reminder-custom-kind">Recurrence</Label>
                <select
                  id="reminder-custom-kind"
                  className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  value={draftCustomKind}
                  onChange={(e) => setDraftCustomKind(e.target.value as "every_n_days" | "every_weekday")}
                >
                  <option value="every_n_days">Every N days</option>
                  <option value="every_weekday">Every weekday</option>
                </select>
              </div>
              {draftCustomKind === "every_n_days" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reminder-interval-days">Every how many days</Label>
                  <Input
                    id="reminder-interval-days"
                    type="number"
                    min={1}
                    max={365}
                    value={draftIntervalDays}
                    onChange={(e) => setDraftIntervalDays(Number(e.target.value))}
                  />
                </div>
              )}
            </>
          )}

          {formError && (
            <p className="text-destructive text-sm" role="alert">
              {formError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
