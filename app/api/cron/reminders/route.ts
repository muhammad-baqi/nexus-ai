import { NextResponse, type NextRequest } from "next/server";

import { sendReminderEmail } from "@/lib/email/send-reminder-email";
import { computeNextFireAt, type ReminderSchedule, type ReminderType } from "@/lib/reminders/recurrence";
import { createAdminClient } from "@/lib/supabase/admin";

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // Notifications.md's Missed Reminders section.
const MAX_FAILURES = 5;
// A claim older than this is treated as abandoned (the request that made it crashed/timed out
// before resolving it) and up for re-claiming, rather than leaving the reminder stuck forever.
const STALE_CLAIM_MS = 5 * 60 * 1000;

type DueReminderRow = {
  id: string;
  type: ReminderType;
  schedule: ReminderSchedule;
  next_fire_at: string;
  failure_count: number;
  knowledge_items: {
    id: string;
    title: string;
    description: string | null;
    owner_id: string;
  };
};

type AdminClient = ReturnType<typeof createAdminClient>;
type OwnerInfo = { email: string | null; notificationsEnabled: boolean };

// "Advance/deactivate" — applied whenever a due reminder has been resolved for this occurrence,
// whether that meant an actual send, a toggle-off skip, or a too-late "missed" log. `one_time`
// has no next occurrence and simply deactivates; recurring types chain forward from the
// occurrence that was just resolved (not from "now"), so a daily reminder stays anchored to its
// original time-of-day rather than drifting to whenever the cron happened to run.
function resolvedUpdate(
  reminder: DueReminderRow,
): { is_active: boolean; next_fire_at: string | null; claimed_at: null } {
  if (reminder.type === "one_time") {
    return { is_active: false, next_fire_at: reminder.next_fire_at, claimed_at: null };
  }
  const next = computeNextFireAt(reminder.type, reminder.schedule, new Date(reminder.next_fire_at));
  return { is_active: true, next_fire_at: next ? next.toISOString() : null, claimed_at: null };
}

async function loadOwnerInfo(supabase: AdminClient, ownerIds: string[]): Promise<Map<string, OwnerInfo>> {
  const ownerInfo = new Map<string, OwnerInfo>();

  await Promise.all(
    ownerIds.map(async (ownerId) => {
      try {
        const [{ data: userData, error: userError }, { data: profile, error: profileError }] = await Promise.all([
          supabase.auth.admin.getUserById(ownerId),
          supabase.from("profiles").select("notification_email_enabled").eq("id", ownerId).single(),
        ]);
        if (userError) console.error(`[api/cron/reminders] getUserById failed for ${ownerId}:`, userError);
        if (profileError) console.error(`[api/cron/reminders] profile lookup failed for ${ownerId}:`, profileError);
        ownerInfo.set(ownerId, {
          email: userData?.user?.email ?? null,
          notificationsEnabled: profile?.notification_email_enabled ?? true,
        });
      } catch (error) {
        console.error(`[api/cron/reminders] owner lookup failed for ${ownerId}:`, error);
        ownerInfo.set(ownerId, { email: null, notificationsEnabled: false });
      }
    }),
  );

  return ownerInfo;
}

type Outcome = "sent" | "toggle_off" | "missed" | "backoff" | "gave_up" | "no_email";

async function processDueReminder(
  supabase: AdminClient,
  reminder: DueReminderRow,
  now: Date,
  ownerInfo: Map<string, OwnerInfo>,
): Promise<Outcome> {
  const lateness = now.getTime() - new Date(reminder.next_fire_at).getTime();

  if (lateness > GRACE_PERIOD_MS) {
    console.error(
      `[api/cron/reminders] reminder ${reminder.id} missed — ${Math.round(lateness / 3_600_000)}h past due, grace period exceeded.`,
    );
    await supabase.from("reminders").update({ failure_count: 0, ...resolvedUpdate(reminder) }).eq("id", reminder.id);
    return "missed";
  }

  const owner = ownerInfo.get(reminder.knowledge_items.owner_id);

  if (!owner?.notificationsEnabled) {
    // Dashboard remains the fallback delivery surface — the reminder still "fires" for
    // scheduling purposes, it just never sends an email (Notifications.md's Delivery section).
    await supabase.from("reminders").update({ failure_count: 0, ...resolvedUpdate(reminder) }).eq("id", reminder.id);
    return "toggle_off";
  }

  if (!owner.email) {
    console.error(`[api/cron/reminders] no email on file for owner ${reminder.knowledge_items.owner_id}`);
    await supabase.from("reminders").update({ failure_count: 0, ...resolvedUpdate(reminder) }).eq("id", reminder.id);
    return "no_email";
  }

  const { ok } = await sendReminderEmail(owner.email, reminder.knowledge_items);

  if (ok) {
    await supabase
      .from("reminders")
      .update({ failure_count: 0, last_fired_at: now.toISOString(), ...resolvedUpdate(reminder) })
      .eq("id", reminder.id);
    return "sent";
  }

  const failureCount = reminder.failure_count + 1;

  if (failureCount >= MAX_FAILURES) {
    console.error(`[api/cron/reminders] reminder ${reminder.id} gave up after ${failureCount} consecutive failures.`);
    await supabase.from("reminders").update({ failure_count: 0, ...resolvedUpdate(reminder) }).eq("id", reminder.id);
    return "gave_up";
  }

  // Backoff: only failure_count is bumped — next_fire_at stays anchored at the original
  // occurrence (self-review-caught bug, previously fixed here: overwriting next_fire_at with a
  // retry time and later chaining resolvedUpdate() off of it permanently shifted the reminder's
  // schedule by the retry delay). Clearing claimed_at makes this row eligible to be re-claimed
  // and retried on the scheduler's next run — a real backoff given this repo's own documented
  // Vercel Hobby cron-frequency cap (.claude/docs/infrastructure.md), which already spaces
  // invocations out well beyond a naive fixed delay would.
  await supabase
    .from("reminders")
    .update({ failure_count: failureCount, claimed_at: null })
    .eq("id", reminder.id);
  return "backoff";
}

// The reminder scheduler (Notifications.md's Delivery section; .claude/docs/infrastructure.md's
// documented Vercel Cron design). Triggered by Vercel Cron (vercel.json) hitting this route on a
// schedule — protected by a shared secret rather than user auth, since there's no logged-in user
// in a cron-triggered request. Uses the service-role admin client because dispatch is inherently
// cross-user in a single tick, unlike every other route in this app.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const staleClaimBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();

  // Atomic claim: a single UPDATE ... RETURNING (PostgREST issues .update().select() as one SQL
  // statement) rather than a separate SELECT-then-loop-of-UPDATEs. If two invocations of this
  // route overlap — a slow tick still running when the next minute's fires, or a manual trigger
  // racing the scheduled one — Postgres's own row-level locking means only one of them actually
  // matches and claims each row; the other's UPDATE simply affects zero rows for anything already
  // claimed. Self-review caught that the original SELECT-then-process shape had no such guard,
  // allowing the same reminder to be selected and emailed twice.
  // deleted_at isn't filtered here (unlike the old plain SELECT this replaced) — filtering an
  // UPDATE's WHERE clause through an embedded resource isn't a query shape worth relying on
  // sight-unseen against PostgREST's mutation path. It's pure defense-in-depth anyway: trashing
  // an item already sets is_active=false on its reminders (deactivateRemindersForItem), so
  // is_active=true alone already excludes a trashed item's reminders in practice.
  const { data, error } = await supabase
    .from("reminders")
    .update({ claimed_at: now.toISOString() })
    .eq("is_active", true)
    .lte("next_fire_at", now.toISOString())
    .or(`claimed_at.is.null,claimed_at.lt.${staleClaimBefore}`)
    .select(
      "id, type, schedule, next_fire_at, failure_count, knowledge_items!inner(id, title, description, owner_id, deleted_at)",
    );

  if (error) {
    console.error("[api/cron/reminders] due-reminder claim failed:", error);
    return NextResponse.json(
      { error: { code: "query_failed", message: "Failed to load due reminders." } },
      { status: 500 },
    );
  }

  const dueReminders = (data ?? []) as unknown as DueReminderRow[];
  const ownerIds = [...new Set(dueReminders.map((reminder) => reminder.knowledge_items.owner_id))];
  const ownerInfo = await loadOwnerInfo(supabase, ownerIds);

  const outcomes: Record<Outcome | "error", number> = {
    sent: 0,
    toggle_off: 0,
    missed: 0,
    backoff: 0,
    gave_up: 0,
    no_email: 0,
    error: 0,
  };

  // Each reminder is processed independently — one throwing (a DB write failure, an unexpected
  // Resend error) must never block the rest of this tick's batch, which spans every user with a
  // due reminder (Notifications.md's Error States: "does not crash the scheduler job for other
  // users' reminders").
  for (const reminder of dueReminders) {
    try {
      const outcome = await processDueReminder(supabase, reminder, now, ownerInfo);
      outcomes[outcome] += 1;
    } catch (processError) {
      console.error(`[api/cron/reminders] processing reminder ${reminder.id} failed:`, processError);
      outcomes.error += 1;
    }
  }

  return NextResponse.json({ processed: dueReminders.length, ...outcomes });
}
