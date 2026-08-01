import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers, verifies via the real Mailpit link, then logs in — the full happy path across all
// three shipped auth features.
test("register, verify, then log in lands on /dashboard with a session @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-login-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const confirmationLink = await fetchConfirmationLink(uniqueEmail);
  await followConfirmationLink(page, confirmationLink);
  await expect(page.getByText(/your email is verified/i)).toBeVisible();

  // verifyOtp already signs the user in — sign back out so this test actually exercises
  // the Login form's own submit path, not just an already-authenticated session.
  await page.context().clearCookies();

  await page.goto("/login");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("abcd1234");
  await page.getByRole("button", { name: "Log in" }).click();

  // app/page.tsx redirects a signed-in visitor straight to /dashboard (App nav/Dashboard shell).
  await expect(page).toHaveURL("/dashboard");
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))).toBe(true);
});
