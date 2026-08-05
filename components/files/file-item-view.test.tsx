import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileItemView } from "./file-item-view";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

// next/image validates its `src` hostname against next.config.ts's images.remotePatterns at
// render time — correct in the real app (that's the point: only our own Supabase Storage host is
// allowlisted), but this unit test uses a fake "signed.example" URL that was never meant to pass
// that check, since remotePatterns enforcement itself isn't this component's behavior to verify.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- test-only stand-in, not app code.
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// Isolates MoveItemControl's own fetch behavior (already covered by its own test file) from this
// view's — matches bookmark-view.test.tsx's identical mock/reasoning.
vi.mock("@/components/notes/move-item-control", () => ({
  MoveItemControl: () => <div data-testid="move-item-control" />,
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body, text: async () => body };
}

const baseItem = {
  id: "item-1",
  type: "pdf" as const,
  title: "report.pdf",
  description: null,
  is_favorite: false,
  is_archived: false,
  collection_id: "col-1",
  tags: [],
  file_asset: {
    original_filename: "report.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    extraction_status: "success" as const,
    download_url: "https://signed.example/report.pdf",
  },
};

describe("FileItemView", () => {
  beforeEach(() => {
    routerPush.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a PDF in an iframe viewer", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<FileItemView itemId="item-1" />);

    const iframe = await screen.findByTitle("report.pdf");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("src", baseItem.file_asset.download_url);
  });

  it("shows 'Extracting text…' while extraction_status is pending", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, file_asset: { ...baseItem.file_asset, extraction_status: "pending" } }),
    );

    render(<FileItemView itemId="item-1" />);

    expect(await screen.findByText(/extracting text/i)).toBeInTheDocument();
  });

  it("shows a 'not searchable' indicator when extraction failed, without blocking the preview", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, file_asset: { ...baseItem.file_asset, extraction_status: "failed" } }),
    );

    render(<FileItemView itemId="item-1" />);

    expect(await screen.findByText(/text search unavailable/i)).toBeInTheDocument();
    expect(await screen.findByTitle("report.pdf")).toBeInTheDocument();
  });

  it("polls while extraction_status is pending and picks up success without a manual refresh", async () => {
    vi.useFakeTimers();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ...baseItem, file_asset: { ...baseItem.file_asset, extraction_status: "pending" } }),
      )
      .mockResolvedValueOnce(jsonResponse(baseItem));

    render(<FileItemView itemId="item-1" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/extracting text/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.queryByText(/extracting text/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders an image item as an <img>", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        ...baseItem,
        type: "image",
        title: "photo.png",
        file_asset: {
          original_filename: "photo.png",
          mime_type: "image/png",
          size_bytes: 4096,
          extraction_status: "not_applicable",
          download_url: "https://signed.example/photo.png",
        },
      }),
    );

    render(<FileItemView itemId="item-1" />);

    expect(await screen.findByAltText("photo.png")).toBeInTheDocument();
  });

  it("renders an inline text preview for a plain-text general file", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string) => {
      if (url === "https://signed.example/notes.txt") {
        return Promise.resolve(jsonResponse("hello from the file"));
      }
      return Promise.resolve(
        jsonResponse({
          ...baseItem,
          type: "file",
          title: "notes.txt",
          file_asset: {
            original_filename: "notes.txt",
            mime_type: "text/plain",
            size_bytes: 20,
            extraction_status: "not_applicable",
            download_url: "https://signed.example/notes.txt",
          },
        }),
      );
    });

    render(<FileItemView itemId="item-1" />);

    expect(await screen.findByText("hello from the file")).toBeInTheDocument();
  });

  it("falls back to metadata + Download, with no inline preview, for a non-text general file", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        ...baseItem,
        type: "file",
        title: "archive.zip",
        file_asset: {
          original_filename: "archive.zip",
          mime_type: "application/zip",
          size_bytes: 4096,
          extraction_status: "not_applicable",
          download_url: "https://signed.example/archive.zip",
        },
      }),
    );

    render(<FileItemView itemId="item-1" />);

    await screen.findByText("archive.zip");
    expect(screen.getByText(/download original file/i)).toHaveAttribute(
      "href",
      "https://signed.example/archive.zip",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("lets the user edit the title via a plain Edit/Save toggle", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(baseItem));

    render(<FileItemView itemId="item-1" />);
    await screen.findByText("report.pdf");

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Q3 Report" } });

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...baseItem, title: "Q3 Report", tags: [] }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Q3 Report")).toBeInTheDocument();
  });

  it("shows a load error when the initial fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => null });

    render(<FileItemView itemId="item-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be loaded/i);
  });
});
