import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrashedItemRow } from "./trashed-item-row";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("TrashedItemRow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("restores in place and reports a plain restored message", async () => {
    const onRestored = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ rehomed: false }));
    render(
      <TrashedItemRow
        item={{ id: "item-1", title: "Trip planning" }}
        onRestored={onRestored}
        onPermanentlyDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/items/item-1/restore", { method: "POST" }),
    );
    expect(onRestored).toHaveBeenCalledWith('"Trip planning" was restored.');
  });

  it("reports a re-homed message naming the actual target collection when rehomed: true", async () => {
    const onRestored = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ rehomed: true, rehomedToCollectionName: "Inbox" }),
    );
    render(
      <TrashedItemRow
        item={{ id: "item-1", title: "Trip planning" }}
        onRestored={onRestored}
        onPermanentlyDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(onRestored).toHaveBeenCalledWith(
      '"Trip planning" was restored to Inbox (its original collection is gone).',
    );
  });

  it("names the fallback collection (not just 'Inbox') when rehomed via the oldest-surviving-collection fallback", async () => {
    const onRestored = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ rehomed: true, rehomedToCollectionName: "Work Notes" }),
    );
    render(
      <TrashedItemRow
        item={{ id: "item-1", title: "Trip planning" }}
        onRestored={onRestored}
        onPermanentlyDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(onRestored).toHaveBeenCalledWith(
      '"Trip planning" was restored to Work Notes (its original collection is gone).',
    );
  });

  it("shows an inline error and does not call onRestored when restore fails", async () => {
    const onRestored = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ error: { message: "boom" } }, false),
    );
    render(
      <TrashedItemRow
        item={{ id: "item-1", title: "Trip planning" }}
        onRestored={onRestored}
        onPermanentlyDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("requires an inline confirm before permanently deleting", async () => {
    const onPermanentlyDeleted = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({}));
    render(
      <TrashedItemRow
        item={{ id: "item-1", title: "Trip planning" }}
        onRestored={vi.fn()}
        onPermanentlyDeleted={onPermanentlyDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete forever$/i }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Delete forever?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/items/item-1/permanent", { method: "DELETE" }),
    );
    expect(onPermanentlyDeleted).toHaveBeenCalled();
  });

  it("cancelling the permanent-delete confirm makes no request", () => {
    render(
      <TrashedItemRow
        item={{ id: "item-1", title: "Trip planning" }}
        onRestored={vi.fn()}
        onPermanentlyDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete forever$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByText("Delete forever?")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
