import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { CollectionDetailView } from "./collection-detail-view";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const baseCollection = { id: "col-1", name: "Travel", description: "Trip planning" };

describe("CollectionDetailView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("loads and renders the collection name and its notes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(
        jsonResponse({ items: [{ id: "item-1", title: "Packing list", updated_at: "" }] }),
      );
    });

    render(<CollectionDetailView collectionId="col-1" />);

    expect(await screen.findByText("Travel")).toBeInTheDocument();
    expect(screen.getByText("Packing list")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/items?collection_id=col-1");
  });

  it("falls back to 'Untitled Note' for a note with a blank title", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(jsonResponse({ items: [{ id: "item-1", title: "", updated_at: "" }] }));
    });

    render(<CollectionDetailView collectionId="col-1" />);

    expect(await screen.findByText("Untitled Note")).toBeInTheDocument();
  });

  it("shows an empty state when the collection has no notes yet", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(jsonResponse({ items: [] }));
    });

    render(<CollectionDetailView collectionId="col-1" />);

    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();
  });

  it("'New Note' POSTs with the current collection_id and navigates to the created item", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(jsonResponse({ id: "item-2" }, true));
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(jsonResponse({ items: [] }));
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText(/no notes yet/i);

    fireEvent.click(screen.getByRole("button", { name: /new note/i }));

    expect(await screen.findByRole("button", { name: /new note/i })).not.toBeDisabled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ collection_id: "col-1" }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/items/item-2");
  });

  it("shows a retry-able error state on a failed load", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    render(<CollectionDetailView collectionId="col-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });

  it("hides archived items by default; 'Show archived' reveals them with an (Archived) label", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: "item-1", title: "Active note", updated_at: "", is_favorite: false, is_archived: false },
            { id: "item-2", title: "Old note", updated_at: "", is_favorite: false, is_archived: true },
          ],
        }),
      );
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText("Active note");

    expect(screen.queryByText("Old note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show archived \(1\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show archived \(1\)/i }));

    expect(screen.getByText("Old note")).toBeInTheDocument();
    expect(screen.getByText("(Archived)")).toBeInTheDocument();
  });

  it("shows a star marker for a favorited item", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: "item-1", title: "Starred note", updated_at: "", is_favorite: true, is_archived: false },
          ],
        }),
      );
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText("Starred note");

    expect(screen.getByLabelText("Favorited")).toBeInTheDocument();
  });
});
