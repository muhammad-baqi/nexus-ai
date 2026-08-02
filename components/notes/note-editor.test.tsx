import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("opens in view mode, rendering the body instead of the textarea", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);

    expect(await screen.findByRole("heading", { name: "Trip planning" })).toBeInTheDocument();
    expect(screen.getByText("Packing list")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/items/item-1");
  });

  it("a freshly created note (default title, empty body) opens straight into edit mode", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, title: "Untitled Note", description: null }),
    );

    render(<NoteEditor itemId="item-1" />);

    expect(await screen.findByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Body")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Untitled Note" })).not.toBeInTheDocument();
  });

  it("shows a load error and never renders the view or the form when the fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(null, false));

    render(<NoteEditor itemId="item-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be loaded/i);
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("clicking Edit switches to the textarea, pre-filled with the raw Markdown source", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, description: "# Heading with **bold** text" }),
    );

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByDisplayValue("Trip planning")).toBeInTheDocument();
    expect(screen.getByDisplayValue("# Heading with **bold** text")).toBeInTheDocument();
  });

  it("Save calls PATCH with the edited title/body and returns to view mode showing the update", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValueOnce(
        jsonResponse({ ...baseItem, title: "Trip planning (updated)", description: "Updated packing list" }),
      );

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Trip planning (updated)" },
    });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Updated packing list" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      await screen.findByRole("heading", { name: "Trip planning (updated)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Updated packing list")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Trip planning (updated)", description: "Updated packing list" }),
      }),
    );
  });

  it("Cancel discards the draft and returns to view mode unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Discarded title" } });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.getByRole("heading", { name: "Trip planning" })).toBeInTheDocument();
    expect(screen.queryByText("Discarded title")).not.toBeInTheDocument();
  });

  it("shows an inline error for a blank title and never calls PATCH", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a failed save shows a generic retry-able error and stays in edit mode with the draft intact", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, false));

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Draft title" } });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Draft title")).toBeInTheDocument();
  });

  it("defaults to the Markdown (textarea) surface when entering edit mode", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByLabelText("Body").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("the toggle switches to the Rich text surface and shows the same content, parsed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, description: "# Heading\n\n**bold**" }),
    );

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rich text" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Heading" })).toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("toggling back to Markdown shows the same content, serialized back to equivalent Markdown text (not a stale snapshot)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, description: "# Heading\n\n**bold**" }),
    );

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rich text" }));
    await screen.findByRole("heading", { level: 1, name: "Heading" });

    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));

    const textarea = screen.getByLabelText("Body") as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.value).toContain("# Heading");
    expect(textarea.value).toContain("**bold**");
  });

  it("Save works correctly while the Rich text surface is active", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse({ ...baseItem, description: "Packing list" }))
      .mockResolvedValueOnce(
        jsonResponse({ ...baseItem, title: "Trip planning", description: "Packing list" }),
      );

    render(<NoteEditor itemId="item-1" />);
    await screen.findByRole("heading", { name: "Trip planning" });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rich text" }));
    await waitFor(() => expect(screen.getByLabelText("Body").tagName).not.toBe("TEXTAREA"));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await screen.findByRole("heading", { name: "Trip planning" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Trip planning", description: "Packing list" }),
      }),
    );
  });
});
