import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagInput, type ItemTag } from "./tag-input";

function mockFetchSequence(...responses: Array<Partial<Response> & { json?: () => unknown }>) {
  const fn = vi.fn();
  for (const response of responses) {
    fn.mockResolvedValueOnce({ ok: true, json: async () => ({}), ...response });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

const baseTags: ItemTag[] = [
  { id: "tag-1", name: "research" },
  { id: "tag-2", name: "javascript" },
];

describe("TagInput", () => {
  it("renders existing tags as chips", () => {
    render(<TagInput itemId="item-1" tags={baseTags} onTagsChange={vi.fn()} />);

    expect(screen.getByText("research")).toBeInTheDocument();
    expect(screen.getByText("javascript")).toBeInTheDocument();
  });

  it("adding a tag calls the attach endpoint and reports the new tag list", async () => {
    const onTagsChange = vi.fn();
    const newTags = [...baseTags, { id: "tag-3", name: "planning" }];
    const fetchMock = mockFetchSequence({ json: async () => ({ tags: newTags }) });
    render(<TagInput itemId="item-1" tags={baseTags} onTagsChange={onTagsChange} />);

    fireEvent.change(screen.getByLabelText("Add tag"), { target: { value: "planning" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/item-1/tags",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "planning" }),
        }),
      ),
    );
    expect(onTagsChange).toHaveBeenCalledWith(newTags);
  });

  it("merges the newly attached tag locally when the server can't confirm the full list", async () => {
    const onTagsChange = vi.fn();
    const fetchMock = mockFetchSequence({
      json: async () => ({ tag: { id: "tag-3", name: "planning" }, tags: null }),
    });
    render(<TagInput itemId="item-1" tags={baseTags} onTagsChange={onTagsChange} />);

    fireEvent.change(screen.getByLabelText("Add tag"), { target: { value: "planning" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(onTagsChange).toHaveBeenCalledWith([...baseTags, { id: "tag-3", name: "planning" }]);
  });

  it("shows an inline error and does not report a change when adding fails", async () => {
    mockFetchSequence({ ok: false, json: async () => ({ error: { message: "Nope." } }) });
    const onTagsChange = vi.fn();
    render(<TagInput itemId="item-1" tags={baseTags} onTagsChange={onTagsChange} />);

    fireEvent.change(screen.getByLabelText("Add tag"), { target: { value: "planning" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it("removing a tag optimistically updates, then calls the detach endpoint", async () => {
    const onTagsChange = vi.fn();
    const remaining = [baseTags[1]];
    const fetchMock = mockFetchSequence({ json: async () => ({ tags: remaining }) });
    render(<TagInput itemId="item-1" tags={baseTags} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByLabelText("Remove tag research"));

    // Optimistic: called immediately with the tag removed, before the request resolves.
    expect(onTagsChange).toHaveBeenNthCalledWith(1, remaining);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/item-1/tags/tag-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(onTagsChange).toHaveBeenNthCalledWith(2, remaining);
  });

  it("keeps the optimistic removal when the server can't confirm the full list", async () => {
    const onTagsChange = vi.fn();
    mockFetchSequence({ json: async () => ({ tags: null }) });
    render(<TagInput itemId="item-1" tags={baseTags} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByLabelText("Remove tag research"));

    // Optimistic removal (call 1) is never followed by a second call re-adding it back —
    // `tags: null` means "detach succeeded, but couldn't confirm the list," not "it failed."
    await waitFor(() => expect(onTagsChange).toHaveBeenCalledTimes(1));
    expect(onTagsChange).toHaveBeenCalledWith([baseTags[1]]);
  });

  it("rolls back and shows an error when removing a tag fails", async () => {
    mockFetchSequence({ ok: false, json: async () => ({ error: { message: "Nope." } }) });
    const onTagsChange = vi.fn();
    render(<TagInput itemId="item-1" tags={baseTags} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByLabelText("Remove tag research"));

    expect(onTagsChange).toHaveBeenNthCalledWith(1, [baseTags[1]]);
    await waitFor(() => expect(onTagsChange).toHaveBeenNthCalledWith(2, baseTags));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
  });
});
