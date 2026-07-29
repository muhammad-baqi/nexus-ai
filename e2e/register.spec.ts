import { expect, test } from "@playwright/test";

test("register shows check-your-email screen @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-register-${Date.now()}@example.com`;

  await page.goto("/register");

  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Check your email")).toBeVisible();
  await expect(page.getByText(uniqueEmail)).toBeVisible();

  // "not logged in yet" per docs/01_MVP/Authentication.md — local dev has
  // email confirmation disabled (supabase/config.toml), so a bug that
  // establishes a session immediately on signUp wouldn't be caught by the
  // screen assertions above; check no Supabase auth cookie was set instead.
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /^sb-.*-auth-token/.test(cookie.name))).toBe(false);
});
