import { beforeEach, describe, expect, it, vi } from "vitest";

const { signFileUrl } = vi.hoisted(() => ({ signFileUrl: vi.fn() }));
vi.mock("@/lib/files/signed-url", () => ({ signFileUrl }));

const { fetchFileAsset } = await import("./file-asset");

const ITEM_ID = "123e4567-e89b-12d3-a456-426614174000";

function createFakeSupabase(response: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(response),
        }),
      }),
    }),
  };
}

describe("fetchFileAsset", () => {
  beforeEach(() => {
    signFileUrl.mockReset();
  });

  it("returns null when the read itself fails, and logs it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createFakeSupabase({ data: null, error: { message: "boom" } });

    const result = await fetchFileAsset(supabase as never, ITEM_ID);

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns null when there is genuinely no row, without calling signFileUrl", async () => {
    const supabase = createFakeSupabase({ data: null, error: null });

    const result = await fetchFileAsset(supabase as never, ITEM_ID);

    expect(result).toBeNull();
    expect(signFileUrl).not.toHaveBeenCalled();
  });

  it("attaches a freshly-signed download_url to the returned asset", async () => {
    signFileUrl.mockResolvedValue("https://signed.example/x");
    const supabase = createFakeSupabase({
      data: {
        storage_path: "user-1/upload-id/report.pdf",
        original_filename: "report.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
        extraction_status: "success",
      },
      error: null,
    });

    const result = await fetchFileAsset(supabase as never, ITEM_ID);

    expect(result).toEqual({
      original_filename: "report.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      extraction_status: "success",
      download_url: "https://signed.example/x",
    });
    expect(signFileUrl).toHaveBeenCalledWith(supabase, "user-1/upload-id/report.pdf");
  });
});
