import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));

import { GET } from "./route";

function requestFor(query: string) {
  return new NextRequest(`http://localhost:3000/auth/confirm${query}`);
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
  });

  it("calls verifyOtp and redirects to status=success on a valid token_hash + type=email", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    const response = await GET(requestFor("?token_hash=abc123&type=email"));

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "email" });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/verify-email?status=success",
    );
  });

  it("redirects to status=invalid without calling verifyOtp when token_hash is missing", async () => {
    const response = await GET(requestFor("?type=email"));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/verify-email?status=invalid",
    );
  });

  it("redirects to status=invalid without calling verifyOtp when type is unsupported", async () => {
    const response = await GET(requestFor("?token_hash=abc123&type=recovery"));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/verify-email?status=invalid",
    );
  });

  it("redirects to status=expired when verifyOtp reports an expired token", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired", code: "otp_expired" } });

    const response = await GET(requestFor("?token_hash=abc123&type=email"));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/verify-email?status=expired",
    );
  });

  it("redirects to status=invalid for any other verifyOtp error", async () => {
    verifyOtp.mockResolvedValue({
      error: { message: "Token has already been used", code: "unexpected_failure" },
    });

    const response = await GET(requestFor("?token_hash=abc123&type=email"));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/verify-email?status=invalid",
    );
  });
});
