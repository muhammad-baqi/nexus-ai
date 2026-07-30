import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  it("renders Change Password and Delete Account sections", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("heading", { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /delete account/i })).toBeInTheDocument();
  });
});
