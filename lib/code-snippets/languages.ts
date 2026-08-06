import { langs } from "@uiw/codemirror-extensions-langs";
import type { Extension } from "@uiw/react-codemirror";

// A curated subset of the ~150 keys @uiw/codemirror-extensions-langs exposes (mostly raw file
// extensions, e.g. "js"/"cs"/"rb") — Code_Snippets.md calls for "a standard supported-language
// list", not every extension that library happens to recognize. `value` is what's actually stored
// in code_snippet_data.language: a stable, human-readable identifier independent of this
// particular library's internal key naming, so swapping syntax-highlighting libraries later
// wouldn't require a data migration.
export const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript", langKey: "js" },
  { value: "typescript", label: "TypeScript", langKey: "ts" },
  { value: "python", label: "Python", langKey: "python" },
  { value: "java", label: "Java", langKey: "java" },
  { value: "c", label: "C", langKey: "c" },
  { value: "cpp", label: "C++", langKey: "cpp" },
  { value: "csharp", label: "C#", langKey: "cs" },
  { value: "go", label: "Go", langKey: "go" },
  { value: "rust", label: "Rust", langKey: "rs" },
  { value: "ruby", label: "Ruby", langKey: "rb" },
  { value: "php", label: "PHP", langKey: "php" },
  { value: "swift", label: "Swift", langKey: "swift" },
  { value: "kotlin", label: "Kotlin", langKey: "kt" },
  { value: "html", label: "HTML", langKey: "html" },
  { value: "css", label: "CSS", langKey: "css" },
  { value: "sql", label: "SQL", langKey: "sql" },
  { value: "shell", label: "Shell", langKey: "sh" },
  { value: "json", label: "JSON", langKey: "json" },
  { value: "yaml", label: "YAML", langKey: "yaml" },
  { value: "markdown", label: "Markdown", langKey: "markdown" },
  // No langKey — CodeMirror renders it with no language extension, i.e. plain text. Also the
  // fallback target below for any value not in this list at all.
  { value: "plaintext", label: "Plain Text", langKey: undefined },
] as const satisfies readonly { value: string; label: string; langKey: keyof typeof langs | undefined }[];

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["value"];

// Explicit Map<string, ...> (not inferred from the literal-typed entries) so lookups can take any
// runtime string, including legacy/unrecognized values from stored data.
const LANG_KEY_BY_VALUE = new Map<string, (typeof SUPPORTED_LANGUAGES)[number]["langKey"]>(
  SUPPORTED_LANGUAGES.map((entry) => [entry.value, entry.langKey]),
);

// Error States (Code_Snippets.md): "Unsupported/unrecognized language selection: falls back to
// plain-text rendering... rather than failing to save or display." Any value not in the curated
// list above — including legacy/foreign data — resolves to `undefined` here, which CodeMirror
// renders with no syntax highlighting extension at all, i.e. plain text. Not a separate code path.
export function resolveLanguageExtension(language: string): Extension | undefined {
  const langKey = LANG_KEY_BY_VALUE.get(language);
  if (!langKey) return undefined;
  const factory = langs[langKey];
  return factory ? factory() : undefined;
}
