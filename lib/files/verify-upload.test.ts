import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUploadedObject, verifyUploadedFileContent } from "./verify-upload";

const STORAGE_PATH = "user-1/upload-id/report.pdf";

let createSignedUrl: ReturnType<typeof vi.fn>;
let removeMock: ReturnType<typeof vi.fn>;

function createFakeSupabase() {
  return {
    storage: {
      from: () => ({ createSignedUrl, remove: removeMock }),
    },
  };
}

function pdfBytes(): ArrayBuffer {
  return new TextEncoder().encode("%PDF-1.7\n...").buffer as ArrayBuffer;
}

function pngBytes(): ArrayBuffer {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer as ArrayBuffer;
}

function fetchResponse(init: {
  ok?: boolean;
  status?: number;
  body?: ArrayBuffer;
  headers?: Record<string, string>;
}) {
  const { ok = true, status = ok ? 206 : 500, body = pdfBytes(), headers = {} } = init;
  return {
    ok,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("verifyUploadedFileContent", () => {
  beforeEach(() => {
    createSignedUrl = vi.fn();
    removeMock = vi.fn();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns ok:false when createSignedUrl fails, without ever calling fetch", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(result).toEqual({ ok: false, reason: "Something went wrong verifying the uploaded file." });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns ok:false when fetching the uploaded bytes fails (non-ok response)", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
    vi.mocked(fetch).mockResolvedValue(fetchResponse({ ok: false }));

    const result = await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(result.ok).toBe(false);
  });

  it("returns ok:false, without throwing, when fetch itself rejects", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
    vi.mocked(fetch).mockRejectedValue(new Error("network unreachable"));

    const result = await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(result.ok).toBe(false);
  });

  it("returns ok:true when the sniffed content matches the declared mime type", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
    vi.mocked(fetch).mockResolvedValue(fetchResponse({}));

    const result = await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(result).toEqual({ ok: true, actualSizeBytes: null });
  });

  it("returns ok:false when the sniffed content doesn't match the declared mime type (spoofed upload)", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
    // Declared as a PDF, but the actual bytes are a PNG.
    vi.mocked(fetch).mockResolvedValue(fetchResponse({ body: pngBytes() }));

    const result = await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(result.ok).toBe(false);
  });

  it("requests only the first 4KB via a Range header, not the whole object", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
    vi.mocked(fetch).mockResolvedValue(fetchResponse({}));

    await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(fetch).toHaveBeenCalledWith(
      "https://signed.example/x",
      expect.objectContaining({ headers: { Range: "bytes=0-4095" } }),
    );
  });

  it("reports the real object size parsed from a 206's Content-Range header", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      fetchResponse({ status: 206, headers: { "content-range": "bytes 0-4095/52428800" } }),
    );

    const result = await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(result).toEqual({ ok: true, actualSizeBytes: 52428800 });
  });

  it("reports the real object size from Content-Length when the whole (small) object came back as a 200", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      fetchResponse({ status: 200, headers: { "content-length": "12" } }),
    );

    const result = await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(result).toEqual({ ok: true, actualSizeBytes: 12 });
  });

  it("reports actualSizeBytes: null when neither header is present, rather than guessing", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
    vi.mocked(fetch).mockResolvedValue(fetchResponse({ status: 206 }));

    const result = await verifyUploadedFileContent(createFakeSupabase() as never, STORAGE_PATH, "application/pdf");

    expect(result).toEqual({ ok: true, actualSizeBytes: null });
  });
});

describe("deleteUploadedObject", () => {
  beforeEach(() => {
    createSignedUrl = vi.fn();
    removeMock = vi.fn();
  });

  it("removes the object at the given path", async () => {
    removeMock.mockResolvedValue({ error: null });

    await deleteUploadedObject(createFakeSupabase() as never, STORAGE_PATH);

    expect(removeMock).toHaveBeenCalledWith([STORAGE_PATH]);
  });

  it("logs, but never throws, when the removal itself fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    removeMock.mockResolvedValue({ error: { message: "boom" } });

    await expect(deleteUploadedObject(createFakeSupabase() as never, STORAGE_PATH)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
