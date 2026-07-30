import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const statelessSignInWithPassword = vi.fn();
const list = vi.fn();
const remove = vi.fn();
const deleteUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ list, remove }) },
    auth: { admin: { deleteUser } },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: statelessSignInWithPassword } }),
}));

import { POST } from "./route";

function requestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/account", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/account", () => {
  beforeEach(() => {
    getUser.mockReset();
    statelessSignInWithPassword.mockReset();
    list.mockReset();
    remove.mockReset();
    deleteUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com" } } });
    list.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 400 for a missing password without touching Supabase", async () => {
    const response = await POST(requestWith({}));

    expect(response.status).toBe(400);
    expect(statelessSignInWithPassword).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("returns 401 without deleting when the current session has no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestWith({ password: "whatever1" }));

    expect(response.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("returns 401 and never deletes when password re-verification fails", async () => {
    statelessSignInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });

    const response = await POST(requestWith({ password: "wrongpass1" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_password");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("re-verifies the password, cleans up avatars, and deletes the user on success", async () => {
    statelessSignInWithPassword.mockResolvedValue({ error: null });
    list.mockResolvedValue({ data: [{ name: "avatar.png" }] });
    deleteUser.mockResolvedValue({ error: null });

    const response = await POST(requestWith({ password: "correcthorse1" }));

    expect(statelessSignInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "correcthorse1",
    });
    expect(remove).toHaveBeenCalledWith(["user-1/avatar.png"]);
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it("still deletes the account even if avatar cleanup throws", async () => {
    statelessSignInWithPassword.mockResolvedValue({ error: null });
    list.mockRejectedValue(new Error("bucket not found"));
    deleteUser.mockResolvedValue({ error: null });

    const response = await POST(requestWith({ password: "correcthorse1" }));

    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
  });

  it("still deletes the account and logs when list() resolves with an error instead of throwing", async () => {
    // The realistic failure shape for a not-yet-provisioned bucket: Supabase JS resolves
    // { data: null, error } rather than rejecting the promise.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    statelessSignInWithPassword.mockResolvedValue({ error: null });
    list.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });
    deleteUser.mockResolvedValue({ error: null });

    const response = await POST(requestWith({ password: "correcthorse1" }));

    expect(consoleError).toHaveBeenCalledWith(
      "[api/auth/account] avatar list failed, continuing with deletion:",
      { message: "Bucket not found" },
    );
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
    consoleError.mockRestore();
  });

  it("returns 500 when the admin deleteUser call fails", async () => {
    statelessSignInWithPassword.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValue({ error: { message: "boom" } });

    const response = await POST(requestWith({ password: "correcthorse1" }));

    expect(response.status).toBe(500);
  });
});
