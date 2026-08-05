import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    storage: { from: () => ({ upload }) },
  }),
}));

import { UploadFileForm } from "./upload-file-form";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function pdfFile(name = "report.pdf", sizeBytes = 1024) {
  const file = new File(["%PDF-1.7 content"], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("UploadFileForm", () => {
  const onUploaded = vi.fn();

  beforeEach(() => {
    onUploaded.mockReset();
    upload.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("starts collapsed, showing just an 'Upload Files' button", () => {
    render(<UploadFileForm collectionId="col-1" onUploaded={onUploaded} />);

    expect(screen.getByRole("button", { name: /upload files/i })).toBeInTheDocument();
    expect(screen.queryByText(/drag and drop/i)).not.toBeInTheDocument();
  });

  it("expands into a drop zone when clicked", () => {
    render(<UploadFileForm collectionId="col-1" onUploaded={onUploaded} />);
    fireEvent.click(screen.getByRole("button", { name: /upload files/i }));

    expect(screen.getByText(/drag and drop files here/i)).toBeInTheDocument();
  });

  it("rejects an oversized file client-side without ever calling Storage upload", async () => {
    render(<UploadFileForm collectionId="col-1" onUploaded={onUploaded} />);
    fireEvent.click(screen.getByRole("button", { name: /upload files/i }));

    const input = screen.getByLabelText("Choose files to upload") as HTMLInputElement;
    const big = pdfFile("huge.pdf", 51 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [big] } });

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads to Storage then posts item metadata, calling onUploaded on success", async () => {
    upload.mockResolvedValue({ error: null });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ id: "item-1", type: "pdf" }));

    render(<UploadFileForm collectionId="col-1" onUploaded={onUploaded} />);
    fireEvent.click(screen.getByRole("button", { name: /upload files/i }));

    const input = screen.getByLabelText("Choose files to upload") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
      expect.anything(),
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"type":"pdf"'),
      }),
    );
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });

  it("shows a per-file error and does not call onUploaded when the Storage upload fails", async () => {
    upload.mockResolvedValue({ error: { message: "boom" } });

    render(<UploadFileForm collectionId="col-1" onUploaded={onUploaded} />);
    fireEvent.click(screen.getByRole("button", { name: /upload files/i }));

    const input = screen.getByLabelText("Choose files to upload") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    expect(await screen.findByText(/something went wrong uploading/i)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's rejection message and does not call onUploaded when POST /api/items fails", async () => {
    upload.mockResolvedValue({ error: null });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ error: { message: "This file's content doesn't match its declared type." } }, false),
    );

    render(<UploadFileForm collectionId="col-1" onUploaded={onUploaded} />);
    fireEvent.click(screen.getByRole("button", { name: /upload files/i }));

    const input = screen.getByLabelText("Choose files to upload") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    expect(await screen.findByText(/doesn't match its declared type/i)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("uploads multiple files independently, in a single batch", async () => {
    upload.mockResolvedValue({ error: null });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ id: "item-1", type: "pdf" }));

    render(<UploadFileForm collectionId="col-1" onUploaded={onUploaded} />);
    fireEvent.click(screen.getByRole("button", { name: /upload files/i }));

    const input = screen.getByLabelText("Choose files to upload") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile("a.pdf"), pdfFile("b.pdf")] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(2));
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });
});
