import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// Real UploadFileForm is left unmocked (unlike MoveItemControl elsewhere) so its onUploaded
// callback can be triggered organically for the regression test below, driving Storage/getUser
// through the same mock shape upload-file-form.test.tsx itself uses.
const upload = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    storage: { from: () => ({ upload }) },
  }),
}));

import { CollectionDetailView } from "./collection-detail-view";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const baseCollection = { id: "col-1", name: "Travel", description: "Trip planning" };

describe("CollectionDetailView", () => {
  beforeEach(() => {
    push.mockReset();
    getUser.mockReset();
    upload.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("loads and renders the collection name and its notes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(
        jsonResponse({ items: [{ id: "item-1", type: "note", title: "Packing list", updated_at: "" }] }),
      );
    });

    render(<CollectionDetailView collectionId="col-1" />);

    expect(await screen.findByText("Travel")).toBeInTheDocument();
    expect(screen.getByText("Packing list")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/items?collection_id=col-1");
  });

  it("falls back to 'Untitled Note' for a note with a blank title", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(jsonResponse({ items: [{ id: "item-1", type: "note", title: "", updated_at: "" }] }));
    });

    render(<CollectionDetailView collectionId="col-1" />);

    expect(await screen.findByText("Untitled Note")).toBeInTheDocument();
  });

  it("shows an empty state when the collection has no items yet", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(jsonResponse({ items: [] }));
    });

    render(<CollectionDetailView collectionId="col-1" />);

    expect(await screen.findByText(/no items yet/i)).toBeInTheDocument();
  });

  it("'New Note' POSTs with the current collection_id and navigates to the created item", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(jsonResponse({ id: "item-2" }, true));
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(jsonResponse({ items: [] }));
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText(/no items yet/i);

    fireEvent.click(screen.getByRole("button", { name: /new note/i }));

    expect(await screen.findByRole("button", { name: /new note/i })).not.toBeDisabled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "note", collection_id: "col-1" }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/items/item-2");
  });

  it("'New Snippet' POSTs type: code_snippet with the current collection_id and navigates to the created item", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(jsonResponse({ id: "item-3" }, true));
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(jsonResponse({ items: [] }));
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText(/no items yet/i);

    fireEvent.click(screen.getByRole("button", { name: /new snippet/i }));

    expect(await screen.findByRole("button", { name: /new snippet/i })).not.toBeDisabled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "code_snippet", collection_id: "col-1" }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/items/item-3");
  });

  it("UploadFileForm's onUploaded refreshes the item list without unmounting the page into the full-page 'Loading...' state", async () => {
    // Regression test for a real bug the Day 5 bulk-import stress test caught: a batch upload's
    // onUploaded fires once per successfully uploaded file, and used to unconditionally flip this
    // component to its full-page "Loading..." state on every call — unmounting UploadFileForm
    // itself (and its own in-progress per-file status list) mid-batch, the moment the *first*
    // file in a multi-file batch finished. `load({ background: true })` must keep the page (and
    // the still-uploading UploadFileForm) mounted throughout. Drives a real upload through the
    // real (unmocked) UploadFileForm, same Storage/getUser mock shape upload-file-form.test.tsx
    // itself uses, so this proves the actual integration, not just a simulated callback.
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    upload.mockResolvedValue({ error: null });

    let itemsGetCallCount = 0;
    let resolveBackgroundItemsRefetch: (value: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse({ id: "item-1", type: "file", title: "report.pdf" }, true));
      }
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      // GET /api/items?collection_id=... — the first call is the initial load (resolves right
      // away); every call after that is a background refresh, deliberately held open here so its
      // in-flight state can be observed.
      itemsGetCallCount++;
      if (itemsGetCallCount === 1) return Promise.resolve(jsonResponse({ items: [] }));
      return new Promise((resolve) => {
        resolveBackgroundItemsRefetch = resolve;
      });
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText(/no items yet/i);

    fireEvent.click(screen.getByRole("button", { name: /upload files/i }));
    const input = screen.getByLabelText("Choose files to upload") as HTMLInputElement;
    const file = new File(["%PDF-1.7 content"], "report.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 1024 });
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("Done");

    // The background refetch onUploaded triggered is deliberately still pending — the page (and
    // UploadFileForm's own "Done" status, still showing) must stay mounted throughout, not swap
    // to the full-page loading fallback.
    expect(screen.getByText("Travel")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();

    resolveBackgroundItemsRefetch(
      jsonResponse({ items: [{ id: "item-1", type: "file", title: "report.pdf", updated_at: "" }] }),
    );
    await waitFor(() => expect(screen.queryByText(/no items yet/i)).not.toBeInTheDocument());
  });

  it("shows a retry-able error state on a failed load", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    render(<CollectionDetailView collectionId="col-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });

  it("hides archived items by default; 'Show archived' reveals them with an (Archived) label", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: "item-1", type: "note", title: "Active note", updated_at: "", is_favorite: false, is_archived: false },
            { id: "item-2", type: "note", title: "Old note", updated_at: "", is_favorite: false, is_archived: true },
          ],
        }),
      );
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText("Active note");

    expect(screen.queryByText("Old note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show archived \(1\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show archived \(1\)/i }));

    expect(screen.getByText("Old note")).toBeInTheDocument();
    expect(screen.getByText("(Archived)")).toBeInTheDocument();
  });

  it("shows a star marker for a favorited item", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: "item-1", type: "note", title: "Starred note", updated_at: "", is_favorite: true, is_archived: false },
          ],
        }),
      );
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText("Starred note");

    expect(screen.getByLabelText("Favorited")).toBeInTheDocument();
  });

  it("shows a type marker matching each item's type", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: "item-1", type: "pdf", title: "report.pdf", updated_at: "", is_favorite: false, is_archived: false },
            { id: "item-2", type: "image", title: "photo.png", updated_at: "", is_favorite: false, is_archived: false },
          ],
        }),
      );
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText(/report\.pdf/);

    expect(screen.getByLabelText("PDF")).toBeInTheDocument();
    expect(screen.getByLabelText("Image")).toBeInTheDocument();
  });

  it("renders an 'Upload Files' action that expands into a drop zone", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/api/collections/")) return Promise.resolve(jsonResponse(baseCollection));
      return Promise.resolve(jsonResponse({ items: [] }));
    });

    render(<CollectionDetailView collectionId="col-1" />);
    await screen.findByText(/no items yet/i);

    fireEvent.click(screen.getByRole("button", { name: /upload files/i }));

    expect(screen.getByText(/drag and drop files here/i)).toBeInTheDocument();
  });
});
