import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const redirect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

import Home from "./page";

describe("Home", () => {
  it("redirects to /dashboard when a user is present", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "user@example.com" } } });
    redirect.mockReset();

    await Home();

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("shows Log in/Register links when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    redirect.mockReset();

    render(await Home());

    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /register/i })).toHaveAttribute("href", "/register");
    expect(redirect).not.toHaveBeenCalled();
  });
});
