import { defineConfig, devices } from "@playwright/test";

// The app server is started externally (Docker's `app` service, or CI's
// `npm run start` step) — not by Playwright itself, so there's no
// `webServer` block here. See .github/workflows/claude-qa.yml and
// docker-compose.yml's `playwright` service.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Recent Chromium defaults new profiles to HTTPS-First Mode, which silently
        // upgrades http:// navigations to https:// — against this plain-HTTP dev server
        // that surfaces as net::ERR_SSL_PROTOCOL_ERROR, not a real network issue. Only
        // "localhost" gets secure-context treatment automatically over plain HTTP; explicitly
        // trusting host.docker.internal (what the dockerized playwright service uses) avoids
        // Chromium silently disabling WebCrypto and other secure-context-gated APIs there.
        launchOptions: {
          args: [
            "--disable-features=HttpsUpgrades,HttpsFirstModeV2ForTypicallySecureUsers",
            "--unsafely-treat-insecure-origin-as-secure=http://host.docker.internal:3000",
          ],
        },
      },
    },
  ],
});
