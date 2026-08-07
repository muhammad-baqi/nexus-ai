import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CodeSnippetView } from "./code-snippet-view";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

// Isolates MoveItemControl's own fetch behavior from this view's, same reasoning
// bookmark-view.test.tsx's identical mock documents.
vi.mock("@/components/notes/move-item-control", () => ({
  MoveItemControl: () => <div data-testid="move-item-control" />,
}));

// Same reasoning — a real RemindersPanel fires its own /api/items/:id/reminders fetch on mount
// (covered by reminders-panel.test.tsx).
vi.mock("@/components/reminders/reminders-panel", () => ({
  RemindersPanel: () => null,
}));

// CodeMirror itself is a well-tested third-party library — this file tests CodeSnippetView's own
// logic (fetch/edit/save/copy), not CodeMirror's rendering, which jsdom can't meaningfully
// exercise anyway. Stands in as a plain textarea wired to the same value/onChange/language/
// readOnly contract components/code-snippets/code-editor.tsx exposes.
vi.mock("@/components/code-snippets/code-editor", () => ({
  CodeEditor: ({
    value,
    onChange,
    readOnly,
    language,
  }: {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    language: string;
  }) => (
    <textarea
      data-testid="code-editor"
      data-language={language}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

const baseItem = {
  id: "item-1",
  title: "Binary search",
  description: null,
  is_favorite: false,
  is_archived: false,
  collection_id: "col-1",
  tags: [],
  code_snippet_data: { language: "python", code_content: "def search(): pass" },
};

describe("CodeSnippetView", () => {
  beforeEach(() => {
    routerPush.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders pre-filled with the snippet's stored language/code_content", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<CodeSnippetView itemId="item-1" />);

    const editor = await screen.findByTestId("code-editor");
    expect(editor).toHaveValue("def search(): pass");
    expect(editor).toHaveAttribute("data-language", "python");
    expect(screen.getByText("Python")).toBeInTheDocument();
  });

  it("typing doesn't autosave — no PATCH fires until Save is clicked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<CodeSnippetView itemId="item-1" />);
    await screen.findByTestId("code-editor");

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByTestId("code-editor"), { target: { value: "def search(): return True" } });

    expect(fetch).not.toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ ...baseItem, code_snippet_data: { language: "python", code_content: "def search(): return True" } }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("toggling Favorite doesn't blank the visible code (PATCH response omits code_snippet_data when it wasn't touched)", async () => {
    // Regression test: a favorite/archive PATCH never includes code_snippet_data in its response
    // (app/api/items/[id]/route.ts only writes/returns it when the request actually touched
    // language/code_content) — mergeServerItem must fall back to the previous value, same as it
    // already does for `tags`, or the code editor disappears on every toggle click.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<CodeSnippetView itemId="item-1" />);
    await screen.findByTestId("code-editor");

    const itemWithoutSnippetData: Record<string, unknown> = { ...baseItem, is_favorite: true };
    delete itemWithoutSnippetData.code_snippet_data;
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(itemWithoutSnippetData));
    fireEvent.click(screen.getByRole("button", { name: /^favorite$/i }));

    const editor = await screen.findByTestId("code-editor");
    expect(editor).toHaveValue("def search(): pass");
  });

  it("Copy button copies the exact raw code_content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<CodeSnippetView itemId="item-1" />);
    await screen.findByTestId("code-editor");

    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(writeText).toHaveBeenCalledWith("def search(): pass");
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("an unrecognized stored language value renders without crashing", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, code_snippet_data: { language: "cobol-77", code_content: "IDENTIFICATION DIVISION." } }),
    );

    render(<CodeSnippetView itemId="item-1" />);

    const editor = await screen.findByTestId("code-editor");
    expect(editor).toHaveValue("IDENTIFICATION DIVISION.");
    expect(editor).toHaveAttribute("data-language", "cobol-77");
  });
});
