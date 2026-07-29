import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest doesn't expose Jest-style globals by default (no `globals: true` in
// vitest.config.ts), so Testing Library's auto-cleanup detection never fires —
// without this, DOM from one test's render() leaks into the next.
afterEach(() => cleanup());
