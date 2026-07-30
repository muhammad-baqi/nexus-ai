import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteAccountForm } from "./delete-account-form";

const signOut = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

async function submit(password: string) {
  fireEvent.change(screen.getByLabelText("Confirm your password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: /permanently delete my account/i }));
}

describe("DeleteAccountForm", () => {
  beforeEach(() => {
    signOut.mockReset();
    push.mockReset();
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows an inline error for an empty password and never calls fetch", async () => {
    render(<DeleteAccountForm />);
    await submit("");

    expect(await screen.findByText(/enter your password to confirm/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts to /api/auth/account and signs out + redirects home on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ deleted: true }),
    });
    signOut.mockResolvedValue({ error: null });
    render(<DeleteAccountForm />);
    await submit("correcthorse1");

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/account",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows a wrong-password error on a 401 response and does not sign out", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "invalid_password" } }),
    });
    render(<DeleteAccountForm />);
    await submit("wrongpassword");

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect password/i);
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a generic retry-able error on a server failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: "delete_failed" } }),
    });
    render(<DeleteAccountForm />);
    await submit("correcthorse1");

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong deleting/i);
  });
});
