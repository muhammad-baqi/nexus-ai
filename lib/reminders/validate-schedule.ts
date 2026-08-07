import { z } from "zod";

import type { ReminderSchedule, ReminderType } from "@/lib/reminders/recurrence";

export const REMINDER_TYPES = ["one_time", "daily", "weekly", "monthly", "custom"] as const;

export const reminderIdSchema = z.string().uuid();

const hourSchema = z.number().int().min(0).max(23);
const minuteSchema = z.number().int().min(0).max(59);

const oneTimeSchema = z.object({
  type: z.literal("one_time"),
  fire_at: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
    .refine((value) => new Date(value).getTime() > Date.now(), "Reminder date must be in the future"),
});

const dailySchema = z.object({
  type: z.literal("daily"),
  hour: hourSchema,
  minute: minuteSchema,
});

const weeklySchema = z.object({
  type: z.literal("weekly"),
  hour: hourSchema,
  minute: minuteSchema,
  dayOfWeek: z.number().int().min(0).max(6),
});

const monthlySchema = z.object({
  type: z.literal("monthly"),
  hour: hourSchema,
  minute: minuteSchema,
  dayOfMonth: z.number().int().min(1).max(31),
});

// Two concrete custom forms — the exact examples Notifications.md itself names ("every 3 days,"
// "every weekday") — not a general recurrence-rule parser, which the spec doesn't ask for.
const customEveryNDaysSchema = z.object({
  type: z.literal("custom"),
  kind: z.literal("every_n_days"),
  hour: hourSchema,
  minute: minuteSchema,
  intervalDays: z.number().int().min(1).max(365),
});

const customEveryWeekdaySchema = z.object({
  type: z.literal("custom"),
  kind: z.literal("every_weekday"),
  hour: hourSchema,
  minute: minuteSchema,
});

// Not a discriminatedUnion at the top level — "custom" repeats the `type` literal across its two
// sub-forms, so `kind` is the real discriminator for those two, and zod's discriminatedUnion
// requires a single unique literal per branch.
export const reminderScheduleInputSchema = z.union([
  oneTimeSchema,
  dailySchema,
  weeklySchema,
  monthlySchema,
  customEveryNDaysSchema,
  customEveryWeekdaySchema,
]);

export type ReminderScheduleInput = z.infer<typeof reminderScheduleInputSchema>;

// Splits a validated input into the DB's `type` column, `schedule` jsonb blob, and (for
// `one_time` only) the directly user-chosen `next_fire_at` — the other four types compute theirs
// via `computeNextFireAt` instead (see the route handlers).
export function splitScheduleInput(
  input: ReminderScheduleInput,
): { type: ReminderType; schedule: ReminderSchedule; fireAt: Date | null } {
  if (input.type === "one_time") {
    return { type: "one_time", schedule: {}, fireAt: new Date(input.fire_at) };
  }
  const { type, ...schedule } = input;
  return { type, schedule: schedule as ReminderSchedule, fireAt: null };
}
