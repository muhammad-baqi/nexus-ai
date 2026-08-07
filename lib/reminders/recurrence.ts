// Recurrence calculation (Notifications.md's Reminder Types table). All schedules are evaluated
// in UTC — no timezone field exists anywhere in this app's schema (profiles included), matching
// every other timestamptz in the codebase.

export type ReminderType = "one_time" | "daily" | "weekly" | "monthly" | "custom";

export type DailySchedule = { hour: number; minute: number };
export type WeeklySchedule = { hour: number; minute: number; dayOfWeek: number };
export type MonthlySchedule = { hour: number; minute: number; dayOfMonth: number };
export type CustomSchedule =
  | { kind: "every_n_days"; hour: number; minute: number; intervalDays: number }
  | { kind: "every_weekday"; hour: number; minute: number };

export type ReminderSchedule =
  | Record<string, never>
  | DailySchedule
  | WeeklySchedule
  | MonthlySchedule
  | CustomSchedule;

// The real number of days in `year`/`monthIndex` (0-11) — day 0 of the *next* month is the last
// day of this one, the standard trick for this in the Date API.
export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function atTime(year: number, monthIndex: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, 0, 0));
}

function nextDaily(schedule: DailySchedule, from: Date): Date {
  const candidate = atTime(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), schedule.hour, schedule.minute);
  if (candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

function nextWeekly(schedule: WeeklySchedule, from: Date): Date {
  const candidate = atTime(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), schedule.hour, schedule.minute);
  while (candidate.getUTCDay() !== schedule.dayOfWeek || candidate <= from) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

function nextMonthly(schedule: MonthlySchedule, from: Date): Date {
  function candidateForMonth(year: number, monthIndex: number): Date {
    const day = Math.min(schedule.dayOfMonth, lastDayOfMonth(year, monthIndex));
    return atTime(year, monthIndex, day, schedule.hour, schedule.minute);
  }

  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  let candidate = candidateForMonth(year, month);
  while (candidate <= from) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = candidateForMonth(year, month);
  }
  return candidate;
}

function nextEveryNDays(schedule: { hour: number; minute: number; intervalDays: number }, from: Date): Date {
  const candidate = atTime(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), schedule.hour, schedule.minute);
  while (candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + schedule.intervalDays);
  return candidate;
}

function nextEveryWeekday(schedule: { hour: number; minute: number }, from: Date): Date {
  const candidate = atTime(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), schedule.hour, schedule.minute);
  while (candidate <= from || candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

// The next occurrence strictly after `from`. Used both to compute a reminder's initial
// `next_fire_at` at creation (`from` = now) and to advance it after a fire (`from` = the
// occurrence that just fired) — the same "strictly after" semantics work for both: at creation,
// an already-passed time today rolls to the next valid occurrence; when advancing, `from` sits
// exactly on a valid occurrence, so it always rolls forward to the *next* one, never repeats.
// Returns null for `one_time` — it has no next occurrence; its single `next_fire_at` is set
// directly from the user's chosen date and the reminder deactivates after it fires.
export function computeNextFireAt(type: ReminderType, schedule: ReminderSchedule, from: Date): Date | null {
  switch (type) {
    case "one_time":
      return null;
    case "daily":
      return nextDaily(schedule as DailySchedule, from);
    case "weekly":
      return nextWeekly(schedule as WeeklySchedule, from);
    case "monthly":
      return nextMonthly(schedule as MonthlySchedule, from);
    case "custom": {
      const custom = schedule as CustomSchedule;
      return custom.kind === "every_n_days" ? nextEveryNDays(custom, from) : nextEveryWeekday(custom, from);
    }
  }
}
