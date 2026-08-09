import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers a fresh account, creates a note, switches to the Rich text editing surface, opens
// the toolbar's inline "Image" URL form, and confirms Escape dismisses it — the Day 6
// accessibility-pass fix to note-rich-text-editor.tsx (previously only Enter-to-submit existed,
// no keyboard way to back out of the inline form).
test("rich-text editor's inline Image URL form dismisses on Escape @smoke", async ({ page }) => {
  const uniqueEmail = `e2e-richtext-escape-${Date.now()}@example.com`;

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

  await page.getByRole("button", { name: "Rich text" }).click();
  await page.getByRole("button", { name: "Image" }).click();
  const imageUrlInput = page.getByLabel("Image URL");
  await expect(imageUrlInput).toBeVisible();

  await imageUrlInput.press("Escape");
  await expect(imageUrlInput).not.toBeVisible();
});
