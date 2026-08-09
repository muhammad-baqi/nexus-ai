import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Real, stable public videos — not the metadata-fetch target (bookmark save never blocks on
// that, per bookmarks.spec.ts), just something detect-embed.ts's own regexes recognize.
const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YOUTUBE_EMBED_SRC = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
const VIMEO_URL = "https://vimeo.com/76979871";
const VIMEO_EMBED_SRC = "https://player.vimeo.com/video/76979871";

// Registers a fresh account, saves a YouTube and a Vimeo bookmark, confirms each renders as a
// real iframe embed (the exact, hardcoded youtube-nocookie.com/player.vimeo.com src detect-
// embed.ts derives — never a URL fetched from a third party) on the owner's own BookmarkView,
// then confirms the same embed also renders on the item's public share page
// (shared-item-view.tsx reuses the identical LinkEmbed component). The spoofed-canonical-URL
// content-spoofing regression (detect off the saved `url`, never a scraped canonical_url) isn't
// re-checked live here — it needs a controlled external page with a crafted <link rel="canonical">
// to reproduce honestly, which isn't practical in this harness; it's covered by
// bookmark-view.test.tsx's own regression test instead.
test("save YouTube and Vimeo bookmarks, confirm real iframe embeds render, and that they also render on the public share page @smoke", async ({
  page,
  browser,
}) => {
  const uniqueEmail = `e2e-embeds-${Date.now()}@example.com`;

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

  // YouTube bookmark.
  await page.getByRole("button", { name: "Save Bookmark" }).click();
  await page.getByLabel("URL").fill(YOUTUBE_URL);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/.+/);
  await expect(page.locator(`iframe[src="${YOUTUBE_EMBED_SRC}"]`)).toBeVisible();

  const shareResponse = page.waitForResponse(
    (res) => res.url().includes("/share") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shareBody: { url: string } = await (await shareResponse).json();
  const sharePath = new URL(shareBody.url).pathname;

  // Vimeo bookmark.
  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("button", { name: "Save Bookmark" }).click();
  await page.getByLabel("URL").fill(VIMEO_URL);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/.+/);
  await expect(page.locator(`iframe[src="${VIMEO_EMBED_SRC}"]`)).toBeVisible();

  // The YouTube bookmark's public share page (fresh, cookie-less context — a real logged-out
  // visitor) renders the identical embed via the same LinkEmbed component.
  const visitorContext = await browser.newContext();
  const visitorPage = await visitorContext.newPage();
  await visitorPage.goto(sharePath);
  await expect(visitorPage.locator(`iframe[src="${YOUTUBE_EMBED_SRC}"]`)).toBeVisible();
  await visitorContext.close();
});
