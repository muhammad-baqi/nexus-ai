"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// docs/01_MVP/Authentication.md: verification-email requests are rate-limited to
// no more than one per 60 seconds per email.
const RESEND_COOLDOWN_SECONDS = 60;

// GoTrue's code when max_frequency is hit — shown distinctly from a generic failure
// since it's an expected, not-broken outcome (see Authentication.md's Error States).
const RESEND_RATE_LIMIT_ERROR_CODE = "over_email_send_rate_limit";

type ResendStatus = "idle" | "sending" | "error" | "rate-limited";

export function ResendVerificationButton({ email }: { email: string }) {
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
      console.error("[resend-verification] resend failed:", error);
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

  const resendDisabled = resendStatus === "sending" || cooldownSeconds > 0;
  const resendLabel =
    resendStatus === "sending"
      ? "Sending..."
      : cooldownSeconds > 0
        ? `Resend email (${cooldownSeconds}s)`
        : "Resend email";

  return (
    <div className="flex flex-col gap-2">
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

      <Button type="button" variant="outline" disabled={resendDisabled} onClick={handleResend}>
        {resendLabel}
      </Button>
    </div>
  );
}
