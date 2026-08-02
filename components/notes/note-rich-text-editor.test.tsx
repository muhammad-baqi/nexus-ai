import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";

import { getMarkdown, NoteRichTextEditor } from "./note-rich-text-editor";

// `immediatelyRender: false` (required for Next.js SSR safety) defers the actual editor
// construction past the initial render, so `onEditorReady` fires a tick after `render()`.
async function renderEditor(content: string) {
  const onChange = vi.fn();
  let editor: Editor | undefined;
  render(
    <NoteRichTextEditor
      content={content}
      onChange={onChange}
      onEditorReady={(e) => {
        editor = e;
      }}
    />,
  );
  await waitFor(() => expect(editor).toBeDefined());
  return { onChange, editor: editor! };
}

function lastMarkdown(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls.at(-1)?.[0] as string | undefined;
}

describe("NoteRichTextEditor", () => {
  it("renders real elements (not raw Markdown syntax) for every supported content type", async () => {
    const md = [
      "# Title",
      "",
      "**bold** _italic_ ~~strike~~",
      "",
      "- bullet",
      "",
      "1. numbered",
      "",
      "- [x] done",
      "",
      "> quoted",
      "",
      "[a link](https://example.com)",
    ].join("\n");
    const { editor } = await renderEditor(md);

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("strike").tagName).toBe("S");
    expect(screen.getByText("bullet").closest("ul")).toBeInTheDocument();
    expect(screen.getByText("numbered").closest("ol")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("quoted").closest("blockquote")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "a link" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(editor.isActive).toBeDefined();
  });

  it("round-trips: serialized Markdown is semantically equivalent to the source it was initialized with", async () => {
    const md = "# Title\n\n**bold** text with a [link](https://example.com)";
    const { editor } = await renderEditor(md);

    const roundTripped = getMarkdown(editor);
    expect(roundTripped).toContain("# Title");
    expect(roundTripped).toContain("**bold**");
    expect(roundTripped).toContain("[link](https://example.com)");
  });

  it("clicking Bold after selecting all wraps the selection in ** in the serialized Markdown", async () => {
    const { editor, onChange } = await renderEditor("hello world");

    act(() => {
      editor.commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));

    expect(lastMarkdown(onChange)).toBe("**hello world**");
  });

  it("shows the code-block language select only while the cursor is inside a code block, and changing it updates the block's language", async () => {
    const paragraphThenCode = "not code\n\n```\nconsole.log(1)\n```";
    const { editor, onChange } = await renderEditor(paragraphThenCode);

    // Cursor starts at the very beginning (inside the leading paragraph, not the code block).
    expect(editor.isActive("codeBlock")).toBe(false);
    expect(screen.queryByLabelText("Code block language")).not.toBeInTheDocument();

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    });
    expect(editor.isActive("codeBlock")).toBe(true);
    const select = screen.getByLabelText("Code block language");

    fireEvent.change(select, { target: { value: "javascript" } });

    expect(editor.getAttributes("codeBlock").language).toBe("javascript");
    expect(lastMarkdown(onChange)).toContain("```javascript");
  });

  it("Insert table adds a valid GFM table, and Add row (shown only while inside a table) increases the row count", async () => {
    const { editor, onChange } = await renderEditor("");

    fireEvent.click(screen.getByRole("button", { name: "Insert table" }));

    expect(lastMarkdown(onChange)).toContain("|");
    expect(screen.getByRole("button", { name: "Add row" })).toBeInTheDocument();
    const rowsBefore = editor.getJSON().content?.[0]?.content?.length ?? 0;

    fireEvent.click(screen.getByRole("button", { name: "Add row" }));

    const rowsAfter = editor.getJSON().content?.[0]?.content?.length ?? 0;
    expect(rowsAfter).toBe(rowsBefore + 1);
  });

  it("the Link button is disabled with no selection and enabled once text is selected; submitting the URL form applies a Markdown link", async () => {
    const { editor, onChange } = await renderEditor("hello world");

    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();

    act(() => {
      editor.commands.selectAll();
    });
    expect(screen.getByRole("button", { name: "Link" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Link URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));

    expect(lastMarkdown(onChange)).toBe("[hello world](https://example.com)");
  });

  it("the Image form inserts a Markdown image for an http(s) URL, and does nothing for a javascript: URL", async () => {
    const { onChange } = await renderEditor("");

    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "https://example.com/pic.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(lastMarkdown(onChange)).toContain("![](https://example.com/pic.png)");
  });

  it("renders raw HTML in the source as literal escaped text, not executed markup", () => {
    render(
      <NoteRichTextEditor
        content={"<script>window.__pwned = true;</script>"}
        onChange={() => {}}
      />,
    );

    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/script/)).toBeInTheDocument();
  });
});
