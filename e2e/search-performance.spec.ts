import { expect, test } from "@playwright/test";

// Day 4 performance validation (build-order-complete.md #19, Search.md's own acceptance
// criterion: "a performance test using the 5,000-item generated dataset"). Logs into the account
// scripts/seed-search-stress-test.mjs just seeded with 5,000 notes and confirms search/filtering/
// pagination all stay functionally correct at that scale in a real browser.
//
// This spec deliberately does NOT assert a timing budget itself — two different in-browser
// timing approaches were tried and both proved unreliable in this dockerized Playwright
// environment: wall-clock-from-action-to-response wrongly bundles in SearchView's intentional
// ~250ms results debounce (a product decision, not server latency), and Playwright's Resource
// Timing API (`request.timing().responseEnd`) returned -1 (unavailable) for every request here.
// The actual "<500ms server-side" claim (Success_Metrics.md, Search.md) is measured cleanly and
// authoritatively by scripts/measure-search-performance.mjs, which times
// search_knowledge_items() directly with zero debounce/network/browser-compile noise — see
// PROGRESS.md's Day 4 entry for the recorded numbers (worst case ~73ms against this exact
// 5,000-item dataset). This spec is the complementary real-browser functional/pagination proof.
//
// Not tagged @smoke — depends on a large seeded dataset not present in a normal test run, so
// it's a one-off validation script, not part of the regular regression suite.
//
// Run with (after seeding, from the repo root):
//   SEED_EMAIL=<email printed by the seed script> npx playwright test e2e/search-performance.spec.ts
test("search, filtering, and pagination stay correct against a 5,000-item dataset", async ({ page }) => {
  const email = process.env.SEED_EMAIL;
  test.skip(!email, "Set SEED_EMAIL to the account scripts/seed-search-stress-test.mjs just seeded.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill("StressTest123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/dashboard");

  await page.goto("/search");

  async function search(action: () => Promise<void>) {
    const responsePromise = page.waitForResponse((res) => res.url().includes("/api/items?"));
    await action();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    return response.json();
  }

  const browseBody = await search(async () => {
    await page.getByPlaceholder("Search your notes…").click();
  });
  expect(browseBody.total).toBe(5000);

  const queryBody = await search(async () => {
    await page.getByPlaceholder("Search your notes…").fill("project");
  });
  expect(queryBody.total).toBeGreaterThan(0);
  expect(queryBody.total).toBeLessThan(5000);
  await expect(page.getByRole("listitem").first()).toBeVisible();

  const favoriteBody = await search(async () => {
    await page.getByLabel("Favorite", { exact: true }).selectOption("true");
  });
  expect(favoriteBody.items.every((item: { is_favorite: boolean }) => item.is_favorite)).toBe(true);

  const resetBody = await search(async () => {
    await page.getByLabel("Favorite", { exact: true }).selectOption("");
    await page.getByPlaceholder("Search your notes…").fill("");
  });
  expect(resetBody.total).toBe(5000);

  // Pagination: 5,000 items / 20 per page is 250 pages — jump forward several times and confirm
  // the page controls and result set both hold up at depth (no crash, no stale/duplicate page).
  const totalPages = Math.max(1, Math.ceil(resetBody.total / resetBody.limit));
  expect(totalPages).toBeGreaterThan(1);
  for (let i = 0; i < 5; i++) {
    const responsePromise = page.waitForResponse((res) => res.url().includes("/api/items?"));
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
  }
  await expect(page.getByText(/^Page 6 of/)).toBeVisible();
});
