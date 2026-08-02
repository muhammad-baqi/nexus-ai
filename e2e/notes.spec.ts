import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Waits for the debounced-autosave PATCH to actually round-trip, rather than an arbitrary
// sleep — the caller must set this up *before* the action that edits the field (autosave fires
// ~1.5s after the last keystroke, not on the keystroke itself).
function waitForAutosave(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (res) => res.url().includes("/api/items/") && res.request().method() === "PATCH",
  );
}

// Registers and verifies a fresh account, opens the default "Inbox" collection, creates a Note,
// edits its title/body with a mix of the rich-formatting content types, waits for autosave (no
// Save button — Notes.md's autosave feature removed it), then reloads the page to confirm both
// the raw content and its rendering persist through a real round-trip against the local Supabase
// stack (not just optimistic client state). Also exercises the Markdown/Rich text toggle:
// authors new content via the WYSIWYG toolbar, confirms it round-trips to real Markdown syntax
// when switched back, and that it autosaves/persists identically to hand-typed Markdown. Finally
// exercises Version History: three separate edit sessions each open their own version, History
// lists all three, previewing and restoring the oldest brings its content back as the current
// rendered view (confirmed live, and again after a reload). Finally clicks a checklist checkbox
// directly from that rendered (non-edit) view, confirming it toggles and autosaves immediately.
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
  let patched = waitForAutosave(page);
  await page.getByLabel("Title").fill("Trip planning");
  await page
    .getByLabel("Body")
    .fill(
      "# Details\n\n**Don't forget** the passport.\n\n- [x] Book flights\n- [ ] Pack bag",
    );
  await patched; // no Save button — autosave persists this automatically
  await page.getByRole("button", { name: "Done" }).click();

  // Done returns to the rendered view — real elements, not raw Markdown syntax.
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

  // Switching to the Rich text surface shows the same content, parsed — not raw Markdown.
  await page.getByRole("button", { name: "Rich text" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Details" })).toBeVisible();

  // Add a new heading and bold text via the WYSIWYG toolbar (not typed Markdown syntax).
  // Set up the autosave wait *before* these edits — autosave fires ~1.5s after the last
  // keystroke, which can easily land before the toggle-back click below.
  patched = waitForAutosave(page);
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Heading 2" }).click();
  await page.keyboard.type("New Section");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Extra emphasis");
  await patched; // toolbar-authored edit also autosaves — no Save button

  // Switching back to Markdown shows the toolbar-authored content as real Markdown syntax.
  await page.getByRole("button", { name: "Markdown" }).click();
  await expect(page.getByLabel("Body")).toHaveValue(/## New Section/);
  await expect(page.getByLabel("Body")).toHaveValue(/\*\*Extra emphasis\*\*/);

  await page.getByRole("button", { name: "Done" }).click();

  // Done renders both the original content and the toolbar-authored content as real elements.
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New Section" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "Extra emphasis" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "New Section" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "Extra emphasis" })).toBeVisible();

  // Version history: the two edit sessions above (fill+Done, then Rich-text edit+Markdown
  // toggle+Done) each opened their own version boundary. A third short session — replacing the
  // body entirely — creates a third version, then History lets us go back to the very first one.
  await page.getByRole("button", { name: "Edit" }).click();
  patched = waitForAutosave(page);
  await page.getByLabel("Body").fill("Replaced entirely for the version-history check.");
  await patched;
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Replaced entirely for the version-history check.")).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  const previewButtons = page.getByRole("button", { name: "Preview" });
  await expect(previewButtons).toHaveCount(3);

  // The list is newest-first — the last entry is the very first version ever saved.
  await previewButtons.last().click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "Don't forget" })).toBeVisible();

  await page.getByRole("button", { name: "Restore this version" }).click();
  // Restoring updates the rendered view immediately, without needing a reload.
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "Don't forget" })).toBeVisible();
  await expect(page.getByText("Replaced entirely for the version-history check.")).not.toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "Don't forget" })).toBeVisible();

  // Checklist toggle from the rendered view: the restored content's checklist is visible right
  // here in view mode — click a checkbox directly, no Edit click needed, and it autosaves
  // immediately (Notes.md's Checklists section).
  const viewCheckboxes = page.getByRole("checkbox");
  await expect(viewCheckboxes).toHaveCount(2);
  await expect(viewCheckboxes.nth(1)).not.toBeChecked();
  patched = waitForAutosave(page);
  await viewCheckboxes.nth(1).click();
  await patched;
  await expect(viewCheckboxes.nth(1)).toBeChecked();
  await expect(page.getByLabel("Title")).not.toBeVisible(); // never entered edit mode

  await page.reload();
  await expect(page.getByRole("checkbox").nth(1)).toBeChecked();

  // The note is also reachable and shows its real title from the collection view, not the
  // "Untitled Note" placeholder it was created with.
  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("link", { name: "Trip planning" })).toBeVisible();
});
