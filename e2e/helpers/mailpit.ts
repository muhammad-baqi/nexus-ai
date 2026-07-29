const MAILPIT_URL = "http://127.0.0.1:54324";

interface MailpitMessageSummary {
  ID: string;
  Created: string;
  To: { Address: string }[];
}

// Fetches the most recent message sent to `email` from the local Supabase stack's mail catcher
// (Mailpit — supabase/config.toml still calls it "Inbucket" for backward compat, but the actual
// API is Mailpit's: /api/v1/messages + /api/v1/message/{ID}, confirmed live against the running
// stack) and extracts the first /auth/confirm link found in its body. Shared by any e2e spec
// that needs to complete a real registration → verification round trip.
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
  return match[1];
}
