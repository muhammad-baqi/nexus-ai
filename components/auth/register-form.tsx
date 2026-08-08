"use client";

import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { registerSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";

type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword", string>>;

const FIELD_KEYS = ["email", "password", "confirmPassword"] as const;

// With email confirmation enabled (required by docs/01_MVP/Authentication.md),
// Supabase Auth already returns { error: null } + an obfuscated user object
// for a duplicate, already-confirmed email — no branch needed, it falls
// through to the same "check your email" success path as a real signup. This
// code only fires locally, where supabase/config.toml disables confirmations
// and a duplicate signup returns a real `user_already_exists` error instead.
// Keyed on the typed error code, not `error.message` text, since Supabase
// only contracts the code — message wording isn't a stable API.
const DUPLICATE_EMAIL_ERROR_CODE = "user_already_exists";

// GoTrue returns this same code for two different things, and the client can't tell them apart:
// (1) the per-address `max_frequency` resend cooldown (60s, supabase/config.toml) — reached when
// someone re-submits registration for an email they (or an earlier attempt) already just signed
// up with moments ago, confirmed live as an AuthApiError "For security purposes, you can only
// request this after N seconds"; and (2) `[auth.rate_limit] email_sent`, a project-wide hourly
// send quota that (per config.toml's own comment) only applies once custom SMTP is configured —
// this repo hasn't wired up Resend yet (`.claude/docs/infrastructure.md` — still "needed from Day
// 6"), so staging/prod are still on Supabase's own hosted mailer, which has its own low default
// quota. In case (1) a confirmation email genuinely is already on its way; in case (2) nothing
// was ever sent for this address. Since it can't be distinguished here, the UI below must not
// claim with certainty that an email exists — before this was special-cased at all, it fell
// through to the generic error branch ("Something went wrong creating your account"), which is
// case (1)'s bug (masks a real pending email) but was at least not case (2)'s risk (falsely
// promising one). Worth confirming staging/prod's actual Supabase Auth email quota before relying
// on this further.
const RATE_LIMIT_ERROR_CODE = "over_email_send_rate_limit";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [wasRateLimited, setWasRateLimited] = useState(false);

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
    setWasRateLimited(false);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email: trimmedEmail, password });

    if (
      error &&
      error.code !== DUPLICATE_EMAIL_ERROR_CODE &&
      error.code !== RATE_LIMIT_ERROR_CODE
    ) {
      console.error("[register] signUp failed:", error);
      setStatus("error");
      return;
    }

    if (error?.code === DUPLICATE_EMAIL_ERROR_CODE) {
      console.warn("[register] signUp reported a duplicate email — showing success anyway per the no-enumeration requirement:", error);
    }

    if (error?.code === RATE_LIMIT_ERROR_CODE) {
      console.warn("[register] signUp rate-limited (per-address resend cooldown or project-wide send quota — can't distinguish client-side):", error);
      setWasRateLimited(true);
    }

    setEmail(trimmedEmail);
    setStatus("submitted");
  }

  if (status === "submitted") {
    return (
      <div className="flex flex-col gap-2" role="status">
        <h1 className="text-xl font-semibold">Check your email</h1>
        {wasRateLimited ? (
          <p className="text-muted-foreground text-sm">
            You already requested one recently, so we can&apos;t confirm a brand-new email just
            went out for {email} — check your inbox (and spam folder) for one from moments ago.
            If you don&apos;t see it, wait a bit and use the button below.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            We&apos;ve sent a verification link to {email}. Click it to activate your account —
            you&apos;ll be signed in automatically.
          </p>
        )}

        <ResendVerificationButton email={email} />
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
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" role="alert" className="text-destructive text-sm">
            {fieldErrors.email}
          </p>
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
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
        />
        <p className="text-muted-foreground text-sm">
          At least 8 characters, with at least one letter and one number.
        </p>
        {fieldErrors.password && (
          <p id="password-error" role="alert" className="text-destructive text-sm">
            {fieldErrors.password}
          </p>
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
          aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
        />
        {fieldErrors.confirmPassword && (
          <p id="confirmPassword-error" role="alert" className="text-destructive text-sm">
            {fieldErrors.confirmPassword}
          </p>
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
