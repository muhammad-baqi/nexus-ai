import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { format } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoteVersionHistory } from "./note-version-history";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("NoteVersionHistory", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetches and renders the version list with formatted timestamps on mount", async () => {
    const timestamp = "2026-08-01T15:30:00.000Z";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse([{ id: "v1", created_at: timestamp }]),
    );

    render(<NoteVersionHistory itemId="item-1" onRestored={() => {}} />);

    const expectedLabel = format(new Date(timestamp), "MMM d, yyyy, h:mm a");
    expect(await screen.findByText(expectedLabel)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/items/item-1/versions");
  });

  it("shows an empty-state message when there are no versions yet", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse([]));

    render(<NoteVersionHistory itemId="item-1" onRestored={() => {}} />);

    expect(await screen.findByText("No previous versions yet.")).toBeInTheDocument();
  });

  it("shows a retry-able error if the list fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(null, false));

    render(<NoteVersionHistory itemId="item-1" onRestored={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong/i);
  });

  it("clicking Preview fetches and renders the version's content read-only via NoteBody", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse([{ id: "v1", created_at: "2026-08-01T00:00:00.000Z" }]))
      .mockResolvedValueOnce(
        jsonResponse({ id: "v1", content: "# Old heading", created_at: "2026-08-01T00:00:00.000Z" }),
      );

    render(<NoteVersionHistory itemId="item-1" onRestored={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Old heading" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/items/item-1/versions/v1");
  });

  it("clicking Restore this version calls the restore endpoint and invokes onRestored with the content and version id", async () => {
    const onRestored = vi.fn();
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse([{ id: "v1", created_at: "2026-08-01T00:00:00.000Z" }]))
      .mockResolvedValueOnce(
        jsonResponse({ id: "v1", content: "# Old heading", created_at: "2026-08-01T00:00:00.000Z" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "item-1", description: "# Old heading", versionId: "v2" }),
      )
      .mockResolvedValueOnce(jsonResponse([{ id: "v2", created_at: "2026-08-02T00:00:00.000Z" }]));

    render(<NoteVersionHistory itemId="item-1" onRestored={onRestored} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
    await screen.findByRole("heading", { level: 1, name: "Old heading" });

    fireEvent.click(screen.getByRole("button", { name: /restore this version/i }));

    expect(fetch).toHaveBeenCalledWith("/api/items/item-1/versions/v1/restore", { method: "POST" });
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith("# Old heading", "v2"));
  });
});
