import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest doesn't expose Jest-style globals by default (no `globals: true` in
// vitest.config.ts), so Testing Library's auto-cleanup detection never fires —
// without this, DOM from one test's render() leaks into the next.
afterEach(() => cleanup());

// jsdom doesn't implement matchMedia — needed by lib/theme/apply-theme.ts's "system" branch,
// exercised by any component that applies a theme preference.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
