import type { createClient } from "@/lib/supabase/server";

export type ActivityAction = "created" | "edited" | "deleted" | "restored" | "shared";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type LogActivityInput = {
  ownerId: string;
  action: ActivityAction;
  knowledgeItemId?: string;
  collectionId?: string;
};

// Best-effort, never throws (CLAUDE.md rule 7) — a failed activity-log write must never break
// the real mutation it's attached to. Called from the success path of every create/edit/delete/
// restore/share route, per Database_Schema.md's activity_log table.
export async function logActivity(supabase: SupabaseClient, input: LogActivityInput): Promise<void> {
  const { error } = await supabase.from("activity_log").insert({
    owner_id: input.ownerId,
    action: input.action,
    knowledge_item_id: input.knowledgeItemId ?? null,
    collection_id: input.collectionId ?? null,
  });

  if (error) {
    console.error("[lib/activity/log-activity] insert failed:", error);
  }
}
