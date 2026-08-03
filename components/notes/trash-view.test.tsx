import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrashView } from "./trash-view";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("TrashView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetches the unified Trash endpoint and renders both trashed items and collections", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        items: [{ id: "item-1", title: "Trip planning" }],
        collections: [{ id: "col-1", name: "Old Project" }],
      }),
    );

    render(<TrashView />);

    expect(await screen.findByText("Trip planning")).toBeInTheDocument();
    expect(screen.getByText("Old Project")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/trash");
  });

  it("shows an empty state only when both items and collections are empty", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ items: [], collections: [] }),
    );

    render(<TrashView />);

    expect(await screen.findByText(/trash is empty/i)).toBeInTheDocument();
  });

  it("shows a retry-able error state on a failed load", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    render(<TrashView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });

  it("removes an item row and shows its status message after it's restored", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: "item-1", title: "Trip planning" }], collections: [] }),
      )
      .mockResolvedValueOnce(jsonResponse({ rehomed: false }))
      .mockResolvedValueOnce(jsonResponse({ items: [], collections: [] }));

    render(<TrashView />);
    await screen.findByText("Trip planning");

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => expect(screen.getByText(/was restored\.$/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/trash is empty/i)).toBeInTheDocument());
  });

  it("removes an item row after it's permanently deleted", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: "item-1", title: "Trip planning" }], collections: [] }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ items: [], collections: [] }));

    render(<TrashView />);
    await screen.findByText("Trip planning");

    fireEvent.click(screen.getByRole("button", { name: /^delete forever$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() => expect(screen.getByText(/trash is empty/i)).toBeInTheDocument());
  });

  it("removes a collection row after it's restored, via the same restore endpoint collections already use", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        jsonResponse({ items: [], collections: [{ id: "col-1", name: "Old Project" }] }),
      )
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(jsonResponse({ items: [], collections: [] }));

    render(<TrashView />);
    await screen.findByText("Old Project");

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/collections/col-1/restore", { method: "POST" }),
    );
    await waitFor(() => expect(screen.getByText(/trash is empty/i)).toBeInTheDocument());
  });
});
