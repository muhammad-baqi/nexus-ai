import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfParseMock = vi.fn();
vi.mock("pdf-parse", () => ({ default: (...args: unknown[]) => pdfParseMock(...args) }));

const { extractPdfText } = await import("./extract-pdf-text");

const ITEM_ID = "123e4567-e89b-12d3-a456-426614174000";
const STORAGE_PATH = "user-1/upload-id/report.pdf";

let downloadMock: ReturnType<typeof vi.fn>;
let updateCalls: { payload: unknown }[];
let queuedUpdateError: unknown;

function createFakeSupabase() {
  return {
    storage: { from: () => ({ download: downloadMock }) },
    from: () => ({
      update: (payload: unknown) => {
        updateCalls.push({ payload });
        return { eq: () => Promise.resolve({ data: null, error: queuedUpdateError ?? null }) };
      },
    }),
  };
}

function blobOf(text: string) {
  return { arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) };
}

describe("extractPdfText", () => {
  beforeEach(() => {
    downloadMock = vi.fn();
    updateCalls = [];
    queuedUpdateError = null;
    pdfParseMock.mockReset();
  });

  it("extracts text and marks extraction_status success", async () => {
    downloadMock.mockResolvedValue({ data: blobOf("pdf bytes"), error: null });
    pdfParseMock.mockResolvedValue({ text: "Hello, this is the extracted PDF text." });

    await extractPdfText(createFakeSupabase() as never, ITEM_ID, STORAGE_PATH);

    expect(updateCalls).toEqual([
      { payload: { extracted_text: "Hello, this is the extracted PDF text.", extraction_status: "success" } },
    ]);
  });

  it("marks extraction_status failed, without throwing, when the download fails", async () => {
    downloadMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(extractPdfText(createFakeSupabase() as never, ITEM_ID, STORAGE_PATH)).resolves.toBeUndefined();

    expect(updateCalls).toEqual([{ payload: { extraction_status: "failed" } }]);
    expect(pdfParseMock).not.toHaveBeenCalled();
  });

  it("marks extraction_status failed when the PDF has no embedded text layer (scanned/image-only)", async () => {
    downloadMock.mockResolvedValue({ data: blobOf("pdf bytes"), error: null });
    pdfParseMock.mockResolvedValue({ text: "   \n  " });

    await extractPdfText(createFakeSupabase() as never, ITEM_ID, STORAGE_PATH);

    expect(updateCalls).toEqual([{ payload: { extraction_status: "failed" } }]);
  });

  it("marks extraction_status failed, without throwing, when pdf-parse itself throws (corrupt/encrypted PDF)", async () => {
    downloadMock.mockResolvedValue({ data: blobOf("pdf bytes"), error: null });
    pdfParseMock.mockRejectedValue(new Error("bad PDF structure"));

    await expect(extractPdfText(createFakeSupabase() as never, ITEM_ID, STORAGE_PATH)).resolves.toBeUndefined();

    expect(updateCalls).toEqual([{ payload: { extraction_status: "failed" } }]);
  });

  it("caps extracted text at 200,000 characters", async () => {
    downloadMock.mockResolvedValue({ data: blobOf("pdf bytes"), error: null });
    pdfParseMock.mockResolvedValue({ text: "a".repeat(250_000) });

    await extractPdfText(createFakeSupabase() as never, ITEM_ID, STORAGE_PATH);

    const payload = updateCalls[0].payload as { extracted_text: string };
    expect(payload.extracted_text).toHaveLength(200_000);
  });

  it("never throws even when the DB update itself fails", async () => {
    downloadMock.mockResolvedValue({ data: blobOf("pdf bytes"), error: null });
    pdfParseMock.mockResolvedValue({ text: "some text" });
    queuedUpdateError = { message: "db down" };

    await expect(extractPdfText(createFakeSupabase() as never, ITEM_ID, STORAGE_PATH)).resolves.toBeUndefined();
  });
});
