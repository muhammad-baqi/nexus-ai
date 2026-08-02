import { describe, expect, it } from "vitest";

import { toggleTaskAtIndex } from "./toggle-task";

describe("toggleTaskAtIndex", () => {
  it("flips an unchecked item to checked at the given index", () => {
    const result = toggleTaskAtIndex("- [ ] one\n- [ ] two\n", 1);
    expect(result).toBe("- [ ] one\n- [x] two\n");
  });

  it("flips a checked item to unchecked at the given index", () => {
    const result = toggleTaskAtIndex("- [x] one\n- [ ] two\n", 0);
    expect(result).toBe("- [ ] one\n- [ ] two\n");
  });

  it("leaves every other line untouched", () => {
    const result = toggleTaskAtIndex(
      "# Heading\n\n**bold** text\n\n- [ ] a\n- [ ] b\n- [ ] c\n",
      1,
    );
    expect(result).toBe("# Heading\n\n**bold** text\n\n- [ ] a\n- [x] b\n- [ ] c\n");
  });

  it("returns null for an out-of-range index rather than corrupting content", () => {
    expect(toggleTaskAtIndex("- [ ] only one\n", 1)).toBeNull();
    expect(toggleTaskAtIndex("no checkboxes here\n", 0)).toBeNull();
  });

  it("preserves the '-' bullet style rather than remark-stringify's default '*'", () => {
    const result = toggleTaskAtIndex("- [ ] one\n", 0);
    expect(result).toBe("- [x] one\n");
  });

  it("counts task items nested in a blockquote and mixed with an ordered list in true document order", () => {
    // Regression case: an earlier line-scan-regex version of toggleTaskAtIndex miscounted this
    // exact shape (missed the blockquote-nested item and every ordered-list task item) against
    // react-markdown's real rendering order — verified live against the installed remark-gfm.
    const markdown = [
      "- [ ] top level task",
      "",
      "> - [ ] task inside blockquote",
      "",
      "1. [ ] ordered task item",
      "2. [x] ordered task item 2",
      "",
    ].join("\n");

    const flipBlockquoteItem = toggleTaskAtIndex(markdown, 1);
    // Nested-in-blockquote lists get remark-stringify's default "*" bullet regardless of the
    // top-level "-" preference — a minor, accepted cosmetic quirk; what matters here is that
    // *this specific* item (not the top-level or ordered-list ones) is the one that flipped.
    expect(flipBlockquoteItem).toContain("[x] task inside blockquote");
    expect(flipBlockquoteItem).toContain("- [ ] top level task");
    expect(flipBlockquoteItem).toContain("1. [ ] ordered task item");

    const flipFirstOrderedItem = toggleTaskAtIndex(markdown, 2);
    expect(flipFirstOrderedItem).toContain("1. [x] ordered task item");
    expect(flipFirstOrderedItem).toContain("[ ] task inside blockquote");
  });

  it("does not mistake task-marker-looking text inside a fenced code block for a real checkbox", () => {
    const markdown = "- [ ] real task\n\n```\n- [ ] not a real task\n```\n";

    // Only one real checkbox exists — index 1 must be out of range, not the fenced-code text.
    expect(toggleTaskAtIndex(markdown, 1)).toBeNull();

    const result = toggleTaskAtIndex(markdown, 0);
    expect(result).toContain("- [x] real task");
    expect(result).toContain("- [ ] not a real task");
  });
});
