import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers and verifies a fresh account, creates a note in the default Inbox collection, then
// exercises the item-level Trash/Restore/Permanent-delete loop against the real local Supabase
// stack — a separate spec from the already-large e2e/notes.spec.ts so this feature's own
// assertions don't depend on that file's other (occasionally flaky, per PROGRESS.md) sections.
test("trash, restore, and permanently delete a note @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-trash-${Date.now()}@example.com`;

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

  await page.getByRole("button", { name: "New Note" }).click();
  await expect(page).toHaveURL(/\/items\/.+/);
  await page.getByLabel("Title").fill("Trash me");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Trash me" })).toBeVisible();

  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByText("Move to Trash?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();

  // Trashing navigates back to the note's collection, where it's now gone.
  await expect(page).toHaveURL(/\/collections\/.+/);
  await expect(page.getByRole("link", { name: "Trash me" })).not.toBeVisible();

  await page.goto("/trash");
  await expect(page.getByText("Trash me")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/was restored\./i)).toBeVisible();
  await expect(page.getByText(/trash is empty/i)).toBeVisible();

  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("link", { name: "Trash me" })).toBeVisible();

  // Trash it again, then permanently delete it from within Trash.
  await page.getByRole("link", { name: "Trash me" }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/collections\/.+/);

  await page.goto("/trash");
  await expect(page.getByText("Trash me")).toBeVisible();
  await page.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByText("Delete forever?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/trash is empty/i)).toBeVisible();

  // Gone for good — not reachable even from the collection it used to live in.
  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("link", { name: "Trash me" })).not.toBeVisible();
});

// Regression coverage for this feature's own named acceptance criterion ("cascades to
// collection delete", PROGRESS.md/build-order-complete.md): deleting a Collection cascade-trashes
// its items, and restoring the Collection must bring those same items back rather than leaving
// them stranded in Trash under a now-live collection.
test("restoring a trashed collection also restores the items that were cascade-trashed with it @smoke", async ({
  page,
}) => {
  const uniqueEmail = `e2e-trash-cascade-${Date.now()}@example.com`;

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
  await page.getByRole("button", { name: "New collection" }).click();
  await page.getByLabel("Name").fill("Old Project");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Old Project")).toBeVisible();

  await page.getByRole("link", { name: "Old Project" }).click();
  await expect(page.getByRole("heading", { name: "Old Project" })).toBeVisible();
  await page.getByRole("button", { name: "New Note" }).click();
  await expect(page).toHaveURL(/\/items\/.+/);
  await page.getByLabel("Title").fill("Cascade me");
  await page.getByRole("button", { name: "Done" }).click();
  // Waiting for the saved title to render (not just clicking Done) matters here: the title
  // itself autosaves on a debounce, and navigating away before it lands would cascade-trash a
  // row with no title, making the "Cascade me" assertions below meaningless rather than failing
  // for the reason they're supposed to test.
  await expect(page.getByRole("heading", { name: "Cascade me" })).toBeVisible();

  // Deleting the collection cascade-trashes "Cascade me" along with it.
  await page.goto("/collections");
  const projectCard = page.locator("div.rounded-lg", { hasText: "Old Project" });
  await projectCard.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/this will move 1 item to trash/i)).toBeVisible();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByRole("heading", { name: "Old Project" })).not.toBeVisible();

  await page.goto("/trash");
  await expect(page.getByText("Old Project")).toBeVisible();
  await expect(page.getByText("Cascade me")).toBeVisible();

  const collectionRow = page.locator("div.rounded-lg", { hasText: "Old Project" });
  await collectionRow.getByRole("button", { name: /^restore$/i }).click();
  await expect(page.getByText(/trash is empty/i)).toBeVisible();

  await page.goto("/collections");
  await page.getByRole("link", { name: "Old Project" }).click();
  await expect(page.getByRole("link", { name: "Cascade me" })).toBeVisible();
});
