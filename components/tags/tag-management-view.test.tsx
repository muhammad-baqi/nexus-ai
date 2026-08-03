import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagManagementView } from "./tag-management-view";

function mockFetchSequence(...responses: Array<Partial<Response> & { json?: () => unknown }>) {
  const fn = vi.fn();
  for (const response of responses) {
    fn.mockResolvedValueOnce({ ok: true, json: async () => ({}), ...response });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

const baseTags = [
  { id: "tag-1", name: "javascript" },
  { id: "tag-2", name: "research" },
];

describe("TagManagementView", () => {
  it("lists the caller's tags on mount", async () => {
    mockFetchSequence({ json: async () => ({ tags: baseTags }) });
    render(<TagManagementView />);

    expect(await screen.findByText("javascript", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("research", { selector: "span" })).toBeInTheDocument();
  });

  it("shows an empty state when there are no tags", async () => {
    mockFetchSequence({ json: async () => ({ tags: [] }) });
    render(<TagManagementView />);

    expect(await screen.findByText(/no tags yet/i)).toBeInTheDocument();
  });

  it("renames a tag and reflects the change after reload", async () => {
    mockFetchSequence(
      { json: async () => ({ tags: baseTags }) },
      { json: async () => ({ id: "tag-1", name: "js" }) },
      { json: async () => ({ tags: [{ id: "tag-1", name: "js" }, baseTags[1]] }) },
    );
    render(<TagManagementView />);
    await screen.findByText("javascript", { selector: "span" });

    fireEvent.click(screen.getAllByRole("button", { name: /^rename$/i })[0]);
    fireEvent.change(screen.getByLabelText("Tag name"), { target: { value: "js" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("js", { selector: "span" })).toBeInTheDocument();
  });

  it("shows an inline error when a rename hits a duplicate name", async () => {
    mockFetchSequence(
      { json: async () => ({ tags: baseTags }) },
      { ok: false, json: async () => ({ error: { message: "You already have this tag." } }) },
    );
    render(<TagManagementView />);
    await screen.findByText("javascript", { selector: "span" });

    fireEvent.click(screen.getAllByRole("button", { name: /^rename$/i })[0]);
    fireEvent.change(screen.getByLabelText("Tag name"), { target: { value: "research" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have this tag.");
  });

  it("deletes a tag after confirmation and removes it from the list", async () => {
    mockFetchSequence(
      { json: async () => ({ tags: baseTags }) },
      {},
      { json: async () => ({ tags: [baseTags[1]] }) },
    );
    render(<TagManagementView />);
    await screen.findByText("javascript", { selector: "span" });

    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(await screen.findByRole("button", { name: /^delete tag$/i }));

    await waitFor(() => expect(screen.queryByText("javascript")).not.toBeInTheDocument());
    expect(screen.getByText("research", { selector: "span" })).toBeInTheDocument();
  });

  it("merges a tag into another and removes the source from the list", async () => {
    mockFetchSequence(
      { json: async () => ({ tags: baseTags }) },
      { json: async () => ({ merged: true, target_tag_id: "tag-2" }) },
      { json: async () => ({ tags: [baseTags[1]] }) },
    );
    render(<TagManagementView />);
    await screen.findByText("javascript", { selector: "span" });

    fireEvent.change(screen.getByLabelText("Merge javascript into"), {
      target: { value: "tag-2" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^merge$/i })[0]);

    await waitFor(() => expect(screen.queryByText("javascript")).not.toBeInTheDocument());
  });
});
