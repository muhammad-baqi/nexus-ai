import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers and verifies a fresh account, opens the default "Inbox" collection, creates a Note,
// edits its title/body, saves, then reloads the page to confirm both persisted through a real
// round-trip against the local Supabase stack (not just optimistic client state).
test("create a note, edit title and body, and confirm it persists @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-notes-${Date.now()}@example.com`;

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

  await page.getByLabel("Title").fill("Trip planning");
  await page.getByLabel("Body").fill("Pack sunscreen and a passport.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue("Trip planning");
  await expect(page.getByLabel("Body")).toHaveValue("Pack sunscreen and a passport.");

  // The note is also reachable and shows its real title from the collection view, not the
  // "Untitled Note" placeholder it was created with.
  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("link", { name: "Trip planning" })).toBeVisible();
});
