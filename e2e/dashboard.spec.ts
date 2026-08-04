import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

function waitForAutosave(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (res) => res.url().includes("/api/items/") && res.request().method() === "PATCH",
  );
}

// Registers a fresh account, creates and favorites a Note, opens it (recording a view), then
// confirms the Dashboard reflects all of that without a manual refresh (build-order-complete.md
// step 18's own test prompt), and that killing one section's query on purpose doesn't blank the
// rest of the page (Dashboard.md's Error States requirement).
test("Dashboard reflects a newly created/edited/favorited/viewed item, and one section's failure doesn't block the rest @smoke", async ({
  page,
}) => {
  const uniqueEmail = `e2e-dashboard-${Date.now()}@example.com`;

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

  let patched = waitForAutosave(page);
  await page.getByLabel("Title").fill("Dashboard test note");
  await page.getByLabel("Body").fill("Body content for the dashboard test.");
  await patched;
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();

  const itemUrl = page.url();

  // Navigate away and back to record a "view" distinct from the edit above (Dashboard.md's
  // Recently Viewed is opening an item, not editing it).
  await page.goto("/collections");
  await page.goto(itemUrl);
  await expect(page.getByRole("heading", { name: "Dashboard test note", level: 1 })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Recent Items and Recently Viewed both show the note (it was both edited and viewed).
  await expect(
    page.getByRole("heading", { name: "Recent Items" }).locator("..").getByText("Dashboard test note"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recently Viewed" }).locator("..").getByText("Dashboard test note"),
  ).toBeVisible();

  // Favorites shows the favorited item.
  await expect(
    page.getByRole("heading", { name: "Favorites" }).locator("..").getByText("Dashboard test note"),
  ).toBeVisible();

  // Recent Collections shows Inbox (the note's collection).
  await expect(
    page.getByRole("heading", { name: "Recent Collections" }).locator("..").getByText("Inbox"),
  ).toBeVisible();

  // Statistics reflects the one note created.
  await expect(page.getByText(/1 item · 1 Collection/)).toBeVisible();

  // Kill one section's query on purpose (statistics RPC) and confirm the rest of the page still
  // renders — Dashboard.md's explicit Error States acceptance criterion.
  await page.route("**/api/dashboard", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.statistics = { data: null, error: "statistics_failed" };
    await route.fulfill({ response, json: body });
  });
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Statistics" }).locator("..").getByText(/couldn't load this section/i),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent Items" }).locator("..").getByText("Dashboard test note"),
  ).toBeVisible();
});
