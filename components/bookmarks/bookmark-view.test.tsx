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

// Same reasoning — a real RemindersPanel fires its own /api/items/:id/reminders fetch on mount
// (covered by reminders-panel.test.tsx).
vi.mock("@/components/reminders/reminders-panel", () => ({
  RemindersPanel: () => null,
}));

// Same reasoning — a real ShareControl fires its own GET /api/items/:id fetch on mount.
vi.mock("@/components/sharing/share-control", () => ({
  ShareControl: () => null,
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

  it("a failure on the resumed poll tick after Retry is bounded-retried, not a silent dead end", async () => {
    // Regression test for a self-review finding: the resumed poll after Retry used to bypass
    // the bounded-retry mechanism entirely (a bare setTimeout(load, ...)), so a failure on that
    // one tick would leave the UI stuck on "Fetching metadata…" forever with no further retry.
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...baseItem,
        website_metadata: { ...baseItem.website_metadata, fetch_status: "failed" },
      }),
    );

    render(<BookmarkView itemId="item-1" />);
    await screen.findByText(/metadata unavailable/i);

    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ website_metadata: { ...baseItem.website_metadata, fetch_status: "pending" } }),
      )
      .mockResolvedValueOnce({ ok: false, json: async () => null })
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseItem,
          title: "Real Article Title",
          website_metadata: { ...baseItem.website_metadata, fetch_status: "success" },
        }),
      );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/fetching metadata/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/fetching metadata/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText("Real Article Title")).toBeInTheDocument();
  });

  it("renders no favicon/preview image and no domain link when there's no metadata at all", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, website_metadata: null }),
    );

    render(<BookmarkView itemId="item-1" />);

    await screen.findByText(baseItem.title);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders a video embed instead of the plain OG-image card when the saved URL is a YouTube link", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        ...baseItem,
        website_metadata: {
          ...baseItem.website_metadata,
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          canonical_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          og_image_url: "https://example.com/thumbnail.jpg",
          fetch_status: "success",
        },
      }),
    );

    const { container } = render(<BookmarkView itemId="item-1" />);

    const iframe = await screen.findByTitle(baseItem.title);
    expect(iframe).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("still renders the plain OG-image card when the URL doesn't match a known embed provider", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        ...baseItem,
        website_metadata: {
          ...baseItem.website_metadata,
          og_image_url: "https://example.com/thumbnail.jpg",
          fetch_status: "success",
        },
      }),
    );

    const { container } = render(<BookmarkView itemId="item-1" />);

    await screen.findByText(baseItem.title);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/thumbnail.jpg",
    );
    expect(container.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("does not embed a video from canonical_url when the actually-saved url isn't a video link (a bookmarked page's own <link rel=canonical> is not user-trusted)", async () => {
    // Regression test for a self-review finding: canonical_url is scraped from the bookmarked
    // page's own HTML, so preferring it for embed detection would let any page silently pick
    // what video gets embedded on the owner's bookmark view.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        ...baseItem,
        website_metadata: {
          ...baseItem.website_metadata,
          canonical_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          og_image_url: "https://example.com/thumbnail.jpg",
          fetch_status: "success",
        },
      }),
    );

    const { container } = render(<BookmarkView itemId="item-1" />);

    await screen.findByText(baseItem.title);
    expect(container.querySelector("iframe")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/thumbnail.jpg",
    );
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

  it("a poll failure after a successful initial load leaves the already-rendered bookmark visible, not a full-page error", async () => {
    vi.useFakeTimers();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValueOnce({ ok: false, json: async () => null });

    render(<BookmarkView itemId="item-1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(baseItem.title)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText(baseItem.title)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a load error when the initial fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => null });

    render(<BookmarkView itemId="item-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be loaded/i);
  });
});
