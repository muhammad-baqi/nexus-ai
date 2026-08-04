import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardView } from "./dashboard-view";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const emptySection = { data: [], error: null };

function fullDashboardBody(overrides: Record<string, unknown> = {}) {
  return {
    recentItems: emptySection,
    recentlyViewed: emptySection,
    favorites: { data: { collections: [], items: [] }, error: null },
    recentCollections: emptySection,
    statistics: { data: { totalItems: 0, totalCollections: 0, byType: [] }, error: null },
    upcomingReminders: emptySection,
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("DashboardView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetches on mount and renders all six sections", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(fullDashboardBody()));

    render(<DashboardView />);
    await flush();

    expect(screen.getByRole("heading", { name: "Recent Items" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recently Viewed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent Collections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Statistics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upcoming Reminders" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/dashboard", expect.anything());
  });

  it("shows friendly, section-specific empty states for a brand-new account", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(fullDashboardBody()));

    render(<DashboardView />);
    await flush();

    expect(screen.getByText(/save your first note/i)).toBeInTheDocument();
    expect(screen.getByText(/favorite a collection or item/i)).toBeInTheDocument();
    expect(screen.getByText("No upcoming reminders.")).toBeInTheDocument();
  });

  it("renders items in Recent Items and Recently Viewed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(
        fullDashboardBody({
          recentItems: {
            data: [{ id: "item-1", collection_id: "col-1", type: "note", title: "Trip planning", updated_at: new Date().toISOString() }],
            error: null,
          },
          recentlyViewed: {
            data: [{ id: "item-2", collection_id: "col-1", type: "note", title: "Recipe", updated_at: new Date().toISOString(), viewed_at: new Date().toISOString() }],
            error: null,
          },
        }),
      ),
    );

    render(<DashboardView />);
    await flush();

    expect(screen.getByText("Trip planning")).toBeInTheDocument();
    expect(screen.getByText("Recipe")).toBeInTheDocument();
  });

  it("renders favorited collections and items together", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(
        fullDashboardBody({
          favorites: {
            data: {
              collections: [{ id: "col-1", name: "Work", color: null, icon: null }],
              items: [{ id: "item-1", collection_id: "col-1", type: "note", title: "Favorited note", updated_at: new Date().toISOString() }],
            },
            error: null,
          },
        }),
      ),
    );

    render(<DashboardView />);
    await flush();

    expect(screen.getByText("★ Work")).toBeInTheDocument();
    expect(screen.getByText("Favorited note")).toBeInTheDocument();
  });

  it("renders statistics as a numeric summary, not a chart", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(
        fullDashboardBody({
          statistics: {
            data: { totalItems: 24, totalCollections: 3, byType: [{ type: "note", count: 24 }] },
            error: null,
          },
        }),
      ),
    );

    render(<DashboardView />);
    await flush();

    expect(screen.getByText("24 items · 3 Collections")).toBeInTheDocument();
    expect(screen.getByText("24 notes")).toBeInTheDocument();
  });

  it("shows a per-section retryable error without blocking the rest of the dashboard", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(
        fullDashboardBody({
          statistics: { data: null, error: "statistics_failed" },
          recentItems: {
            data: [{ id: "item-1", collection_id: "col-1", type: "note", title: "Trip planning", updated_at: new Date().toISOString() }],
            error: null,
          },
        }),
      ),
    );

    render(<DashboardView />);
    await flush();

    expect(screen.getByText("Trip planning")).toBeInTheDocument();
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(/couldn't load this section/i);
  });

  it("retrying a failed section re-fetches the whole dashboard", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(fullDashboardBody({ statistics: { data: null, error: "statistics_failed" } })))
      .mockResolvedValueOnce(jsonResponse(fullDashboardBody()));

    render(<DashboardView />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await flush();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a whole-page error state (with retry) when the dashboard fetch itself fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(null, false));

    render(<DashboardView />);
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong loading the dashboard/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
