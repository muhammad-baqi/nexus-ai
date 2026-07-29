import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata: Metadata = {
  title: "Nexus",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-2" role="status">
        {user ? (
          <>
            <h1 className="text-xl font-semibold">Signed in as {user.email}</h1>
            <LogoutButton />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
