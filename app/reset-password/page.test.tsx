import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: vi.fn(), signOut: vi.fn() } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import ResetPasswordPage from "./page";

async function renderWithStatus(status?: string) {
  const ui = await ResetPasswordPage({ searchParams: Promise.resolve({ status }) });
  render(ui);
}

describe("ResetPasswordPage", () => {
  it("renders the set-new-password form when there's no error status", async () => {
    await renderWithStatus(undefined);
    expect(screen.getByText(/set a new password/i)).toBeInTheDocument();
  });

  it("renders the form on status=success too", async () => {
    await renderWithStatus("success");
    expect(screen.getByText(/set a new password/i)).toBeInTheDocument();
  });

  it("renders the expired state with a link to request a new one", async () => {
    await renderWithStatus("expired");

    expect(screen.getByText(/this link has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new reset link/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("renders the invalid state with a link to request a new one", async () => {
    await renderWithStatus("invalid");

    expect(screen.getByText(/this link isn't valid/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new reset link/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
