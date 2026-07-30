import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateCollectionForm } from "./create-collection-form";

describe("CreateCollectionForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("starts collapsed, showing just a 'New collection' button", () => {
    render(<CreateCollectionForm onCreated={vi.fn()} />);

    expect(screen.getByRole("button", { name: /new collection/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("expands into a form when clicked", () => {
    render(<CreateCollectionForm onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /new collection/i }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("shows an inline error for an empty name and never calls fetch", async () => {
    render(<CreateCollectionForm onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the collection and calls onCreated on success", async () => {
    const onCreated = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "col-1", name: "Travel" }),
    });
    render(<CreateCollectionForm onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Travel" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/collections",
      expect.objectContaining({ method: "POST" }),
    );
    // Collapses back to the button after a successful create.
    expect(screen.getByRole("button", { name: /new collection/i })).toBeInTheDocument();
  });

  it("shows the server's duplicate-name message inline instead of collapsing", async () => {
    const onCreated = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { code: "duplicate_name", message: "You already have a collection with this name." },
      }),
    });
    render(<CreateCollectionForm onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Inbox" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText(/already have a collection/i)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
