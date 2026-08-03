import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MoveItemControl } from "./move-item-control";

const CURRENT_ID = "collection-current";
const OTHER_ID = "collection-other";

type Collection = { id: string; name: string; is_archived: boolean };

function mockFetch({
  active = [] as Collection[],
  archived = [] as Collection[],
  patch,
}: {
  active?: Collection[];
  archived?: Collection[];
  patch?: { ok: boolean; body: unknown };
}) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PATCH") {
      const response = patch ?? { ok: true, body: {} };
      return Promise.resolve({ ok: response.ok, json: async () => response.body } as Response);
    }
    if (url.includes("view=active")) {
      return Promise.resolve({ ok: true, json: async () => ({ collections: active }) } as Response);
    }
    if (url.includes("view=archived")) {
      return Promise.resolve({ ok: true, json: async () => ({ collections: archived }) } as Response);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const currentCollection: Collection = { id: CURRENT_ID, name: "Inbox", is_archived: false };
const otherCollection: Collection = { id: OTHER_ID, name: "Research", is_archived: false };

describe("MoveItemControl", () => {
  it("preselects the current collection, merging active and archived lists", async () => {
    mockFetch({
      active: [currentCollection, otherCollection],
      archived: [{ id: "collection-archived", name: "Old stuff", is_archived: true }],
    });

    render(
      <MoveItemControl itemId="item-1" currentCollectionId={CURRENT_ID} onMoved={vi.fn()} />,
    );

    const select = await screen.findByLabelText("Collection");
    await waitFor(() => expect(screen.getByText("Old stuff (Archived)")).toBeInTheDocument());
    expect(select).toHaveValue(CURRENT_ID);
  });

  it("moving to a different collection PATCHes collection_id and reports the new id", async () => {
    const onMoved = vi.fn();
    const fetchMock = mockFetch({
      active: [currentCollection, otherCollection],
      patch: { ok: true, body: {} },
    });

    render(
      <MoveItemControl itemId="item-1" currentCollectionId={CURRENT_ID} onMoved={onMoved} />,
    );

    await screen.findByLabelText("Collection");
    fireEvent.change(screen.getByLabelText("Collection"), { target: { value: OTHER_ID } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/item-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ collection_id: OTHER_ID }),
        }),
      ),
    );
    expect(onMoved).toHaveBeenCalledWith(OTHER_ID);
  });

  it("shows an inline error, reverts the selection, and refreshes the list when the move fails", async () => {
    const onMoved = vi.fn();
    const fetchMock = mockFetch({
      active: [currentCollection, otherCollection],
      patch: { ok: false, body: { error: { message: "This collection doesn't exist." } } },
    });

    render(
      <MoveItemControl itemId="item-1" currentCollectionId={CURRENT_ID} onMoved={onMoved} />,
    );

    await screen.findByLabelText("Collection");
    fireEvent.change(screen.getByLabelText("Collection"), { target: { value: OTHER_ID } });

    expect(await screen.findByRole("alert")).toHaveTextContent("This collection doesn't exist.");
    expect(onMoved).not.toHaveBeenCalled();
    // Controlled by the (unchanged) currentCollectionId prop — reverts without extra state.
    expect(screen.getByLabelText("Collection")).toHaveValue(CURRENT_ID);
    // Initial mount fetched active+archived (2 calls); the failed PATCH (3rd) triggers a refresh
    // (2 more calls) so a since-trashed/deleted option can disappear.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  });
});
