"use client";

import { useEffect, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { registerSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword", string>>;

const FIELD_KEYS = ["email", "password", "confirmPassword"] as const;

// docs/01_MVP/Authentication.md: verification-email requests are rate-limited to
// no more than one per 60 seconds per email.
const RESEND_COOLDOWN_SECONDS = 60;

// GoTrue's code when max_frequency is hit — shown distinctly from a generic failure
// since it's an expected, not-broken outcome (see Authentication.md's Error States).
const RESEND_RATE_LIMIT_ERROR_CODE = "over_email_send_rate_limit";

type ResendStatus = "idle" | "sending" | "error" | "rate-limited";

// With email confirmation enabled (required by docs/01_MVP/Authentication.md),
// Supabase Auth already returns { error: null } + an obfuscated user object
// for a duplicate, already-confirmed email — no branch needed, it falls
// through to the same "check your email" success path as a real signup. This
// code only fires locally, where supabase/config.toml disables confirmations
// and a duplicate signup returns a real `user_already_exists` error instead.
// Keyed on the typed error code, not `error.message` text, since Supabase
// only contracts the code — message wording isn't a stable API.
const DUPLICATE_EMAIL_ERROR_CODE = "user_already_exists";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  async function handleResend() {
    setResendStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });

    if (error) {
      console.error("[register] resend failed:", error);
      const isRateLimited = error.code === RESEND_RATE_LIMIT_ERROR_CODE;
      setResendStatus(isRateLimited ? "rate-limited" : "error");
      // Rate-limited means Supabase is already refusing to send — hold the button so the
      // user doesn't immediately retry into the same wall. A genuine failure didn't consume
      // anything, so let them retry right away.
      if (isRateLimited) setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
      return;
    }

    setResendStatus("idle");
    setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const result = registerSchema.safeParse({
      email: trimmedEmail,
      password,
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
    const { error } = await supabase.auth.signUp({ email: trimmedEmail, password });

    if (error && error.code !== DUPLICATE_EMAIL_ERROR_CODE) {
      console.error("[register] signUp failed:", error);
      setStatus("error");
      return;
    }

    if (error) {
      console.warn("[register] signUp reported a duplicate email — showing success anyway per the no-enumeration requirement:", error);
    }

    setEmail(trimmedEmail);
    setStatus("submitted");
  }

  if (status === "submitted") {
    const resendDisabled = resendStatus === "sending" || cooldownSeconds > 0;
    const resendLabel =
      resendStatus === "sending"
        ? "Sending..."
        : cooldownSeconds > 0
          ? `Resend email (${cooldownSeconds}s)`
          : "Resend email";

    return (
      <div className="flex flex-col gap-2" role="status">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-muted-foreground text-sm">
          We&apos;ve sent a verification link to {email}. Click it to activate your account —
          you&apos;ll be signed in automatically.
        </p>

        {resendStatus === "rate-limited" && (
          <p className="text-muted-foreground text-sm" role="alert">
            You&apos;ve requested this recently — please wait a bit before trying again.
          </p>
        )}
        {resendStatus === "error" && (
          <p className="text-destructive text-sm" role="alert">
            Couldn&apos;t resend the email. Please try again.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={resendDisabled}
          onClick={handleResend}
        >
          {resendLabel}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Create your account</h1>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!fieldErrors.email}
        />
        {fieldErrors.email && (
          <p className="text-destructive text-sm">{fieldErrors.email}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
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
        <Label htmlFor="confirmPassword">Confirm password</Label>
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
          Something went wrong creating your account. Please try again.
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
