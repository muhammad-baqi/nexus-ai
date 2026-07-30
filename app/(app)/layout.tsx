import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/layout/app-nav";
import { ThemeSync } from "@/components/theme/theme-sync";

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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("theme_preference")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("[app-layout] fetching theme_preference failed:", error);
  }

  return (
    <>
      {/* Only sync when we actually know the account's preference — a transient fetch error
          must never overwrite the user's local theme choice with a wrong default. */}
      {!error && profile && <ThemeSync preference={profile.theme_preference} />}
      <AppNav />
      {children}
    </>
  );
}
