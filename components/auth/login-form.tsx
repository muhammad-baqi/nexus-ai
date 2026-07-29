"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";

type FieldErrors = Partial<Record<"email" | "password", string>>;

const FIELD_KEYS = ["email", "password"] as const;

// docs/01_MVP/Authentication.md: never reveal whether the email exists or the
// password was wrong — Supabase already returns this same code for both cases.
const INVALID_CREDENTIALS_ERROR_CODE = "invalid_credentials";

// Distinct from invalid_credentials — the account exists and the password is
// right, it just hasn't confirmed its email yet. Gets its own resend prompt.
const EMAIL_NOT_CONFIRMED_ERROR_CODE = "email_not_confirmed";

type Status = "idle" | "submitting" | "invalid-credentials" | "server-error" | "unverified";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const result = loginSchema.safeParse({ email: trimmedEmail, password });
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
    const { error } = await supabase.auth.signInWithPassword(result.data);

    if (error) {
      console.error("[login] signInWithPassword failed:", error);
      setEmail(trimmedEmail);
      if (error.code === EMAIL_NOT_CONFIRMED_ERROR_CODE) {
        setStatus("unverified");
      } else if (error.code === INVALID_CREDENTIALS_ERROR_CODE) {
        setStatus("invalid-credentials");
      } else {
        setStatus("server-error");
      }
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (status === "unverified") {
    return (
      <div className="flex flex-col gap-2" role="status">
        <h1 className="text-xl font-semibold">Verify your email first</h1>
        <p className="text-muted-foreground text-sm">
          {email} hasn&apos;t been verified yet. Check your inbox for the link, or request a new
          one.
        </p>

        <ResendVerificationButton email={email} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Log in</h1>

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
        {fieldErrors.email && <p className="text-destructive text-sm">{fieldErrors.email}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!fieldErrors.password}
        />
        {fieldErrors.password && (
          <p className="text-destructive text-sm">{fieldErrors.password}</p>
        )}
      </div>

      {status === "invalid-credentials" && (
        <p className="text-destructive text-sm" role="alert">
          Invalid email or password.
        </p>
      )}
      {status === "server-error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong signing you in. Please try again.
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Logging in..." : "Log in"}
      </Button>
    </form>
  );
}
