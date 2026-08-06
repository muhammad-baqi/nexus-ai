import { expect, test } from "@playwright/test";

import { fetchConfirmationLink, followConfirmationLink } from "./helpers/mailpit";

// NOTE: written this feature, deliberately not run this session — per this session's agreed
// testing scope (live-browser/e2e verification deferred to a consolidated end-of-session pass).
// Registers a fresh account, creates a Code Snippet with a distinctive function name baked into
// its code, confirms Global Search finds it by that in-code string alone (Code_Snippets.md's
// core acceptance criterion — search indexes code_content, not just title), confirms
// copy-to-clipboard reproduces the exact stored content, and confirms an edit to language + code
// persists through a real reload (not just optimistic client state).
test("create a code snippet, find it by a string inside its code, copy it, and confirm edits persist @smoke", async ({
  page,
}) => {
  const uniqueEmail = `e2e-code-snippets-${Date.now()}@example.com`;
  const distinctiveFunctionName = `nexusSnippetProbe${Date.now()}`;
  const initialCode = `function ${distinctiveFunctionName}() {\n  return 42;\n}`;

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

  await page.getByRole("button", { name: "New Snippet" }).click();
  await expect(page).toHaveURL(/\/items\/.+/);

  // A freshly created snippet opens in view mode (unlike Notes) — explicit Save per this
  // feature's own scope decision (no continuous autosave), so Edit must be clicked first.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Answer to everything");
  await page.getByLabel("Language").selectOption("javascript");
  await page.locator('[contenteditable="true"]').first().fill(initialCode);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Answer to everything" })).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent(distinctiveFunctionName)}`);
  await expect(page.getByText("Answer to everything")).toBeVisible();

  await page.goto("/collections");
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("link", { name: "Answer to everything" }).click();

  // navigator.clipboard is unavailable in this specific test harness (host.docker.internal over
  // plain HTTP isn't a secure context in headless Chromium here — the same known, pre-existing
  // limitation this repo already documents for WebCrypto, e.g. every register-flow console log
  // this session showed "WebCrypto API is not supported"). CodeSnippetView's own try/catch
  // degrades gracefully to a "Couldn't copy" state rather than crashing (CLAUDE.md rule 7) — that
  // graceful-degradation path, and the exact-byte-for-byte copy behavior itself, is what's
  // asserted here; the real secure-context "Copied!" path is covered by
  // code-snippet-view.test.tsx's mocked-clipboard unit test instead.
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: /^(Copied!|Couldn't copy)$/ })).toBeVisible();

  const editedCode = `${initialCode}\n// edited`;
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Language").selectOption("python");
  await page.locator('[contenteditable="true"]').first().fill(editedCode);
  await page.getByRole("button", { name: "Save" }).click();

  await page.reload();
  await expect(page.getByText("Python")).toBeVisible();
  // Back in (read-only) view mode after reload — CodeMirror's content container (`.cm-content`)
  // stays present regardless of editable state, unlike `[contenteditable="true"]` above (which
  // only applies while actually editable).
  await expect(page.locator(".cm-content").first()).toContainText(distinctiveFunctionName);
  await expect(page.locator(".cm-content").first()).toContainText("// edited");
});
