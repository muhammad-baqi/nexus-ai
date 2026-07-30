import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers and verifies a fresh account (verifyOtp signs the user in directly, same as
// e2e/verify-email.spec.ts), then exercises Collections' full create -> delete -> restore loop
// against the real local Supabase stack. "add items" from Collections.md's own acceptance
// criteria isn't testable yet — Notes/items don't exist until Day 3 — so this covers everything
// that's actually buildable today.
test("create, delete, and restore a collection @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-collections-${Date.now()}@example.com`;

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
  // The signup trigger provisions a default "Inbox" collection immediately.
  await expect(page.getByText("Inbox")).toBeVisible();

  await page.getByRole("button", { name: "New collection" }).click();
  await page.getByLabel("Name").fill("Travel");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Travel")).toBeVisible();

  // Duplicate name is rejected inline, not as a generic failure.
  await page.getByRole("button", { name: "New collection" }).click();
  await page.getByLabel("Name").fill("Travel");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(/already have a collection with this name/i)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Scoped to the card's own root (identified by its distinctive class, not just "a div
  // containing Travel") -- a plain ancestor-div selector also matches the shared list wrapper,
  // which contains every card's Delete button, not just this one's.
  const travelCard = page.locator("div.rounded-lg", { hasText: "Travel" });
  await travelCard.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/this will move 0 items to trash/i)).toBeVisible();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByRole("heading", { name: "Travel" })).not.toBeVisible();

  await page.getByLabel("View").selectOption("trashed");
  await expect(page.getByText("Travel")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/trash is empty/i)).toBeVisible();

  await page.getByLabel("View").selectOption("active");
  await expect(page.getByRole("heading", { name: "Travel" })).toBeVisible();
});
