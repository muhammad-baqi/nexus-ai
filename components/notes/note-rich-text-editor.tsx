"use client";

import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Image } from "@tiptap/extension-image";
import { isAllowedUri } from "@tiptap/extension-link";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Code2,
  Link2,
  Unlink,
  Image as ImageIcon,
  Table as TableIcon,
  Rows3,
  Columns3,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const lowlight = createLowlight(common);

// tiptap-markdown doesn't ship a module augmentation for @tiptap/core's generic `Storage`
// type, so `editor.storage.markdown` isn't visible to TypeScript without this cast — the
// runtime shape is documented in the package's own README example.
export function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
}

// Kept in sync with the grammars lowlight's `common` bundle actually registers, so every
// selectable language really highlights (and matches what NoteBody/rehype-highlight renders).
const CODE_LANGUAGES = [
  { value: "", label: "Plain text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "bash", label: "Bash" },
  { value: "json", label: "JSON" },
  { value: "xml", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
] as const;

type Props = {
  content: string;
  onChange: (markdown: string) => void;
  // Test-only escape hatch: exposes the underlying Tiptap editor instance so tests can drive
  // selection/commands directly (simulating real contenteditable typing isn't reliable in
  // jsdom). Not used by NoteEditor itself.
  onEditorReady?: (editor: Editor) => void;
};

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function NoteRichTextEditor({ content, onChange, onEditorReady }: Props) {
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageFormOpen, setImageFormOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: { openOnClick: false, autolink: true },
      }),
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Markdown.configure({
        html: false,
        linkify: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    onCreate: ({ editor }) => onEditorReady?.(editor),
    onUpdate: ({ editor }) => {
      onChange(getMarkdown(editor));
    },
  });

  if (!editor) {
    return null;
  }

  // editor is non-null here (guarded above) — the `!` below is only needed because these are
  // separate closures, which TS doesn't narrow through; both only ever run after this render,
  // in which the guard already passed.
  function applyLink() {
    const url = linkUrl.trim();
    if (url) {
      editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkFormOpen(false);
    setLinkUrl("");
  }

  function applyImage() {
    const url = imageUrl.trim();
    // Image (unlike Link, whose own setLink already runs this check) has no built-in URI
    // validation — without this, a javascript:/data: URL typed here would be stored verbatim
    // in the note's Markdown, relying entirely on the read-side renderer's sanitizer.
    if (url && isAllowedUri(url)) {
      editor!.chain().focus().setImage({ src: url, alt: "" }).run();
    }
    setImageFormOpen(false);
    setImageUrl("");
  }

  const inTable = editor.isActive("table");
  const inCodeBlock = editor.isActive("codeBlock");
  const canLink = !editor.state.selection.empty || editor.isActive("link");

  return (
    <div className="flex flex-col gap-2">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-muted/40 p-1"
      >
        <ToolbarButton
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 />
        </ToolbarButton>
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough />
        </ToolbarButton>
        <ToolbarButton
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton
          label="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote />
        </ToolbarButton>
        <ToolbarButton
          label="Horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={inCodeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
          disabled={!canLink}
          onClick={() => {
            setLinkUrl(editor.getAttributes("link").href ?? "");
            setLinkFormOpen((open) => !open);
            setImageFormOpen(false);
          }}
        >
          <Link2 />
        </ToolbarButton>
        {editor.isActive("link") && (
          <ToolbarButton
            label="Remove link"
            onClick={() => editor.chain().focus().unsetLink().run()}
          >
            <Unlink />
          </ToolbarButton>
        )}
        {/* By-URL, not by-upload: embedding an uploaded Image Knowledge Item by reference
            (docs/01_MVP/Knowledge_Items.md's Attachments model) needs Day 5's Image uploads,
            which don't exist yet. Matches the same interim stand-in note-body.tsx already
            documents for hand-typed `![]()` Markdown. */}
        <ToolbarButton
          label="Image"
          onClick={() => {
            setImageUrl("");
            setImageFormOpen((open) => !open);
            setLinkFormOpen(false);
          }}
        >
          <ImageIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Insert table"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableIcon />
        </ToolbarButton>
        {inTable && (
          <div className="flex items-center gap-1 border-l border-input pl-1" role="group" aria-label="Table">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <Rows3 /> Add row
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              Delete row
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <Columns3 /> Add column
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              Delete column
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 /> Delete table
            </Button>
          </div>
        )}
        {inCodeBlock && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Language
            <select
              aria-label="Code block language"
              className="h-6 rounded-md border border-input bg-background px-1 text-xs"
              value={editor.getAttributes("codeBlock").language ?? ""}
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("codeBlock", { language: e.target.value || null })
                  .run()
              }
            >
              {CODE_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {linkFormOpen && (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Link URL"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") setLinkFormOpen(false);
            }}
            autoFocus
          />
          <Button type="button" size="sm" onClick={applyLink}>
            Add link
          </Button>
        </div>
      )}
      {imageFormOpen && (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Image URL"
            placeholder="https://example.com/image.png"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyImage();
              if (e.key === "Escape") setImageFormOpen(false);
            }}
            autoFocus
          />
          <Button type="button" size="sm" onClick={applyImage}>
            Add image
          </Button>
        </div>
      )}

      <EditorContent
        editor={editor}
        aria-label="Body"
        className={cn(
          "min-h-40 rounded-md border border-input bg-transparent px-3 py-2 text-sm",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          "[&_.ProseMirror]:min-h-40 [&_.ProseMirror]:outline-none",
          "[&_h1]:mt-2 [&_h1]:text-2xl [&_h1]:font-semibold",
          "[&_h2]:mt-2 [&_h2]:text-xl [&_h2]:font-semibold",
          "[&_h3]:mt-2 [&_h3]:text-lg [&_h3]:font-semibold",
          "[&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:list-decimal [&_ol]:pl-6",
          "[&_ul[data-type='taskList']]:list-none [&_ul[data-type='taskList']]:pl-0",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-sm",
          "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
          "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
          "[&_img]:max-w-full [&_img]:rounded-md",
          "[&_a]:underline",
        )}
      />
    </div>
  );
}
