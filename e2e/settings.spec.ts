import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// Run live this session (not deferred, per this session's testing-scope note) specifically
// because self-review caught a real, security-relevant bug in the import path (a crafted import
// file could carry a `javascript:` bookmark URL, a stored-XSS vector — fixed by reusing the same
// URL validation real bookmark creation enforces) — exactly the class of finding this session's
// own precedent (Code Snippets) says warrants live proof rather than trusting the mocked unit
// tests alone.
test("toggle preferences, export as JSON, and import a bundle back in @smoke", async ({ page }) => {
  // Same known, already-documented gap as e2e/bulk-import-stress-test.spec.ts's identical
  // polyfill: this Docker/host.docker.internal-over-HTTP test harness doesn't treat the origin as
  // a secure context, so `crypto.randomUUID()` throws here (never reproduces on Vercel's real
  // HTTPS origin). components/settings/data-import-form.tsx is the only other client-side call
  // site of it besides upload-file-form.tsx, which has the identical, already-flagged gap.
  // Test-only polyfill, not an app change.
  await page.addInitScript(() => {
    if (typeof window.crypto.randomUUID !== "function") {
      // @ts-expect-error - patching a missing browser API for this insecure-context test harness
      window.crypto.randomUUID = () =>
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
    }
  });

  const uniqueEmail = `e2e-settings-${Date.now()}@example.com`;

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

  // Language: only one real option, but it must actually PATCH and persist like every other
  // Settings control (Settings.md: "functional" as scaffolding for later, not a disabled stub).
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

  // Notifications: toggle off, reload, confirm it stuck (persisted per-account, same bar Theme's
  // own cross-session persistence already established).
  // exact: true — "On"/"Off" are otherwise a substring match of "JSON" (Playwright's default
  // name matching is case-insensitive substring, and "json".includes("on") is true), colliding
  // with the "Export as JSON" button and the Import file input's own accessible name on this page.
  await page.getByRole("button", { name: "On", exact: true }).click();
  await expect(page.getByRole("button", { name: "Off", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Off", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

  // Export as JSON → background job → poll to success → real signed download link.
  await page.getByRole("button", { name: "Export as JSON" }).click();
  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 15000 });
  const downloadHref = await downloadLink.getAttribute("href");
  expect(downloadHref).toBeTruthy();

  // Confirms the signed URL actually resolves to real export content, not just that the UI
  // *claims* success — fetched directly rather than via a browser navigation/download, since a
  // plain `application/json` response isn't reliably a "download" event in headless Chromium.
  const exportResponse = await page.request.get(downloadHref!);
  expect(exportResponse.ok()).toBe(true);
  const exportedBundle = await exportResponse.json();
  expect(exportedBundle).toHaveProperty("collections");
  // The fresh account's default "Inbox" collection, still empty at this point.
  expect(exportedBundle.collections.some((c: { name: string }) => c.name === "Inbox")).toBe(true);

  // Import: a small, self-contained bundle (not necessarily the one just downloaded) fed through
  // the real direct-to-Storage upload + POST /api/settings/import + background-job path, proving
  // the full stack end-to-end — including the self-review-caught URL-validation fix, exercised
  // here via a deliberately malicious item that must be silently skipped, not imported.
  const importBundle = {
    exported_at: new Date().toISOString(),
    collections: [
      {
        name: `Imported Collection ${Date.now()}`,
        description: null,
        color: null,
        icon: null,
        is_favorite: false,
        is_archived: false,
        items: [
          {
            type: "note",
            title: "Imported Note",
            description: null,
            is_favorite: false,
            is_archived: false,
            tags: [],
            note: { content: "Hello from an imported note." },
          },
          {
            type: "website",
            title: "Malicious",
            description: null,
            is_favorite: false,
            is_archived: false,
            tags: [],
            website: {
              url: "javascript:alert(1)",
              canonical_url: null,
              domain: null,
              og_image_url: null,
              favicon_url: null,
            },
          },
        ],
      },
    ],
  };

  await page
    .getByLabel(/import a previous export/i)
    .setInputFiles({
      name: "export.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(importBundle)),
    });

  await expect(page.getByText(/imported 1 item, skipped 1/i)).toBeVisible({ timeout: 15000 });

  await page.goto("/collections");
  await expect(page.getByText(importBundle.collections[0].name)).toBeVisible();
});
