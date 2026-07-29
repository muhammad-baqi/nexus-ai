"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Status = "idle" | "signing-out" | "error";

export function LogoutButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  async function handleLogout() {
    setStatus("signing-out");

    const supabase = createClient();
    // Explicit even though "global" is the library default — Authentication.md requires the
    // session to be invalidated server-side, not just cleared locally, so this shouldn't
    // silently depend on a default that could change.
    const { error } = await supabase.auth.signOut({ scope: "global" });

    if (error) {
      console.error("[logout] signOut failed:", error);
      setStatus("error");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Couldn&apos;t log you out. Please try again.
        </p>
      )}
      <Button type="button" variant="outline" disabled={status === "signing-out"} onClick={handleLogout}>
        {status === "signing-out" ? "Logging out..." : "Log out"}
      </Button>
    </div>
  );
}
