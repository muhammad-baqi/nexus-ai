import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Gates every route under this group behind an authenticated session — Settings, Collections,
// and Dashboard all slot in here instead of each re-implementing the same check. proxy.ts only
// refreshes the session token; this is the actual redirect-if-signed-out boundary (RLS is still
// the data-access boundary underneath, per CLAUDE.md rule #1).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return children;
}
