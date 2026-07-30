import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionsView } from "./collections-view";

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("CollectionsView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("loads and renders collections on mount", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        collections: [
          {
            id: "col-1",
            name: "Inbox",
            description: null,
            color: "gray",
            icon: "folder",
            is_favorite: false,
            is_archived: false,
            updated_at: "2026-07-30T00:00:00.000Z",
          },
        ],
      }),
    );

    render(<CollectionsView />);

    expect(await screen.findByText("Inbox")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/collections?view=active");
  });

  it("shows an empty state when there are no collections", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ collections: [] }));

    render(<CollectionsView />);

    expect(await screen.findByText(/create one above/i)).toBeInTheDocument();
  });

  it("filters the visible list client-side as the search box is typed into", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        collections: [
          {
            id: "col-1",
            name: "Inbox",
            description: null,
            color: "gray",
            icon: "folder",
            is_favorite: false,
            is_archived: false,
            updated_at: "2026-07-30T00:00:00.000Z",
          },
          {
            id: "col-2",
            name: "Travel",
            description: null,
            color: "blue",
            icon: "map",
            is_favorite: false,
            is_archived: false,
            updated_at: "2026-07-30T00:00:00.000Z",
          },
        ],
      }),
    );

    render(<CollectionsView />);
    await screen.findByText("Inbox");
    expect(screen.getByText("Travel")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "trav" } });

    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
    expect(screen.getByText("Travel")).toBeInTheDocument();
  });

  it("re-fetches with view=archived when the Archived view is selected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ collections: [] }));
    render(<CollectionsView />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/collections?view=active"));

    fireEvent.change(screen.getByLabelText("View"), { target: { value: "archived" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/collections?view=archived"));
  });

  it("shows a retry-able error state on a failed load", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    render(<CollectionsView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });

  it("renders trashed collections as restore rows, not full collection cards", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        collections: [{ id: "col-1", name: "Old Project" }],
      }),
    );

    render(<CollectionsView />);
    fireEvent.change(screen.getByLabelText("View"), { target: { value: "trashed" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/collections?view=trashed"));
    expect(await screen.findByText("Old Project")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^restore$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("shows Trash-specific empty copy for the trashed view", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ collections: [] }));

    render(<CollectionsView />);
    fireEvent.change(screen.getByLabelText("View"), { target: { value: "trashed" } });

    expect(await screen.findByText(/trash is empty/i)).toBeInTheDocument();
  });
});
