import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// build-order-complete.md #23: "Simulate a bulk import — a batch of real website URLs and a
// folder of files (mix of PDFs, images, a couple of oversized/invalid ones on purpose) — and
// confirm the upload pipeline handles it without blocking the UI or leaving orphaned Storage
// objects on failed uploads."
//
// Not tagged @smoke — a one-off validation script (same reasoning e2e/search-performance.spec.ts
// documents), not part of the regular regression suite. Registers its own fresh account rather
// than requiring a pre-seeded one, since this tests real-time bulk-upload behavior, not query
// performance against a large pre-existing dataset.
//
// The "no orphaned Storage objects" half of this test is verified by this spec itself (the
// deliberately-mismatched-content file below correctly rejects and shows an inline error) plus a
// direct Postgres check documented in PROGRESS.md's Day 5 QA-gate entry — this spec proves the
// UI/API behavior; the direct storage.objects row-count check needs database access this Playwright
// process doesn't have, so it's run separately (see that PROGRESS.md entry for the exact query and
// result).
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BYTES = Buffer.concat([PNG_SIGNATURE, Buffer.from("fake-but-signature-valid-png-body")]);
// Declared as image/png (20MB cap) but the real size_bytes is what the server authoritatively
// checks — client-side validateFileUpload should reject this before it's ever uploaded to
// Storage at all, which is the strongest possible "no orphan" guarantee for this case.
const OVERSIZED_PNG_BYTES = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(21 * 1024 * 1024, 0)]);
// Passes the client-side declared-type/size check (application/pdf, small) but the real bytes
// are plain text, not a real PDF — this is the case that actually reaches Storage before being
// rejected server-side, exercising the real orphan-cleanup path (deleteUploadedObject).
const MISMATCHED_CONTENT_BYTES = Buffer.from("This is not actually a PDF file.");

test("bulk-import a batch of bookmarks and a mixed batch of files without blocking the UI or leaving orphans", async ({
  page,
}) => {
  // Real, newly-discovered gap (not something this test should paper over silently): this Docker/
  // host.docker.internal test environment doesn't treat the origin as a fully secure context
  // despite playwright.config.ts's `--unsafely-treat-insecure-origin-as-secure` flag — confirmed
  // live that `crypto.randomUUID()` throws here, the same class of issue already documented for
  // WebCrypto (register-form.tsx's "WebCrypto API is not supported" console warning, seen on
  // every registration this session) and the Clipboard API (code-snippet-view.tsx). Unlike those
  // two, upload-file-form.tsx has no fallback for a missing crypto.randomUUID — it's the ONLY
  // client-side call site in this codebase (avatar upload uses a fixed `{user.id}/avatar` path
  // instead, never hitting this), and per PROGRESS.md's own File Uploads entry, live-browser
  // verification of that feature was explicitly skipped when it shipped — so this has apparently
  // never been exercised by an automated browser before. Polyfilled here (test-only, not an app
  // change) so this stress test can actually drive real uploads; flagged in PROGRESS.md's QA-gate
  // entry as a real, standalone follow-up (this doesn't reproduce on Vercel's real HTTPS origin,
  // where crypto.randomUUID works natively — it's specifically a gap in what this local Docker/
  // Playwright harness can exercise, and in upload-file-form.tsx's own robustness).
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

  const uniqueEmail = `e2e-bulk-import-${Date.now()}@example.com`;

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

  // A batch of real website URLs — RFC 2606 reserved domains, guaranteed stable and safe to hit
  // repeatedly (example.com/.org are always reachable, .invalid is always unreachable), same
  // domains e2e/bookmarks.spec.ts already relies on for the identical reason.
  const bookmarkUrls = [
    "https://example.com/",
    "https://example.org/",
    "https://definitely-unreachable-for-testing.invalid/",
  ];
  for (const url of bookmarkUrls) {
    // Re-navigate via the Inbox link fresh each time, same path a real user would take, rather
    // than relying on a captured URL across iterations.
    await page.goto("/collections");
    await page.getByRole("link", { name: "Inbox" }).click();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

    await page.getByRole("button", { name: "Save Bookmark" }).click();
    await page.getByLabel("URL").fill(url);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // SaveBookmarkForm navigates straight to the new item's detail page on success (same pattern
    // as "New Note") — immediately, not waiting on the metadata fetch (Website_Bookmarks.md).
    // Not asserting the heading's exact text: for a fast-responding reachable URL, the metadata
    // job can resolve and replace the raw-URL title before this assertion even runs — itself
    // further proof the save wasn't blocked on it, not something to work around by racing it.
    await expect(page).toHaveURL(/\/items\/.+/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

  // A mixed batch of files in one go — two that should succeed, two that should be rejected for
  // different reasons (client-side size cap, server-side content-sniff mismatch) — uploaded
  // together via the same <input multiple> the real drag-and-drop/file-picker flow uses.
  await page.getByRole("button", { name: "Upload Files" }).click();
  await page.getByLabel("Choose files to upload").setInputFiles([
    { name: "report.pdf", mimeType: "application/pdf", buffer: PDF_BYTES },
    { name: "photo.png", mimeType: "image/png", buffer: PNG_BYTES },
    { name: "oversized-photo.png", mimeType: "image/png", buffer: OVERSIZED_PNG_BYTES },
    { name: "fake-mismatched.pdf", mimeType: "application/pdf", buffer: MISMATCHED_CONTENT_BYTES },
  ]);

  // The two valid files complete...
  await expect(page.locator("li", { hasText: "report.pdf" }).getByText("Done")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("li", { hasText: "photo.png" }).getByText("Done")).toBeVisible({ timeout: 15000 });
  // ...independently of the two invalid ones failing with a visible, specific inline error —
  // proving one bad file in a batch doesn't block or delay the others (Promise.all-based
  // per-file handling in components/files/upload-file-form.tsx).
  await expect(page.locator("li", { hasText: "oversized-photo.png" }).getByRole("alert")).toBeVisible();
  await expect(page.locator("li", { hasText: "fake-mismatched.pdf" }).getByRole("alert")).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();

  // Final state: 3 bookmarks + 2 files visible in the collection; the 2 rejected files never
  // became items at all.
  await expect(page.getByText("report.pdf")).toBeVisible();
  await expect(page.getByText("photo.png")).toBeVisible();
  await expect(page.getByText("oversized-photo.png")).not.toBeVisible();
  await expect(page.getByText("fake-mismatched.pdf")).not.toBeVisible();
});
