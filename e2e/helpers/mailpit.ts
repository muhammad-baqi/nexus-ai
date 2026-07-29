import type { Page } from "@playwright/test";

// The Supabase CLI's local stack (and its Mailpit mail catcher) runs on the host, not in the
// docker-compose network — reachable as 127.0.0.1 from a host-run Playwright, but only via
// host.docker.internal from inside the playwright Docker service (see docker-compose.yml,
// which sets MAILPIT_URL accordingly for that service).
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitMessageSummary {
  ID: string;
  Created: string;
  To: { Address: string }[];
}

// Fetches the most recent message sent to `email` from the local Supabase stack's mail catcher
// (Mailpit — supabase/config.toml still calls it "Inbucket" for backward compat, but the actual
// API is Mailpit's: /api/v1/messages + /api/v1/message/{ID}, confirmed live against the running
// stack) and extracts the /auth/confirm link's path + query, ready to pass straight to
// page.goto(). Returning a path rather than the email's absolute URL matters here: the link
// always uses Supabase's configured site_url (http://127.0.0.1:3000, correct for a real host
// browser), but a host-run Playwright and the dockerized playwright service resolve that
// differently — and rewriting site_url itself would break the real dev flow it's meant for. A
// relative path instead resolves against whatever baseURL Playwright is actually using.
export async function fetchConfirmationLink(email: string): Promise<string> {
  const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`);
  const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
  // Sorted explicitly by Created rather than trusting the API's return order — an address can
  // end up with more than one message (e.g. a resend), and picking the wrong one fails silently.
  const latest = messages
    .filter((m) => m.To.some((to) => to.Address === email))
    .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime())[0];
  if (!latest) throw new Error(`No message found for ${email}`);

  const messageRes = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
  const message = (await messageRes.json()) as { Text: string };

  const match = /(http:\/\/[^\s"]+\/auth\/confirm\?[^\s"]+)/.exec(message.Text);
  if (!match) throw new Error("No /auth/confirm link found in the confirmation email");
  const url = new URL(match[1]);
  return url.pathname + url.search;
}

// Hits the /auth/confirm link via the browser context's own request API (which shares its
// cookie jar with `page` — the session cookie verifyOtp sets lands in the same place a real
// navigation would put it) rather than page.goto(), and follows the resulting redirect
// ourselves. Two reasons this route exists instead of a plain page.goto():
// 1. The redirect's Location always uses NEXT_PUBLIC_APP_URL (http://localhost:3000 locally) —
//    confirmed live that Next's dev server doesn't vary this per the request's actual Host, so
//    it's not something the app itself can branch on. That's correct for a host-run browser but
//    unreachable from inside the dockerized playwright service, which reaches this same server
//    via host.docker.internal.
// 2. Rewriting that hop via page.route() doesn't work: confirmed live (even with a catch-all
//    `**/*` route) that Playwright/Chromium never surfaces a cross-origin *navigation* redirect
//    to route interception at all — apparently a site-isolation-related gap, not something this
//    app's code can influence.
// Making the request directly and re-navigating to a same-origin path sidesteps both.
export async function followConfirmationLink(page: Page, confirmationPath: string) {
  const response = await page.request.get(confirmationPath, { maxRedirects: 0 });
  const location = response.headers()["location"];
  if (!location) throw new Error(`Expected a redirect from ${confirmationPath}, got none`);
  const { pathname, search } = new URL(location);
  await page.goto(pathname + search);
}
