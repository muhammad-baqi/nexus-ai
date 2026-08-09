import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers a fresh account, creates a note (logs "created"), edits its title via autosave (logs
// "edited"), trashes it (logs "deleted"), then restores it (logs "restored") — confirms
// /activity lists all four, newest-first, each linking back to the real item by its current
// title (log-activity.ts / GET /api/activity, build-order-complete.md #27).
test("create, edit, trash, and restore a note, then confirm each event appears on /activity @smoke", async ({
  page,
}) => {
  const uniqueEmail = `e2e-activity-${Date.now()}@example.com`;
  const noteTitle = `Activity check ${Date.now()}`;

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
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/collections\/.+/);

  await page.goto("/trash");
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/was restored\./i)).toBeVisible();

  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

  const rows = page.getByRole("listitem").filter({ hasText: noteTitle });
  await expect(rows).toHaveCount(4);
  // Newest-first: restored, deleted, edited, created (log-activity.ts / GET /api/activity).
  await expect(rows.nth(0)).toContainText("Restored");
  await expect(rows.nth(1)).toContainText("Deleted");
  await expect(rows.nth(2)).toContainText("Edited");
  await expect(rows.nth(3)).toContainText("Created");
  for (let i = 0; i < 4; i++) {
    await expect(rows.nth(i).getByRole("link", { name: noteTitle })).toBeVisible();
  }
});
