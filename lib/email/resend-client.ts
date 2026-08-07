import { Resend } from "resend";

// Lazily constructed — `RESEND_API_KEY` is legitimately unset in local dev/tests (see
// send-reminder-email.ts's graceful-degradation note), and the `Resend` constructor doesn't
// validate its key eagerly, so there's nothing gained by constructing this at module load time
// versus on first real use.
let client: Resend | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}
