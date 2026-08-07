import { getResendClient } from "@/lib/email/resend-client";

const EXCERPT_LENGTH = 200;

type ReminderEmailItem = {
  id: string;
  title: string;
  description: string | null;
};

function excerpt(description: string | null): string {
  if (!description) return "";
  return description.length > EXCERPT_LENGTH ? `${description.slice(0, EXCERPT_LENGTH)}…` : description;
}

function itemUrl(itemId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/items/${itemId}`;
}

// item.title/description are user-supplied content reaching this email's HTML body — escape
// before interpolating so a title like `<img src=x onerror=...>` can't inject markup into the
// recipient's email client.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The transactional reminder email (Notifications.md's Delivery section: title, a short
// excerpt/description, a direct link back into Nexus). Never throws — the scheduler
// (app/api/cron/reminders/route.ts) treats a `{ ok: false }` result as a delivery failure to
// retry/back off, same never-throw contract every other background job in this app follows
// (CLAUDE.md rule 7). Missing RESEND_API_KEY is expected in local dev/tests (this repo's Resend
// account isn't wired into every environment) — logged once as a warning rather than crashing the
// scheduler for every user's reminders.
export async function sendReminderEmail(to: string, item: ReminderEmailItem): Promise<{ ok: boolean }> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[sendReminderEmail] RESEND_API_KEY not set — skipping send.");
    return { ok: false };
  }

  const from = process.env.RESEND_FROM;
  if (!from) {
    console.error("[sendReminderEmail] RESEND_FROM not set — skipping send.");
    return { ok: false };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `Reminder: ${item.title}`,
      text: `${item.title}\n\n${excerpt(item.description)}\n\n${itemUrl(item.id)}`,
      html: `<p><strong>${escapeHtml(item.title)}</strong></p><p>${escapeHtml(excerpt(item.description))}</p><p><a href="${itemUrl(item.id)}">Open in Nexus</a></p>`,
    });
    if (error) {
      console.error("[sendReminderEmail] Resend returned an error:", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error("[sendReminderEmail] send failed:", error);
    return { ok: false };
  }
}
