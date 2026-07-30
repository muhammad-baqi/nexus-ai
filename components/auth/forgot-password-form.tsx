"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// GoTrue's code when max_frequency is hit — same as the resend-verification flow. Unlike
// components/auth/resend-verification-button.tsx, this form has no persistent button to disable
// through a countdown — a rate-limited request lands on the same terminal "check your email"
// screen as a real success (docs/01_MVP/Authentication.md's no-enumeration requirement), so
// there's nothing left on screen to re-click until the user starts over from /forgot-password.
const RATE_LIMIT_ERROR_CODE = "over_email_send_rate_limit";

type Status = "idle" | "submitting" | "submitted" | "rate-limited" | "error";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const result = forgotPasswordSchema.safeParse({ email: trimmedEmail });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message);
      return;
    }

    setFieldError(undefined);
    setStatus("submitting");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });

    if (error) {
      console.error("[forgot-password] resetPasswordForEmail failed:", error);
      // docs/01_MVP/Authentication.md: whether the email exists is never revealed, so a real
      // rate-limit is the only failure worth distinguishing from the generic success message.
      setStatus(error.code === RATE_LIMIT_ERROR_CODE ? "rate-limited" : "error");
      return;
    }

    setEmail(trimmedEmail);
    setStatus("submitted");
  }

  if (status === "submitted" || status === "rate-limited") {
    return (
      <div className="flex flex-col gap-2" role="status">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-muted-foreground text-sm">
          If an account exists for {email}, we&apos;ve sent a link to reset your password.
        </p>
        {status === "rate-limited" && (
          <p className="text-muted-foreground text-sm">
            If you already requested one recently, please wait a bit before trying again.
          </p>
        )}
        <Link href="/login" className="text-sm font-medium underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="text-muted-foreground text-sm">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!fieldError}
        />
        {fieldError && <p className="text-destructive text-sm">{fieldError}</p>}
      </div>

      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong sending the reset email. Please try again.
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending..." : "Send reset link"}
      </Button>

      <Link href="/login" className="text-sm font-medium underline">
        Back to log in
      </Link>
    </form>
  );
}
