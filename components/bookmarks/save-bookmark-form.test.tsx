import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { SaveBookmarkForm } from "./save-bookmark-form";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("SaveBookmarkForm", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("starts collapsed, showing just a 'Save Bookmark' button", () => {
    render(<SaveBookmarkForm collectionId="col-1" />);

    expect(screen.getByRole("button", { name: /save bookmark/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
  });

  it("expands into a form when clicked", () => {
    render(<SaveBookmarkForm collectionId="col-1" />);
    fireEvent.click(screen.getByRole("button", { name: /save bookmark/i }));

    expect(screen.getByLabelText("URL")).toBeInTheDocument();
  });

  it("shows an inline error for an empty URL and never calls fetch", async () => {
    render(<SaveBookmarkForm collectionId="col-1" />);
    fireEvent.click(screen.getByRole("button", { name: /save bookmark/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/enter a url/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the bookmark and navigates to the created item on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ id: "item-1" }));

    render(<SaveBookmarkForm collectionId="col-1" />);
    fireEvent.click(screen.getByRole("button", { name: /save bookmark/i }));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/article" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/items/item-1"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "website",
          collection_id: "col-1",
          url: "https://example.com/article",
          confirmDuplicate: false,
        }),
      }),
    );
    // Collapses back to the button after a successful save.
    expect(screen.getByRole("button", { name: /save bookmark/i })).toBeInTheDocument();
  });

  it("shows the server's validation message inline instead of collapsing", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ error: { message: "Enter a valid URL" } }, false),
    );

    render(<SaveBookmarkForm collectionId="col-1" />);
    fireEvent.click(screen.getByRole("button", { name: /save bookmark/i }));
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/enter a valid url/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the non-blocking duplicate prompt instead of navigating away", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ duplicate: true, existingItemId: "existing-1" }),
    );

    render(<SaveBookmarkForm collectionId="col-1" />);
    fireEvent.click(screen.getByRole("button", { name: /save bookmark/i }));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/article" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/you already saved this/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("'View existing' navigates to the existing bookmark", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ duplicate: true, existingItemId: "existing-1" }),
    );

    render(<SaveBookmarkForm collectionId="col-1" />);
    fireEvent.click(screen.getByRole("button", { name: /save bookmark/i }));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/article" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /view existing/i }));

    expect(push).toHaveBeenCalledWith("/items/existing-1");
  });

  it("'Save anyway' resubmits with confirmDuplicate: true and navigates on success", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse({ duplicate: true, existingItemId: "existing-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "item-2" }));

    render(<SaveBookmarkForm collectionId="col-1" />);
    fireEvent.click(screen.getByRole("button", { name: /save bookmark/i }));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/article" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /save anyway/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/items/item-2"));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/items",
      expect.objectContaining({
        body: JSON.stringify({
          type: "website",
          collection_id: "col-1",
          url: "https://example.com/article",
          confirmDuplicate: true,
        }),
      }),
    );
  });
});
