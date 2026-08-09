import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname,
}));

import { AppNav } from "./app-nav";

describe("AppNav", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/dashboard");
  });

  it("links to Dashboard, Search, Collections, Tags, Trash, Activity, and Settings, and renders Logout", () => {
    render(<AppNav />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "href",
      "/collections",
    );
    expect(screen.getByRole("link", { name: "Tags" })).toHaveAttribute("href", "/tags");
    expect(screen.getByRole("link", { name: "Trash" })).toHaveAttribute("href", "/trash");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("marks the current route active via aria-current, including nested routes", () => {
    usePathname.mockReturnValue("/collections/some-id");
    render(<AppNav />);

    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
});
