import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// example.com (IANA-reserved, RFC 2606) is used as the one real reachable URL here rather than a
// live third-party site — stable, always up, minimal enough not to make this test flaky, and its
// title ("Example Domain") is distinctive enough to assert on. A `.invalid` TLD (also RFC 2606,
// guaranteed to never resolve) stands in for the unreachable-site case, rather than relying on a
// real domain being down.
const REACHABLE_URL = "https://example.com/";
const UNREACHABLE_URL = "https://this-domain-should-not-exist-nexus-e2e.invalid/";

// Registers and verifies a fresh account, opens the default "Inbox" collection, then exercises
// the three Website_Bookmarks.md scenarios in one session (one register/verify cycle, the
// expensive part, shared across all three — same bundling rationale notes.spec.ts already uses):
// 1. Save a real URL — visible immediately, metadata fills in without a manual refresh, edit the
//    title, and confirm it persists through a reload.
// 2. Save an unreachable URL — still saves, shows "Metadata unavailable", Retry re-fetches.
// 3. Save a URL that duplicates (1)'s bookmark — non-blocking duplicate prompt, "View existing"
//    navigates to the original.
test("save a bookmark, watch metadata fill in, retry a failed fetch, and see the duplicate prompt @smoke", async ({
  page,
}) => {
  const uniqueEmail = `e2e-bookmarks-${Date.now()}@example.com`;

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
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

  // 1. Reachable URL: immediate save, metadata fills in live, edit, persists on reload.
  await page.getByRole("button", { name: "Save Bookmark" }).click();
  await page.getByLabel("URL").fill(REACHABLE_URL);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Navigation to the new item happens synchronously on save — proving the create request never
  // waited on the metadata fetch — without asserting on the raw-URL-as-title transient state
  // itself, which example.com's fast response can resolve well inside a single assertion's
  // polling window and make this a race rather than a real check.
  await expect(page).toHaveURL(/\/items\/.+/);

  // Metadata fills in on its own — no reload — via BookmarkView's own poll.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Example Domain", {
    timeout: 15_000,
  });
  await expect(page.getByText("example.com")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("My saved example page");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("My saved example page");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("My saved example page");

  // 2. Unreachable URL: still saves, shows "Metadata unavailable", Retry re-fetches (and fails
  // again the same way, since the URL is still unreachable — proves Retry actually re-triggers
  // the job rather than being a no-op).
  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("button", { name: "Save Bookmark" }).click();
  await page.getByLabel("URL").fill(UNREACHABLE_URL);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/.+/);

  await expect(page.getByText("Metadata unavailable")).toBeVisible({ timeout: 15_000 });

  // Proves Retry actually re-triggers the job (not a no-op) via the real round trip — not by
  // catching the "Fetching metadata…" transient state, which an unreachable .invalid domain's
  // fast DNS failure can resolve well inside a single assertion's polling window.
  const retryResponse = page.waitForResponse(
    (res) => res.url().includes("/metadata/retry") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Retry" }).click();
  await retryResponse;
  await expect(page.getByText("Metadata unavailable")).toBeVisible({ timeout: 15_000 });

  // 3. Duplicate: saving the same reachable URL again (already saved in step 1) prompts instead
  // of silently creating a second item; "View existing" navigates to the original.
  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("button", { name: "Save Bookmark" }).click();
  await page.getByLabel("URL").fill(REACHABLE_URL);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(/you already saved this/i)).toBeVisible();
  await page.getByRole("button", { name: "View existing" }).click();
  await expect(page).toHaveURL(/\/items\/.+/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("My saved example page");
});
