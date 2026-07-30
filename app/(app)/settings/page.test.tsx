import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const single = vi.fn();
const createSignedUrl = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(), signInWithPassword: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SettingsPage from "./page";

describe("SettingsPage", () => {
  it("renders Profile, Change Password, and Delete Account sections", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com" } } });
    single.mockResolvedValue({ data: { display_name: "Ada", avatar_url: null } });

    render(await SettingsPage());

    expect(screen.getByRole("heading", { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /delete account/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada");
  });

  it("signs the avatar path into a URL when one is set", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com" } } });
    single.mockResolvedValue({ data: { display_name: null, avatar_url: "user-1/avatar.png" } });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example.com/avatar" } });

    render(await SettingsPage());

    expect(screen.getByAltText("Your avatar")).toHaveAttribute(
      "src",
      "https://signed.example.com/avatar",
    );
  });
});
