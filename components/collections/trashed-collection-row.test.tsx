import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrashedCollectionRow } from "./trashed-collection-row";

describe("TrashedCollectionRow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("calls the restore endpoint and onRestored on success", async () => {
    const onRestored = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<TrashedCollectionRow collection={{ id: "col-1", name: "Old Project" }} onRestored={onRestored} />);

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/collections/col-1/restore", {
        method: "POST",
      }),
    );
    expect(onRestored).toHaveBeenCalled();
  });

  it("shows a retry-able error and does not call onRestored on failure", async () => {
    const onRestored = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<TrashedCollectionRow collection={{ id: "col-1", name: "Old Project" }} onRestored={onRestored} />);

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong restoring/i);
    expect(onRestored).not.toHaveBeenCalled();
  });
});
