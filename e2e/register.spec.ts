import { expect, test } from "@playwright/test";

test("register shows check-your-email screen @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-register-${Date.now()}@example.com`;

  await page.goto("/register");

  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Check your email")).toBeVisible();
  await expect(page.getByText(uniqueEmail)).toBeVisible();

  // "not logged in yet" per docs/01_MVP/Authentication.md — signUp() alone (before the
  // confirmation link is clicked) must not establish a session, so a regression there
  // wouldn't be caught by the screen assertions above; check directly instead. The regex
  // excludes the PKCE "-auth-token-code-verifier" cookie, which signUp() does set (needed
  // later to complete the /auth/confirm exchange) and isn't a real session.
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))).toBe(false);
});
