"use client";

import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { changePasswordSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldErrors = Partial<
  Record<"currentPassword" | "newPassword" | "confirmPassword", string>
>;

const FIELD_KEYS = ["currentPassword", "newPassword", "confirmPassword"] as const;

const INVALID_CREDENTIALS_ERROR_CODE = "invalid_credentials";

type Status = "idle" | "submitting" | "success" | "wrong-current-password" | "error";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      console.error("[change-password] no authenticated user found");
      setStatus("error");
      return;
    }

    // docs/01_MVP/Authentication.md requires the current password, not just the active session,
    // before allowing a change — re-verify it the same way Login does.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: result.data.currentPassword,
    });

    if (reauthError) {
      console.error("[change-password] current-password re-verification failed:", reauthError);
      setStatus(
        reauthError.code === INVALID_CREDENTIALS_ERROR_CODE ? "wrong-current-password" : "error",
      );
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: result.data.newPassword,
    });

    if (updateError) {
      console.error("[change-password] updateUser failed:", updateError);
      setStatus("error");
      return;
    }

    // Other sessions end; this tab's session is intentionally left alone — distinct from the
    // emailed Password Reset flow, which invalidates every session including its own.
    const { error: signOutOthersError } = await supabase.auth.signOut({ scope: "others" });
    if (signOutOthersError) {
      console.error("[change-password] signOut(others) failed:", signOutOthersError);
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStatus("success");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Change password</h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          aria-invalid={!!fieldErrors.currentPassword}
          aria-describedby={fieldErrors.currentPassword ? "currentPassword-error" : undefined}
        />
        {fieldErrors.currentPassword && (
          <p id="currentPassword-error" role="alert" className="text-destructive text-sm">
            {fieldErrors.currentPassword}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-invalid={!!fieldErrors.newPassword}
          aria-describedby={fieldErrors.newPassword ? "newPassword-error" : undefined}
        />
        <p className="text-muted-foreground text-sm">
          At least 8 characters, with at least one letter and one number.
        </p>
        {fieldErrors.newPassword && (
          <p id="newPassword-error" role="alert" className="text-destructive text-sm">
            {fieldErrors.newPassword}
          </p>
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
          aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
        />
        {fieldErrors.confirmPassword && (
          <p id="confirmPassword-error" role="alert" className="text-destructive text-sm">
            {fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      {status === "wrong-current-password" && (
        <p className="text-destructive text-sm" role="alert">
          Your current password is incorrect.
        </p>
      )}
      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong changing your password. Please try again.
        </p>
      )}
      {status === "success" && (
        <p className="text-sm" role="status">
          Password changed. Your other signed-in sessions have been logged out.
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Saving..." : "Change password"}
      </Button>
    </form>
  );
}
