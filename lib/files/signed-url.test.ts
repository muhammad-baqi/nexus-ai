import { describe, expect, it, vi } from "vitest";

import { signFileUrl } from "./signed-url";

function createFakeSupabase(response: { data: { signedUrl: string } | null; error: unknown }) {
  return {
    storage: {
      from: () => ({ createSignedUrl: vi.fn().mockResolvedValue(response) }),
    },
  };
}

describe("signFileUrl", () => {
  it("returns the signed URL on success", async () => {
    const supabase = createFakeSupabase({ data: { signedUrl: "https://signed.example/x" }, error: null });

    const result = await signFileUrl(supabase as never, "user-1/upload-id/report.pdf");

    expect(result).toBe("https://signed.example/x");
  });

  it("returns null and logs when createSignedUrl fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createFakeSupabase({ data: null, error: { message: "boom" } });

    const result = await signFileUrl(supabase as never, "user-1/upload-id/report.pdf");

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
