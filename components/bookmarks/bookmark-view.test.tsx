import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookmarkView } from "./bookmark-view";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

// Isolates MoveItemControl's own fetch behavior (already covered by move-item-control.test.tsx)
// from BookmarkView's — a real MoveItemControl fires its own /api/collections fetches on mount,
// which would throw off this file's fetch-call assertions (same reasoning as
// note-editor.test.tsx's identical mock).
vi.mock("@/components/notes/move-item-control", () => ({
  MoveItemControl: () => <div data-testid="move-item-control" />,
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

const baseItem = {
  id: "item-1",
  title: "https://example.com/article",
  description: null,
  is_favorite: false,
  is_archived: false,
  collection_id: "col-1",
  tags: [],
  website_metadata: {
    url: "https://example.com/article",
    canonical_url: "https://example.com/article",
    domain: "example.com",
    og_image_url: null,
    favicon_url: null,
    fetch_status: "pending" as const,
  },
};

describe("BookmarkView", () => {
  beforeEach(() => {
    routerPush.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a 'Fetching metadata…' indicator while fetch_status is pending", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<BookmarkView itemId="item-1" />);

    expect(await screen.findByText(/fetching metadata/i)).toBeInTheDocument();
  });

  it("polls and picks up metadata once it resolves to success, without a manual refresh", async () => {
    vi.useFakeTimers();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseItem,
          title: "Real Article Title",
          website_metadata: { ...baseItem.website_metadata, fetch_status: "success" },
        }),
      );

    render(<BookmarkView itemId="item-1" />);

    // findByText/waitFor poll via a real setInterval, which fake timers freeze — flush the
    // initial mount fetch's chained awaits manually instead of using findByText here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/fetching metadata/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText("Real Article Title")).toBeInTheDocument();
    expect(screen.queryByText(/fetching metadata/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows 'Metadata unavailable' with a Retry action on a failed fetch", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        ...baseItem,
        website_metadata: { ...baseItem.website_metadata, fetch_status: "failed" },
      }),
    );

    render(<BookmarkView itemId="item-1" />);

    expect(await screen.findByText(/metadata unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
  });

  it("Retry calls the retry endpoint and resumes polling", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...baseItem,
        website_metadata: { ...baseItem.website_metadata, fetch_status: "failed" },
      }),
    );

    render(<BookmarkView itemId="item-1" />);
    await screen.findByText(/metadata unavailable/i);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ website_metadata: { ...baseItem.website_metadata, fetch_status: "pending" } }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(await screen.findByText(/fetching metadata/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1/metadata/retry", { method: "POST" });
  });

  it("renders no favicon/preview image and no domain link when there's no metadata at all", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, website_metadata: null }),
    );

    render(<BookmarkView itemId="item-1" />);

    await screen.findByText(baseItem.title);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("lets the user edit the title and description via a plain Edit/Save toggle (no autosave)", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...baseItem,
        website_metadata: { ...baseItem.website_metadata, fetch_status: "success" },
      }),
    );

    render(<BookmarkView itemId="item-1" />);
    await screen.findByText(baseItem.title);

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const titleInput = screen.getByLabelText("Title");
    fireEvent.change(titleInput, { target: { value: "My custom title" } });

    // No PATCH fired just from typing — only on explicit Save.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...baseItem, title: "My custom title", tags: [] }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("My custom title")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "My custom title", description: "" }),
      }),
    );
  });

  it("shows a load error when the initial fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => null });

    render(<BookmarkView itemId="item-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be loaded/i);
  });
});
