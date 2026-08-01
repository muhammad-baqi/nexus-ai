import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Registers and verifies a fresh account, opens the default "Inbox" collection, creates a Note,
// edits its title/body with a mix of the rich-formatting content types, saves, then reloads the
// page to confirm both the raw content and its rendering persist through a real round-trip
// against the local Supabase stack (not just optimistic client state).
test("create a note, edit title and body, and confirm formatting persists and renders @smoke", async ({
  page,
}) => {
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

  // A freshly created note (default title, empty body) opens straight into edit mode — no
  // separate "Edit" click needed before the user can start typing.
  await page.getByLabel("Title").fill("Trip planning");
  await page
    .getByLabel("Body")
    .fill(
      "# Details\n\n**Don't forget** the passport.\n\n- [x] Book flights\n- [ ] Pack bag",
    );
  await page.getByRole("button", { name: "Save" }).click();

  // Save returns to the rendered view — real elements, not raw Markdown syntax.
  await expect(page.getByRole("heading", { name: "Trip planning", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "Don't forget" })).toBeVisible();
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(2);
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(checkboxes.nth(1)).not.toBeChecked();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Trip planning", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("checkbox").first()).toBeChecked();

  // Edit still shows the raw Markdown source, not the rendered HTML.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Body")).toHaveValue(/^# Details/);
  await page.getByRole("button", { name: "Cancel" }).click();

  // The note is also reachable and shows its real title from the collection view, not the
  // "Untitled Note" placeholder it was created with.
  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("link", { name: "Trip planning" })).toBeVisible();
});
