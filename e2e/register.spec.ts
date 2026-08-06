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

test("re-submitting registration for the same unconfirmed email within the resend cooldown still shows check-your-email @smoke", async ({
  page,
}) => {
  // Regression test for a real user-reported bug: re-registering an email that just signed up
  // moments ago hits Supabase's 60s resend cooldown (`over_email_send_rate_limit`), which used
  // to fall through to a generic "Something went wrong" error even though a valid confirmation
  // email from the first attempt already existed.
  const uniqueEmail = `e2e-register-cooldown-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Check your email")).toBeVisible();
  await expect(page.getByText(/already requested one recently/i)).toBeVisible();
  await expect(page.getByText(/we've sent a verification link/i)).not.toBeVisible();
  await expect(page.getByText(/went wrong creating your account/i)).not.toBeVisible();
});
