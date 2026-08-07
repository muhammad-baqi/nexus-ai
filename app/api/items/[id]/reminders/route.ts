import { NextResponse, type NextRequest } from "next/server";

import { fetchItemReminders } from "@/lib/items/reminders";
import { computeNextFireAt } from "@/lib/reminders/recurrence";
import { reminderScheduleInputSchema, splitScheduleInput } from "@/lib/reminders/validate-schedule";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema } from "@/lib/validation/items";

type RouteParams = { params: Promise<{ id: string }> };

function reminderFailedResponse() {
  return NextResponse.json(
    { error: { code: "reminder_failed", message: "Something went wrong with this reminder." } },
    { status: 500 },
  );
}

async function loadOwnedItem(supabase: Awaited<ReturnType<typeof createClient>>, itemId: string, ownerId: string) {
  return supabase
    .from("knowledge_items")
    .select("id")
    .eq("id", itemId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid item id." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data: item, error: itemError } = await loadOwnedItem(supabase, id, user.id);
  if (itemError) {
    console.error("[api/items/:id/reminders] item lookup failed:", itemError);
    return reminderFailedResponse();
  }
  if (!item) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This item doesn't exist." } },
      { status: 404 },
    );
  }

  const reminders = await fetchItemReminders(supabase, id);
  return NextResponse.json({ reminders });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid item id." } },
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

  const { data: item, error: itemError } = await loadOwnedItem(supabase, id, user.id);
  if (itemError) {
    console.error("[api/items/:id/reminders] item lookup failed:", itemError);
    return reminderFailedResponse();
  }
  if (!item) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This item doesn't exist." } },
      { status: 404 },
    );
  }

  const { type, schedule, fireAt } = splitScheduleInput(result.data);
  const nextFireAt = fireAt ?? computeNextFireAt(type, schedule, new Date());

  const { data: reminder, error: insertError } = await supabase
    .from("reminders")
    .insert({
      knowledge_item_id: id,
      type,
      schedule,
      next_fire_at: nextFireAt ? nextFireAt.toISOString() : null,
    })
    .select("id, type, schedule, next_fire_at, is_active, created_at")
    .single();

  if (insertError) {
    console.error("[api/items/:id/reminders] insert failed:", insertError);
    return reminderFailedResponse();
  }

  return NextResponse.json({ reminder }, { status: 201 });
}
