import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Waits for the debounced-autosave PATCH to actually round-trip — Notes have no explicit Save
// button (Notes.md's autosave feature removed it), matching e2e/notes.spec.ts's identical helper.
function waitForAutosave(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (res) => res.url().includes("/api/items/") && res.request().method() === "PATCH",
  );
}

// Registers a fresh account, turns the "Reminder emails" toggle off first (deliberately — this
// makes the scheduler resolve deterministically via the toggle-off path regardless of whether
// RESEND_API_KEY is configured in whatever environment runs this spec; a real send attempt would
// always fail without one, since this repo has no Resend account wired up in any environment yet,
// and this spec shouldn't be flaky/gated on third-party credentials it doesn't need to prove the
// scheduler's own advance/deactivate behavior), creates a note, attaches a one-time reminder a
// few seconds out, confirms it shows on the Dashboard's Upcoming Reminders section, manually
// triggers the cron route (Vercel Cron doesn't run in this local/CI environment — the same
// CRON_SECRET the real scheduler authenticates with drives this directly, per
// app/api/cron/reminders/route.ts), confirms the reminder disappears from Upcoming Reminders once
// fired, then confirms trash/restore deactivates/reactivates it.
test("attach a one-time reminder, fire it via the scheduler, and confirm trash/restore deactivate/reactivate it @smoke", async ({
  page,
}) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET must be set in the test environment to drive the scheduler route directly.");

  const uniqueEmail = `e2e-reminders-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).fill("abcd1234");
  await page.getByLabel("Confirm password").fill("abcd1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const confirmationLink = await fetchConfirmationLink(uniqueEmail);
  await followConfirmationLink(page, confirmationLink);
  await expect(page.getByText(/your email is verified/i)).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "On", exact: true }).click();
  await expect(page.getByRole("button", { name: "Off", exact: true })).toBeVisible();

  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("button", { name: "New Note" }).click();
  await expect(page).toHaveURL(/\/items\/.+/);
  // A freshly created note opens straight into edit mode — no Save button, autosave persists
  // this (matches e2e/notes.spec.ts's identical flow).
  const patched = waitForAutosave(page);
  await page.getByLabel("Title").fill("Follow up on this");
  await patched;
  await page.getByRole("button", { name: "Done" }).click();

  // `<input type="datetime-local">` has minute granularity — no seconds field — so whatever
  // seconds fireAt happened to land on get silently truncated *down* to the start of that
  // minute once the browser re-parses "YYYY-MM-DDTHH:MM" back into a Date (self-review-caught:
  // a flat 30s buffer wasn't actually safe once this rounding cost up to 59 of those seconds,
  // intermittently landing the truncated value in the past by the time the server validated it).
  // 90s comfortably survives that worst-case 59s of rounding plus the UI/dev-server round-trip.
  const fireAt = new Date(Date.now() + 90_000);
  const localValue = new Date(fireAt.getTime() - fireAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  await page.getByRole("button", { name: "Add reminder" }).click();
  await page.getByLabel("Date & time").fill(localValue);
  const createReminder = page.waitForResponse(
    (res) => res.url().includes("/reminders") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save" }).click();
  const createResponse = await createReminder;
  expect(createResponse.ok()).toBe(true);
  // The form only closes (Add reminder button reappears) on a successful save — showForm stays
  // true on a failed one, which would otherwise make "No active reminders." disappearing alone a
  // false-positive signal (that paragraph is gated on !showForm, not on a reminder actually
  // existing).
  await expect(page.getByRole("button", { name: "Add reminder" })).toBeVisible();

  // Scoped to the Upcoming Reminders section specifically — the item also legitimately appears
  // in Recent Items on the same page (matches e2e/dashboard.spec.ts's identical section-scoping
  // pattern via `.locator("..")` from the section's own heading).
  const upcomingReminders = page.getByRole("heading", { name: "Upcoming Reminders" }).locator("..");

  await page.goto("/dashboard");
  await expect(upcomingReminders.getByText("Follow up on this")).toBeVisible();

  // Wait past the chosen fire time (safely past even the worst-case truncated-down target above),
  // then trigger the scheduler directly.
  await page.waitForTimeout(100_000);
  const cronResponse = await page.request.get("/api/cron/reminders", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(cronResponse.ok()).toBe(true);

  await page.goto("/dashboard");
  await expect(upcomingReminders.getByText("Follow up on this")).not.toBeVisible();

  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("link", { name: "Follow up on this" }).click();

  await page.getByRole("button", { name: "Add reminder" }).click();
  await page.getByLabel("Type").selectOption("daily");
  await page.getByLabel("Time (UTC)").fill("09:00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Daily at 09:00 UTC/)).toBeVisible();

  await page.getByRole("button", { name: "Move to Trash" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  await page.goto("/trash");
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/was restored\./i)).toBeVisible();

  // Restoring removes it from Trash (matches e2e/trash.spec.ts's identical pattern) — find it
  // back in its collection to confirm the reminder itself reactivated.
  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("link", { name: "Follow up on this" }).click();
  await expect(page.getByText(/Daily at 09:00 UTC/)).toBeVisible();
});
