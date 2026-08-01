import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoteEditor } from "./note-editor";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const baseItem = {
  id: "item-1",
  title: "Trip planning",
  description: "Packing list",
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe("NoteEditor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("loads the existing title/body into the form fields on mount", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);

    expect(await screen.findByDisplayValue("Trip planning")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Packing list")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/items/item-1");
  });

  it("shows a load error and never renders the form when the fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(null, false));

    render(<NoteEditor itemId="item-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be loaded/i);
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("Save calls PATCH with the edited title and body", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValueOnce(jsonResponse({ ...baseItem, title: "Trip planning (updated)" }));

    render(<NoteEditor itemId="item-1" />);
    await screen.findByDisplayValue("Trip planning");

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Trip planning (updated)" },
    });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Updated packing list" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Trip planning (updated)", description: "Updated packing list" }),
      }),
    );
  });

  it("shows an inline error for a blank title and never calls PATCH", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);
    await screen.findByDisplayValue("Trip planning");
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a generic retry-able error when the save request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, false));

    render(<NoteEditor itemId="item-1" />);
    await screen.findByDisplayValue("Trip planning");

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
