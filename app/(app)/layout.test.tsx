import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const redirect = vi.fn();
const single = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

vi.mock("next/navigation", () => ({
  // The real redirect() throws to halt rendering — replicate that here, since AppLayout keeps
  // reading `user` after calling it (safe in production only because of this throw).
  redirect: (path: string) => {
    redirect(path);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import AppLayout from "./layout";

describe("AppLayout", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    getUser.mockReset();
    redirect.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(
      AppLayout({ children: "child" as unknown as React.ReactNode }),
    ).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("renders the nav and children without redirecting for an authenticated user", async () => {
    getUser.mockReset();
    redirect.mockReset();
    single.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    single.mockResolvedValue({ data: { theme_preference: "system" } });

    const result = await AppLayout({ children: "child" as unknown as React.ReactNode });
    render(result as React.ReactElement);

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "href",
      "/collections",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("still renders the nav and children (without applying a theme) if the profile fetch fails", async () => {
    getUser.mockReset();
    redirect.mockReset();
    single.mockReset();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    single.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await AppLayout({ children: "child" as unknown as React.ReactNode });
    render(result as React.ReactElement);

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "[app-layout] fetching theme_preference failed:",
      { message: "boom" },
    );
    consoleError.mockRestore();
  });
});
