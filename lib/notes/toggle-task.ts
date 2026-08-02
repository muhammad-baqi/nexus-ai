import type { ListItem, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";

// Parsing (to find/flip the right checkbox) and serializing (to write it back) both go through
// the exact same remark-gfm pipeline react-markdown itself renders with — not a hand-rolled
// regex. An earlier line-scan-regex version of this function miscounted checkboxes against
// react-markdown's real rendering order for realistic content (ordered-list task items, a task
// item nested in a blockquote, a fenced code block containing literal "- [ ] text" that looks
// like a task marker but isn't one) — self-review caught this by diffing the regex's matches
// against the actual parsed AST for exactly such a sample. Reusing remark-gfm's own parser is
// the only way to guarantee "the Nth checkbox this function finds" and "the Nth checkbox
// react-markdown renders" always agree, since they're now the same code.
// bullet: "-" matches this app's own Markdown style elsewhere (the WYSIWYG editor's
// tiptap-markdown config, and every hand-written example in this codebase) — remark-stringify
// otherwise defaults to "*", which would re-style a note's *entire* bullet-list syntax the
// moment a single checkbox in it was toggled from the read-only view.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, { bullet: "-" });

// Flips the `index`-th task-list checkbox (0-based, document order — the same order
// react-markdown renders them in) in `markdown` and returns the updated string, or null if
// there's no checkbox at that index — the caller's cue to no-op rather than write back
// unrelated/corrupted content.
export function toggleTaskAtIndex(markdown: string, index: number): string | null {
  const tree = processor.parse(markdown) as Root;
  let count = 0;
  let target: ListItem | undefined;

  visit(tree, "listItem", (node: ListItem) => {
    if (typeof node.checked !== "boolean") return;
    if (count === index) {
      target = node;
    }
    count++;
  });

  if (!target) return null;

  target.checked = !target.checked;
  return String(processor.stringify(tree));
}
