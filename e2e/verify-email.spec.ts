import { expect, test } from "@playwright/test";

import { fetchConfirmationLink } from "./helpers/mailpit";

// Registers, retrieves the real confirmation email from local Mailpit, and follows the link —
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
