import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls verifyOtp and redirects to status=success on a valid token_hash + type=email", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    const response = await GET(requestFor("?token_hash=abc123&type=email"));

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "email" });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/verify-email?status=success",
    );
  });

  it("calls verifyOtp and redirects to /reset-password?status=success on a valid token_hash + type=recovery", async () => {
    verifyOtp.mockResolvedValue({ error: null });

    const response = await GET(requestFor("?token_hash=abc123&type=recovery"));

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "recovery" });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/reset-password?status=success",
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
    const response = await GET(requestFor("?token_hash=abc123&type=bogus"));

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

  it("redirects to /reset-password?status=expired for an expired recovery token", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired", code: "otp_expired" } });

    const response = await GET(requestFor("?token_hash=abc123&type=recovery"));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/reset-password?status=expired",
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

  it("ignores the request's Host header on Vercel and uses NEXT_PUBLIC_APP_URL instead", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://nexus.example.com");
    verifyOtp.mockResolvedValue({ error: null });

    const response = await GET(
      new NextRequest("http://attacker.example.com/auth/confirm?token_hash=abc123&type=email"),
    );

    expect(response.headers.get("location")).toBe(
      "https://nexus.example.com/verify-email?status=success",
    );
  });

  it("uses the request's own origin when not deployed (no VERCEL/production signal)", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://nexus.example.com");
    verifyOtp.mockResolvedValue({ error: null });

    const response = await GET(requestFor("?token_hash=abc123&type=email"));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/verify-email?status=success",
    );
  });
});
