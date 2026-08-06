// A small, fully-specified frontmatter format this app controls both ends of — written by
// build-markdown-export.ts, read back by lib/settings/import/run-import-job.ts's Markdown-ZIP
// path. Not a general YAML/Markdown parser (this app doesn't round-trip arbitrary third-party
// Markdown vaults — that's explicitly out of scope per Settings.md), just `key: value` pairs
// bounded by `---` fences, which is all a value set this app itself wrote ever needs.

export function serializeFrontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value.replace(/\n/g, " ")}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export function parseFrontmatter(content: string): { fields: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: content };

  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf(": ");
    if (separatorIndex === -1) continue;
    fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 2);
  }
  return { fields, body: match[2] };
}
