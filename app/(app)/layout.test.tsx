import { describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const redirect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

import AppLayout from "./layout";

describe("AppLayout", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    getUser.mockReset();
    redirect.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });

    await AppLayout({ children: "child" as unknown as React.ReactNode });

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("renders children without redirecting for an authenticated user", async () => {
    getUser.mockReset();
    redirect.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const result = await AppLayout({ children: "child" as unknown as React.ReactNode });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBe("child");
  });
});
