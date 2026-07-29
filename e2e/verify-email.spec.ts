import { expect, test } from "@playwright/test";

const INBUCKET_URL = "http://127.0.0.1:54324";

async function fetchConfirmationLink(email: string): Promise<string> {
  const mailboxRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(email)}`);
  const messages = await mailboxRes.json();
  const latest = messages.at(-1);

  const messageRes = await fetch(
    `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(email)}/${latest.id}`,
  );
  const message = await messageRes.json();

  const match = /(http:\/\/[^\s"]+\/auth\/confirm\?[^\s"]+)/.exec(message.body.text);
  if (!match) throw new Error("No /auth/confirm link found in the confirmation email");
  return match[1];
}

// Registers, retrieves the real confirmation email from local Inbucket, and follows the link —
// proving the full register -> verify round trip, not just the two halves in isolation.
// Expected to hit the same playwright-in-Docker ERR_SSL_PROTOCOL_ERROR blocker noted for
// e2e/register.spec.ts (PROGRESS.md, Day 2) until that infra issue is resolved.
test("register then follow the emailed confirmation link lands on the verified page @smoke", async ({
  page,
}) => {
  const uniqueEmail = `e2e-verify-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const confirmationLink = await fetchConfirmationLink(uniqueEmail);
  await page.goto(confirmationLink);

  await expect(page.getByText(/your email is verified/i)).toBeVisible();
});
