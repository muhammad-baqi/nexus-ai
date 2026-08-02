import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NoteBody } from "./note-body";

describe("NoteBody", () => {
  it("shows a placeholder for an empty body", () => {
    render(<NoteBody content="" />);

    expect(screen.getByText(/no content yet/i)).toBeInTheDocument();
  });

  it("shows a placeholder for a whitespace-only body", () => {
    render(<NoteBody content={"   \n  "} />);

    expect(screen.getByText(/no content yet/i)).toBeInTheDocument();
  });

  it("renders headings as real heading elements", () => {
    render(<NoteBody content={"# Title\n\n## Subtitle"} />);

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Subtitle" })).toBeInTheDocument();
  });

  it("renders bold, italic, and strikethrough as their real elements", () => {
    render(<NoteBody content={"**bold** _italic_ ~~gone~~"} />);

    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("gone").tagName).toBe("DEL");
  });

  it("renders ordered and unordered lists as real list elements", () => {
    render(<NoteBody content={"- one\n- two\n\n1. first\n2. second"} />);

    expect(screen.getByText("one").closest("ul")).toBeInTheDocument();
    expect(screen.getByText("first").closest("ol")).toBeInTheDocument();
  });

  it("renders a GFM table as real table elements", () => {
    render(<NoteBody content={"| A | B |\n| --- | --- |\n| 1 | 2 |"} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("renders a link as a real anchor opening in a new tab", () => {
    render(<NoteBody content={"[Nexus](https://example.com)"} />);

    const link = screen.getByRole("link", { name: "Nexus" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("does not turn a javascript: link into an executable href", () => {
    render(<NoteBody content={"[click me](javascript:alert(1))"} />);

    // Not getByRole("link", ...): react-markdown's default urlTransform sanitizes a
    // javascript: URL down to an empty href, and jsdom doesn't expose an <a> with an empty
    // href under the "link" accessibility role — query by text instead to find the anchor.
    const link = screen.getByText("click me");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).not.toContain("javascript:");
  });

  it("renders task-list items as disabled checkboxes reflecting their checked state", () => {
    render(<NoteBody content={"- [x] Done\n- [ ] Not done"} />);

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[1]).toBeDisabled();
  });

  it("checkboxes become interactive when onToggleTask is provided, and report the clicked checkbox's document-order index", () => {
    const onToggleTask = vi.fn();
    render(<NoteBody content={"- [x] Done\n- [ ] Not done"} onToggleTask={onToggleTask} />);

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).not.toBeDisabled();

    fireEvent.click(checkboxes[1]);
    expect(onToggleTask).toHaveBeenCalledWith(1);
  });

  it("renders a fenced code block with a language tag as highlighted code", () => {
    render(<NoteBody content={"```js\nconst x = 1;\n```"} />);

    const code = document.querySelector("code.language-js");
    expect(code).toBeTruthy();
    expect(code).toHaveClass("hljs");
    expect(code?.textContent).toContain("const x = 1;");
  });

  it("renders raw HTML in the source as literal escaped text, not executed markup", () => {
    render(<NoteBody content={'<script>window.__pwned = true;</script>'} />);

    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/script/)).toBeInTheDocument();
  });
});
