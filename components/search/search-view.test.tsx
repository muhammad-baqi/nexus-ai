import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchView } from "./search-view";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function mockFetchRouter(overrides: Record<string, unknown> = {}) {
  (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.startsWith("/api/collections")) {
      return Promise.resolve(jsonResponse(overrides.collections ?? { collections: [] }));
    }
    if (url.startsWith("/api/tags")) {
      return Promise.resolve(jsonResponse(overrides.tags ?? { tags: [] }));
    }
    if (url.startsWith("/api/recent-searches")) {
      return Promise.resolve(jsonResponse(overrides.recentSearches ?? { searches: [] }));
    }
    if (url.startsWith("/api/items")) {
      return Promise.resolve(jsonResponse(overrides.items ?? { items: [], total: 0, page: 1, limit: 20 }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("SearchView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches items on mount with no query (never a blank screen)", async () => {
    mockFetchRouter({
      items: {
        items: [{ id: "item-1", collection_id: "col-1", type: "note", title: "Recent note", is_favorite: false, is_archived: false, created_at: "", updated_at: "" }],
        total: 1,
        page: 1,
        limit: 20,
      },
    });

    render(<SearchView />);
    await flush(250);

    expect(screen.getByText("Recent note")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/items\?/), expect.anything());
  });

  it("debounces search-as-you-type — no fetch mid-typing, one fetch after the debounce settles", async () => {
    mockFetchRouter();
    render(<SearchView />);
    await flush(250); // initial mount fetch

    (fetch as ReturnType<typeof vi.fn>).mockClear();
    const input = screen.getByPlaceholderText("Search your notes…");

    fireEvent.change(input, { target: { value: "z" } });
    await flush(100);
    fireEvent.change(input, { target: { value: "ze" } });
    await flush(100);
    fireEvent.change(input, { target: { value: "zep" } });
    expect(fetch).not.toHaveBeenCalled();

    await flush(250);
    const itemsCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
      String(url).startsWith("/api/items"),
    );
    expect(itemsCalls).toHaveLength(1);
    expect(itemsCalls[0][0]).toContain("q=zep");
  });

  it("shows recent searches on focus when the query is empty, hides them once typing starts", async () => {
    mockFetchRouter({ recentSearches: { searches: ["old query"] } });
    render(<SearchView />);
    await flush(250);

    const input = screen.getByPlaceholderText("Search your notes…");
    fireEvent.focus(input);
    await flush(0);

    expect(screen.getByText("old query")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "x" } });
    expect(screen.queryByText("old query")).not.toBeInTheDocument();
  });

  it("clicking a recent search fills the input and re-runs the search", async () => {
    mockFetchRouter({ recentSearches: { searches: ["zephyrus"] } });
    render(<SearchView />);
    await flush(250);

    const input = screen.getByPlaceholderText("Search your notes…") as HTMLInputElement;
    fireEvent.focus(input);
    await flush(0);
    fireEvent.click(screen.getByText("zephyrus"));

    expect(input.value).toBe("zephyrus");
    await flush(250);
    const itemsCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
      String(url).startsWith("/api/items"),
    );
    expect(itemsCalls.at(-1)?.[0]).toContain("q=zephyrus");
  });

  it("records a recent search after the query settles (distinct from the live-results debounce)", async () => {
    mockFetchRouter();
    render(<SearchView />);
    await flush(250);

    const input = screen.getByPlaceholderText("Search your notes…");
    fireEvent.change(input, { target: { value: "zephyrus" } });
    await flush(250); // live-results debounce fires, but not the longer settle timer yet

    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([url]) => String(url) === "/api/recent-searches",
      ),
    ).toBe(false);

    await flush(1000); // total 1250ms since the keystroke, past RECENT_SEARCH_SETTLE_MS (1200)

    const recordCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]) => String(url) === "/api/recent-searches",
    );
    expect(recordCall).toBeDefined();
    expect(JSON.parse((recordCall![1] as RequestInit).body as string)).toEqual({ query: "zephyrus" });
  });

  it("filtering by type adds type= to the request and resets to page 1", async () => {
    mockFetchRouter();
    render(<SearchView />);
    await flush(250);
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "note" } });
    await flush(250);

    const itemsCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
      String(url).startsWith("/api/items"),
    );
    expect(itemsCalls.at(-1)?.[0]).toContain("type=note");
  });

  it("shows a 'no results' state distinct from the empty-query browse state", async () => {
    mockFetchRouter({ items: { items: [], total: 0, page: 1, limit: 20 } });
    render(<SearchView />);
    await flush(250);

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "note" } });
    await flush(250);

    expect(screen.getByText(/no results — try removing some filters/i)).toBeInTheDocument();
  });

  it("shows a retryable error state distinct from an empty result set", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/items")) return Promise.resolve(jsonResponse(null, false));
      if (url.startsWith("/api/collections")) return Promise.resolve(jsonResponse({ collections: [] }));
      if (url.startsWith("/api/tags")) return Promise.resolve(jsonResponse({ tags: [] }));
      return Promise.resolve(jsonResponse({}));
    });

    render(<SearchView />);
    await flush(250);

    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
