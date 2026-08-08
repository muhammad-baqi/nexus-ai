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
});
