import { NextResponse, type NextRequest } from "next/server";

import { verifyReminderOwnership } from "@/lib/items/reminders";
import { computeNextFireAt } from "@/lib/reminders/recurrence";
import {
  reminderIdSchema,
  reminderScheduleInputSchema,
  splitScheduleInput,
} from "@/lib/reminders/validate-schedule";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";

// PostgREST's code for ".single() matched zero rows".
const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

function reminderFailedResponse() {
  return NextResponse.json(
    { error: { code: "reminder_failed", message: "Something went wrong with this reminder." } },
    { status: 500 },
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { error: { code: "not_found", message: "This reminder doesn't exist." } },
    { status: 404 },
  );
}

// Ownership verified explicitly via verifyReminderOwnership before every write below — RLS
// (reminders_owner_access, 001_initial_schema.sql) is still the actual enforced boundary
// (CLAUDE.md rule 1) and would reject a foreign reminder id regardless, but the explicit check
// gives a clean 404 instead of a generic RLS-denied update-affected-zero-rows response, matching
// this codebase's existing convention (e.g. verifyCollectionOwnership).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!reminderIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid reminder id." } },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const result = reminderScheduleInputSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid reminder.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  if (!(await verifyReminderOwnership(supabase, id, user.id))) return notFoundResponse();

  const { type, schedule, fireAt } = splitScheduleInput(result.data);
  // Reschedules future sends from *now*, not from the reminder's old next_fire_at — editing a
  // daily reminder from 9am to 5pm should apply going forward, not chain off the old time
  // (Notifications.md: "reschedules future sends; it does not resend anything already delivered").
  const nextFireAt = fireAt ?? computeNextFireAt(type, schedule, new Date());

  const { data: reminder, error } = await supabase
    .from("reminders")
    .update({
      type,
      schedule,
      next_fire_at: nextFireAt ? nextFireAt.toISOString() : null,
    })
    .eq("id", id)
    .select("id, type, schedule, next_fire_at, is_active, created_at")
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) return notFoundResponse();
    console.error("[api/reminders/:id] update failed:", error);
    return reminderFailedResponse();
  }

  return NextResponse.json({ reminder });
}

// Soft cancel — sets is_active=false without deleting the row, so its history survives
// (Notifications.md: "Cancelling deactivates the reminder without deleting its history").
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!reminderIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid reminder id." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  if (!(await verifyReminderOwnership(supabase, id, user.id))) return notFoundResponse();

  const { data: reminder, error } = await supabase
    .from("reminders")
    .update({ is_active: false })
    .eq("id", id)
    .select("id, type, schedule, next_fire_at, is_active, created_at")
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) return notFoundResponse();
    console.error("[api/reminders/:id] cancel failed:", error);
    return reminderFailedResponse();
  }

  return NextResponse.json({ reminder });
}
