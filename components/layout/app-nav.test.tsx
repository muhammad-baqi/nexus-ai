import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppNav } from "./app-nav";

describe("AppNav", () => {
  it("links to Dashboard, Search, Collections, Tags, Trash, and Settings, and renders Logout", () => {
    render(<AppNav />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "href",
      "/collections",
    );
    expect(screen.getByRole("link", { name: "Tags" })).toHaveAttribute("href", "/tags");
    expect(screen.getByRole("link", { name: "Trash" })).toHaveAttribute("href", "/trash");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });
});
