"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldErrors = Partial<Record<"password" | "confirmPassword", string>>;

const FIELD_KEYS = ["password", "confirmPassword"] as const;

type Status = "idle" | "submitting" | "error";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && FIELD_KEYS.includes(key as (typeof FIELD_KEYS)[number])) {
          const fieldKey = key as keyof FieldErrors;
          if (!errors[fieldKey]) errors[fieldKey] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setStatus("submitting");

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: result.data.password,
    });

    if (updateError) {
      console.error("[reset-password] updateUser failed:", updateError);
      setStatus("error");
      return;
    }

    // docs/01_MVP/Authentication.md: setting a new password invalidates every existing
    // session — including the recovery session /auth/confirm just established — requiring a
    // fresh login. Distinct from Change Password, which only signs out *other* sessions.
    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError) {
      console.error("[reset-password] signOut after password reset failed:", signOutError);
    }

    router.push("/login?reset=success");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Set a new password</h1>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!fieldErrors.password}
        />
        <p className="text-muted-foreground text-sm">
          At least 8 characters, with at least one letter and one number.
        </p>
        {fieldErrors.password && (
          <p className="text-destructive text-sm">{fieldErrors.password}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={!!fieldErrors.confirmPassword}
        />
        {fieldErrors.confirmPassword && (
          <p className="text-destructive text-sm">{fieldErrors.confirmPassword}</p>
        )}
      </div>

      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong setting your new password. Please try again, or request a new
          reset link.
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Saving..." : "Set new password"}
      </Button>
    </form>
  );
}
