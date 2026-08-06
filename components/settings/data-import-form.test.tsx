import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    storage: { from: () => ({ upload }) },
  }),
}));

import { DataImportForm } from "./data-import-form";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

function jsonFile(name = "export.json", sizeBytes = 100) {
  const file = new File(["{}"], name, { type: "application/json" });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("DataImportForm", () => {
  beforeEach(() => {
    upload.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("crypto", { ...crypto, randomUUID: () => "upload-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a file that isn't .json/.zip client-side, before any upload", async () => {
    render(<DataImportForm />);
    const input = screen.getByLabelText(/import a previous export/i) as HTMLInputElement;

    const badFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [badFile] } });

    expect(await screen.findByText(/please choose a \.json or \.zip/i)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects a file over the size cap client-side, before any upload", async () => {
    render(<DataImportForm />);
    const input = screen.getByLabelText(/import a previous export/i) as HTMLInputElement;

    const big = jsonFile("huge.json", 26 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [big] } });

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("a successful .json upload + job completion shows the created/skipped summary", async () => {
    vi.useFakeTimers();
    upload.mockResolvedValue({ error: null });
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "job-1", source_format: "json", status: "pending" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "job-1",
          status: "success",
          created_count: 2,
          skipped_count: 1,
          skip_reasons: ["\"Bad Item\" in \"Inbox\" was skipped: create failed"],
        }),
      );

    render(<DataImportForm />);
    const input = screen.getByLabelText(/import a previous export/i) as HTMLInputElement;

    // fake timers freeze waitFor's real setInterval polling (same reasoning as
    // components/bookmarks/bookmark-view.test.tsx's own comment) — flush the upload+POST chain's
    // awaits manually instead.
    await act(async () => {
      fireEvent.change(input, { target: { files: [jsonFile()] } });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(upload).toHaveBeenCalledWith(
      "user-1/imports/upload-1/source.json",
      expect.anything(),
      expect.objectContaining({ contentType: "application/json" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/import",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ storage_path: "user-1/imports/upload-1/source.json", source_format: "json" }),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText(/imported 2 items, skipped 1/i)).toBeInTheDocument();
    expect(screen.getByText(/"bad item" in "inbox" was skipped/i)).toBeInTheDocument();
  });
});
