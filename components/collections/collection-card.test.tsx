import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionCard, type Collection } from "./collection-card";

const baseCollection: Collection = {
  id: "col-1",
  name: "Travel",
  description: "Trip planning",
  color: "blue",
  icon: "map",
  is_favorite: false,
  is_archived: false,
  updated_at: "2026-07-30T00:00:00.000Z",
};

function mockFetchSequence(...responses: Array<Partial<Response> & { json?: () => unknown }>) {
  const fn = vi.fn();
  for (const response of responses) {
    fn.mockResolvedValueOnce({ ok: true, json: async () => ({}), ...response });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("CollectionCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => null }));
  });

  it("renders the name and description, fetching stats on mount", async () => {
    mockFetchSequence({ json: async () => ({ total: 3, by_type: {}, last_updated: null }) });
    render(<CollectionCard collection={baseCollection} onChanged={vi.fn()} />);

    expect(screen.getByText("Travel")).toBeInTheDocument();
    expect(screen.getByText("Trip planning")).toBeInTheDocument();
    expect(await screen.findByText(/3 items/i)).toBeInTheDocument();
  });

  it("links the collection name to its detail page", async () => {
    mockFetchSequence({ json: async () => ({ total: 3, by_type: {}, last_updated: null }) });
    render(<CollectionCard collection={baseCollection} onChanged={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Travel" })).toHaveAttribute(
      "href",
      "/collections/col-1",
    );
  });

  it("shows a star for a favorited collection", () => {
    render(
      <CollectionCard collection={{ ...baseCollection, is_favorite: true }} onChanged={vi.fn()} />,
    );

    expect(screen.getByLabelText("Favorited")).toBeInTheDocument();
  });

  it("toggles favorite via PATCH and calls onChanged", async () => {
    const onChanged = vi.fn();
    const fetchMock = mockFetchSequence(
      { json: async () => ({ total: 0, by_type: {}, last_updated: null }) },
      { json: async () => ({ ...baseCollection, is_favorite: true }) },
    );
    render(<CollectionCard collection={baseCollection} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /^favorite$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/collections/col-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ is_favorite: true }),
        }),
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows a delete confirmation with the item count before actually deleting", async () => {
    mockFetchSequence({ json: async () => ({ total: 5, by_type: {}, last_updated: null }) });
    render(<CollectionCard collection={baseCollection} onChanged={vi.fn()} />);
    await screen.findByText(/5 items/i);

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText(/this will move 5 items to trash/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to trash/i })).toBeInTheDocument();
  });

  it("never claims 0 items when the stats fetch itself failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<CollectionCard collection={baseCollection} onChanged={vi.fn()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText(/couldn't confirm how many items/i)).toBeInTheDocument();
    expect(screen.queryByText(/this will move 0 items/i)).not.toBeInTheDocument();
  });

  it("calls DELETE only after confirming", async () => {
    const onChanged = vi.fn();
    const fetchMock = mockFetchSequence(
      { json: async () => ({ total: 1, by_type: {}, last_updated: null }) },
      {},
    );
    render(<CollectionCard collection={baseCollection} onChanged={onChanged} />);
    await screen.findByText(/1 item/i);

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /move to trash/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/collections/col-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("switches into edit mode and saves via PATCH", async () => {
    const onChanged = vi.fn();
    const fetchMock = mockFetchSequence(
      { json: async () => ({ total: 0, by_type: {}, last_updated: null }) },
      { json: async () => ({ ...baseCollection, name: "Trips" }) },
    );
    render(<CollectionCard collection={baseCollection} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Trips" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/collections/col-1",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });
});
