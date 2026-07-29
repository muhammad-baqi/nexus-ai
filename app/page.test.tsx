import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

// LogoutButton renders in the signed-in branch — give it a harmless client environment.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import Home from "./page";

describe("Home", () => {
  it("shows the signed-in state with a working Logout button when a user is present", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "user@example.com" } } });

    render(await Home());

    expect(screen.getByText(/signed in as user@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeEnabled();
  });

  it("shows Log in/Register links and no Logout button when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    render(await Home());

    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /register/i })).toHaveAttribute("href", "/register");
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
  });
});
