import { expect, test } from "@playwright/test";

import { fetchConfirmationLink } from "./helpers/mailpit";

// Registers, verifies via the real Mailpit link, then logs in — the full happy path across all
// three shipped auth features. Expected to hit the same playwright-in-Docker
// ERR_SSL_PROTOCOL_ERROR blocker noted for e2e/register.spec.ts (PROGRESS.md, Day 2).
test("register, verify, then log in lands on / with a session @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-login-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const confirmationLink = await fetchConfirmationLink(uniqueEmail);
  await page.goto(confirmationLink);
  await expect(page.getByText(/your email is verified/i)).toBeVisible();

  // verifyOtp already signs the user in — sign back out so this test actually exercises
  // the Login form's own submit path, not just an already-authenticated session.
  await page.context().clearCookies();

  await page.goto("/login");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill("abcd1234");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL("/");
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /^sb-.*-auth-token/.test(cookie.name))).toBe(true);
});
