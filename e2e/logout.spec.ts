import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers, verifies via the real Mailpit link (which signs the user in), confirms the
// signed-in visitor lands on the Dashboard, then logs out.
test("verified user is redirected to the Dashboard and can log out @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-logout-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const confirmationLink = await fetchConfirmationLink(uniqueEmail);
  await followConfirmationLink(page, confirmationLink);
  await expect(page.getByText(/your email is verified/i)).toBeVisible();

  // app/page.tsx redirects a signed-in visitor straight to /dashboard (App nav/Dashboard shell)
  // instead of the old ad hoc "Signed in as {email}" block.
  await page.goto("/");
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))).toBe(false);
});
