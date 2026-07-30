import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely, so this must only ever be imported from a
// server-only context (route handlers under app/api/**). NEVER import this from a "use client"
// component or anything that could end up in the browser bundle (CLAUDE.md rule #6); grepped for
// at self-review time. Used only where the anon-key client can't do the job, e.g.
// auth.admin.deleteUser() for account deletion.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
