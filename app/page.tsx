import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Nexus",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The nav + Dashboard shell (app/(app)/layout.tsx, app/(app)/dashboard/page.tsx) fully
  // supersede the ad hoc "Signed in as {email}" block this page used to show once logged in.
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-2" role="status">
        <h1 className="text-xl font-semibold">Nexus</h1>
        <p className="text-muted-foreground text-sm">
          Your personal knowledge hub — save anything, find it again.
        </p>
        <div className="flex gap-4 text-sm font-medium">
          <Link href="/login" className="underline">
            Log in
          </Link>
          <Link href="/register" className="underline">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
