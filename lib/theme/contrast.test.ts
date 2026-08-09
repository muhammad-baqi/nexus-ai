import { describe, expect, it } from "vitest";

import { contrastRatio, oklchLuminance, oklchLuminanceOverBackdrop, type Oklch } from "./contrast";

// Mirrors app/globals.css's `:root` (light mode) block — keep these in sync if either changes.
// WCAG AA requires >= 4.5:1 contrast for normal text.
const AA_NORMAL_TEXT = 4.5;

const background: Oklch = { l: 1, c: 0, h: 0 };
const foreground: Oklch = { l: 0.145, c: 0, h: 0 };
const muted: Oklch = { l: 0.97, c: 0, h: 0 };
const mutedForeground: Oklch = { l: 0.53, c: 0, h: 0 };
const destructive: Oklch = { l: 0.5, c: 0.245, h: 27.325 };
const primary: Oklch = { l: 0.44, c: 0.16, h: 42 };
const primaryForeground: Oklch = { l: 0.985, c: 0, h: 0 };

describe("light-mode design token contrast (WCAG AA)", () => {
  it("--foreground on --background", () => {
    const ratio = contrastRatio(oklchLuminance(foreground), oklchLuminance(background));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--muted-foreground on --background (timestamps, secondary/description text)", () => {
    const ratio = contrastRatio(oklchLuminance(mutedForeground), oklchLuminance(background));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--muted-foreground on --muted (badges, tag-remove glyph, code-block syntax highlighting)", () => {
    const ratio = contrastRatio(oklchLuminance(mutedForeground), oklchLuminance(muted));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("text-destructive on --background (inline field/form error text)", () => {
    const ratio = contrastRatio(oklchLuminance(destructive), oklchLuminance(background));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("text-destructive on the destructive Button variant's bg-destructive/10 background", () => {
    const textLuminance = oklchLuminance(destructive);
    const bgLuminance = oklchLuminanceOverBackdrop(destructive, 0.1, background);
    const ratio = contrastRatio(textLuminance, bgLuminance);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--primary-foreground on --primary (default Button variant text)", () => {
    const ratio = contrastRatio(oklchLuminance(primaryForeground), oklchLuminance(primary));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--primary as text on --background (Button's link variant)", () => {
    const ratio = contrastRatio(oklchLuminance(primary), oklchLuminance(background));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--primary-foreground on the default Button variant's hover:bg-primary/80 state", () => {
    const textLuminance = oklchLuminance(primaryForeground);
    const bgLuminance = oklchLuminanceOverBackdrop(primary, 0.8, background);
    const ratio = contrastRatio(textLuminance, bgLuminance);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--primary as text on the active nav-link's bg-primary/10 background", () => {
    const textLuminance = oklchLuminance(primary);
    const bgLuminance = oklchLuminanceOverBackdrop(primary, 0.1, background);
    const ratio = contrastRatio(textLuminance, bgLuminance);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

// Mirrors app/globals.css's `.dark` block. Only --primary (and its dependents) are pinned here —
// every other dark-mode token is an unmodified shadcn default already known to pass AA, per this
// file's original light-mode-only scope; --primary is new (was oklch(0.922 0 0), effectively
// monochrome) so it needs its own regression guard the same way light mode's does.
describe("dark-mode design token contrast (WCAG AA)", () => {
  const darkBackground: Oklch = { l: 0.145, c: 0, h: 0 };
  const darkPrimary: Oklch = { l: 0.75, c: 0.14, h: 42 };
  const darkPrimaryForeground: Oklch = { l: 0.205, c: 0, h: 0 };

  it("--primary-foreground on --primary (default Button variant text)", () => {
    const ratio = contrastRatio(oklchLuminance(darkPrimaryForeground), oklchLuminance(darkPrimary));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--primary as text on --background (Button's link variant)", () => {
    const ratio = contrastRatio(oklchLuminance(darkPrimary), oklchLuminance(darkBackground));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--primary-foreground on the default Button variant's hover:bg-primary/80 state", () => {
    const textLuminance = oklchLuminance(darkPrimaryForeground);
    const bgLuminance = oklchLuminanceOverBackdrop(darkPrimary, 0.8, darkBackground);
    const ratio = contrastRatio(textLuminance, bgLuminance);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("--primary as text on the active nav-link's bg-primary/10 background", () => {
    const textLuminance = oklchLuminance(darkPrimary);
    const bgLuminance = oklchLuminanceOverBackdrop(darkPrimary, 0.1, darkBackground);
    const ratio = contrastRatio(textLuminance, bgLuminance);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
