import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers a fresh account, creates a Note, generates a public share link (reading the real
// token/url off the POST response body rather than the clipboard — navigator.clipboard is
// unavailable in this specific insecure-context test harness, same documented limitation as the
// Code Snippets copy-to-clipboard spec), opens that link in a brand-new, fully separate browser
// context (no cookies at all — the real "someone else clicks this link" scenario, stronger than
// just an unauthenticated tab in the same context), confirms the public view renders the item's
// content and nothing else (no nav chrome, no tags/collection/edit controls), then revokes the
// link from the owner's session and confirms the same public URL now shows an error instead.
test("generate a public share link, view it as a logged-out visitor, then revoke it @smoke", async ({
  page,
  browser,
}) => {
  const uniqueEmail = `e2e-sharing-${Date.now()}@example.com`;
  const noteTitle = `Shared note ${Date.now()}`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const confirmationLink = await fetchConfirmationLink(uniqueEmail);
  await followConfirmationLink(page, confirmationLink);
  await expect(page.getByText(/your email is verified/i)).toBeVisible();

  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("button", { name: "New Note" }).click();
  await expect(page).toHaveURL(/\/items\/.+/);

  const patched = page.waitForResponse(
    (res) => res.url().includes("/api/items/") && res.request().method() === "PATCH",
  );
  await page.getByLabel("Title").fill(noteTitle);
  await patched;
  await page.getByLabel("Body").fill("Body content only the owner should be able to edit.");
  await page.getByRole("button", { name: "Done" }).click();

  const shareResponse = page.waitForResponse(
    (res) => res.url().includes("/share") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shareBody: { token: string; url: string } = await (await shareResponse).json();
  expect(shareBody.token).toBeTruthy();
  await expect(page.getByRole("button", { name: "Revoke" })).toBeVisible();

  // itemShareUrl() bakes in NEXT_PUBLIC_APP_URL (http://localhost:3000 locally) — correct for a
  // real host browser, but unreachable from inside the dockerized playwright service the same way
  // the /auth/confirm email link is (see helpers/mailpit.ts's identical note). Take just the path
  // and let it resolve against this run's actual baseURL instead.
  const sharePath = new URL(shareBody.url).pathname;

  // A brand-new, cookie-less browser context — a real stand-in for "someone else opens this
  // link," not just an unauthenticated tab that might still share app state with the owner.
  const visitorContext = await browser.newContext();
  const visitorPage = await visitorContext.newPage();
  await visitorPage.goto(sharePath);

  await expect(visitorPage.getByRole("heading", { name: noteTitle })).toBeVisible();
  await expect(visitorPage.getByText("Body content only the owner should be able to edit.")).toBeVisible();
  // Public share page has no app nav/chrome and none of the owner-only controls.
  await expect(visitorPage.getByRole("link", { name: "Dashboard" })).not.toBeVisible();
  await expect(visitorPage.getByRole("button", { name: "Edit" })).not.toBeVisible();
  await expect(visitorPage.getByRole("button", { name: "Move to Trash" })).not.toBeVisible();

  // Revoke from the owner's session.
  const revokeResponse = page.waitForResponse(
    (res) => res.url().includes("/share") && res.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "Revoke" }).click();
  await revokeResponse;
  await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible();

  // The same link a visitor already had open (or reloads) now 404s instead of showing content.
  await visitorPage.reload();
  await expect(visitorPage.getByRole("heading", { name: noteTitle })).not.toBeVisible();
  await expect(visitorPage.getByText(/invalid|revoked|no longer available/i)).toBeVisible();

  await visitorContext.close();
});
