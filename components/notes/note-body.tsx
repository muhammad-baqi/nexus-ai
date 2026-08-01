/* eslint-disable @typescript-eslint/no-unused-vars -- every renderer below must destructure
   react-markdown's `node` (a hast node) out of props before spreading the rest onto a real DOM
   element; passing it through would produce an "unknown DOM attribute" React warning at runtime.
   This is react-markdown's own documented pattern, not a mistake. */
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

// Task-list checkboxes (`- [ ]`/`- [x]`) are rendered automatically by mdast-util-to-hast as
// `<input type="checkbox" disabled checked={...}>` — no custom `li`/`input` renderer needed.
// Toggling from this view is a separate, later feature; these stay disabled until then.
const components: Components = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener" className="underline" />
  ),
  // A raw <img>, not next/image: the source is arbitrary user-typed Markdown syntax today (real
  // "upload → embed by reference" attachments arrive with Day 5's Image uploads) — the URL/host
  // isn't known at build time, so next/image's remote-pattern allowlist can't cover it.
  // eslint-disable-next-line @next/next/no-img-element
  img: ({ node, alt, ...props }) => <img {...props} alt={alt ?? ""} className="max-w-full rounded-md" />,
  pre: ({ node, children, ...props }) => (
    <pre {...props} className="overflow-x-auto rounded-lg bg-muted p-3 text-sm">
      {children}
    </pre>
  ),
  code: ({ node, className, children, ...props }) => {
    const language = /language-(\w+)/.exec(className ?? "")?.[1];
    return (
      <code {...props} className={className}>
        {language && (
          <span className="mb-1 block text-xs text-muted-foreground" aria-hidden="true">
            {language}
          </span>
        )}
        {children}
      </code>
    );
  },
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th {...props} className="border border-border px-2 py-1 text-left font-semibold" />
  ),
  td: ({ node, ...props }) => <td {...props} className="border border-border px-2 py-1" />,
  h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-semibold" />,
  h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-semibold" />,
  h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-semibold" />,
  ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-6" />,
  ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-6" />,
  blockquote: ({ node, ...props }) => (
    <blockquote {...props} className="border-l-2 border-border pl-3 text-muted-foreground" />
  ),
};

type Props = {
  content: string;
};

export function NoteBody({ content }: Props) {
  if (!content.trim()) {
    return <p className="text-muted-foreground text-sm">No content yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
