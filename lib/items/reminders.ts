import type { createClient } from "@/lib/supabase/server";
import { computeNextFireAt, type ReminderSchedule, type ReminderType } from "@/lib/reminders/recurrence";

export type ItemReminder = {
  id: string;
  type: ReminderType;
  schedule: ReminderSchedule;
  next_fire_at: string | null;
  is_active: boolean;
  created_at: string;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// app/api/reminders/:id has no itemId in its URL to check ownership against directly (unlike
// the tags routes, nested under /api/items/:id/tags/...), so this looks up ownership through the
// embedded knowledge_items join instead — the same friendly-404-before-RLS-denies pattern
// `verifyCollectionOwnership` uses, just via reminders' own transitive-ownership shape.
export async function verifyReminderOwnership(
  supabase: SupabaseClient,
  reminderId: string,
  ownerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("reminders")
    .select("id, knowledge_items!inner(owner_id)")
    .eq("id", reminderId)
    .eq("knowledge_items.owner_id", ownerId)
    .maybeSingle();

  if (error) {
    console.error("[lib/items/reminders] verifyReminderOwnership lookup failed:", error);
    return false;
  }

  return !!data;
}

// Returns both active and cancelled reminders — Notifications.md: cancelling "deactivates...
// without deleting its history," so a cancelled reminder should still be visible, not hidden.
export async function fetchItemReminders(
  supabase: SupabaseClient,
  itemId: string,
): Promise<ItemReminder[] | null> {
  const { data, error } = await supabase
    .from("reminders")
    .select("id, type, schedule, next_fire_at, is_active, created_at")
    .eq("knowledge_item_id", itemId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[lib/items/reminders] fetchItemReminders failed:", error);
    return null;
  }

  return data as ItemReminder[];
}

// Called from app/api/items/[id]/route.ts's DELETE (trash) handler. `deactivated_by_trash` marks
// these as auto-deactivated (as opposed to a reminder the user had already manually cancelled
// before trashing) so restore below knows which ones it's allowed to bring back.
export async function deactivateRemindersForItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .update({ is_active: false, deactivated_by_trash: true })
    .eq("knowledge_item_id", itemId)
    .eq("is_active", true);

  if (error) {
    console.error("[lib/items/reminders] deactivateRemindersForItem failed:", error);
  }
}

// Called from app/api/items/[id]/restore/route.ts. Only reactivates reminders this app itself
// deactivated via trashing (deactivated_by_trash=true) — a reminder the user cancelled themselves
// before the item was ever trashed stays cancelled. Recurring types always come back (their
// next_fire_at is recomputed from now, since the stored value went stale while trashed);
// `one_time` only comes back if its original fire time is still in the future (Notifications.md:
// "reactivated ... if still due in the future").
export async function reactivateRemindersForItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<void> {
  const { data: candidates, error: fetchError } = await supabase
    .from("reminders")
    .select("id, type, schedule, next_fire_at")
    .eq("knowledge_item_id", itemId)
    .eq("deactivated_by_trash", true);

  if (fetchError) {
    console.error("[lib/items/reminders] reactivateRemindersForItem lookup failed:", fetchError);
    return;
  }

  const now = new Date();

  for (const reminder of (candidates ?? []) as ItemReminder[]) {
    const stillDue = reminder.type === "one_time"
      ? reminder.next_fire_at !== null && new Date(reminder.next_fire_at) > now
      : true;

    const nextFireAt = stillDue && reminder.type !== "one_time"
      ? computeNextFireAt(reminder.type, reminder.schedule, now)
      : reminder.next_fire_at
        ? new Date(reminder.next_fire_at)
        : null;

    const { error: updateError } = await supabase
      .from("reminders")
      .update({
        deactivated_by_trash: false,
        ...(stillDue && {
          is_active: true,
          next_fire_at: nextFireAt ? nextFireAt.toISOString() : null,
        }),
      })
      .eq("id", reminder.id);

    if (updateError) {
      console.error("[lib/items/reminders] reactivateRemindersForItem update failed:", updateError);
    }
  }
}
