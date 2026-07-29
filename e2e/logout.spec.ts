import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers, verifies via the real Mailpit link (which signs the user in), confirms the
// landing page reflects the signed-in state, then logs out.
test("verified user sees the signed-in landing page and can log out @smoke", async ({ page }) => {
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

  await page.goto("/");
  await expect(page.getByText(new RegExp(`signed in as ${uniqueEmail}`, "i"))).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))).toBe(false);
});
