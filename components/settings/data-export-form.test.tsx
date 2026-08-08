import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataExportForm } from "./data-export-form";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("DataExportForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clicking a format button POSTs /api/settings/export with that format and shows 'Generating…'", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "job-1", format: "json", status: "pending" }));

    render(<DataExportForm />);
    fireEvent.click(screen.getByRole("button", { name: "Export as JSON" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/export",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ format: "json" }) }),
      ),
    );
    expect(await screen.findByText(/generating/i)).toBeInTheDocument();
  });

  it("polls until status: 'success', then renders a Download link", async () => {
    vi.useFakeTimers();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "job-1", format: "json", status: "pending" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "job-1",
          format: "json",
          status: "success",
          download_url: "https://signed.example.com/export.json",
        }),
      );

    render(<DataExportForm />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export as JSON" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/generating/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "https://signed.example.com/export.json",
    );
  });

  it("polls until status: 'failed', then renders the error with a working Retry button", async () => {
    vi.useFakeTimers();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "job-1", format: "json", status: "pending" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "job-1",
          format: "json",
          status: "failed",
          error_message: "Something went wrong generating your export.",
        }),
      );

    render(<DataExportForm />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export as JSON" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText("Something went wrong generating your export.")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "job-2", format: "json", status: "pending" }));
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/settings/export",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ format: "json" }) }),
    );
  });

  it("a transient poll failure is retried automatically rather than freezing the job's status permanently", async () => {
    vi.useFakeTimers();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "job-1", format: "json", status: "pending" }))
      .mockResolvedValueOnce({ ok: false, json: async () => null })
      .mockResolvedValueOnce(
        jsonResponse({
          id: "job-1",
          format: "json",
          status: "success",
          download_url: "https://signed.example.com/export.json",
        }),
      );

    render(<DataExportForm />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export as JSON" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/generating/i)).toBeInTheDocument();

    // First poll tick fails — still "Generating…", not a permanent freeze or a surfaced error.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // The retried poll tick succeeds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "https://signed.example.com/export.json",
    );
  });

  it("after repeated poll failures, an inline retry action appears and resumes polling on click", async () => {
    vi.useFakeTimers();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "job-1", format: "json", status: "pending" }));
    for (let i = 0; i < 5; i += 1) {
      fetchMock.mockResolvedValueOnce({ ok: false, json: async () => null });
    }

    render(<DataExportForm />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export as JSON" }));
      await vi.advanceTimersByTimeAsync(0);
    });

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }

    expect(screen.getByText(/couldn't check export status/i)).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Retry" });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "job-1",
        format: "json",
        status: "success",
        download_url: "https://signed.example.com/export.json",
      }),
    );
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "https://signed.example.com/export.json",
    );
  });
});
