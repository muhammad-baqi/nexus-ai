"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { deleteAccountSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "idle" | "submitting" | "wrong-password" | "error";

export function DeleteAccountForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = deleteAccountSchema.safeParse({ password });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message);
      return;
    }

    setFieldError(undefined);
    setStatus("submitting");

    const response = await fetch("/api/auth/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      console.error("[delete-account] deletion failed:", body);
      setStatus(response.status === 401 ? "wrong-password" : "error");
      return;
    }

    // The account row is already gone server-side; this just clears the local session so the
    // browser doesn't hold onto a token for a user that no longer exists.
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-destructive">Delete account</h2>
      <p className="text-muted-foreground text-sm">
        This permanently deletes your account and every Collection and Knowledge Item you own.
        This action cannot be undone.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="deleteAccountPassword">Confirm your password</Label>
        <Input
          id="deleteAccountPassword"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!fieldError}
        />
        {fieldError && <p className="text-destructive text-sm">{fieldError}</p>}
      </div>

      {status === "wrong-password" && (
        <p className="text-destructive text-sm" role="alert">
          Incorrect password.
        </p>
      )}
      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong deleting your account. Please try again.
        </p>
      )}

      <Button type="submit" variant="destructive" disabled={status === "submitting"}>
        {status === "submitting" ? "Deleting..." : "Permanently delete my account"}
      </Button>
    </form>
  );
}
