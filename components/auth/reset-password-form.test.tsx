import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "./reset-password-form";

const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser, signOut } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

async function submit(password: string, confirmPassword: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirmPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: /set new password/i }));
}

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    updateUser.mockReset();
    signOut.mockReset();
    push.mockReset();
  });

  it("shows an inline error for a weak password and never calls updateUser", async () => {
    render(<ResetPasswordForm />);
    await submit("weak", "weak");

    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("shows an inline error for mismatched passwords", async () => {
    render(<ResetPasswordForm />);
    await submit("abcd1234", "abcd5678");

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password, signs out globally, and redirects to /login?reset=success", async () => {
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<ResetPasswordForm />);
    await submit("abcd1234", "abcd1234");

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "abcd1234" }));
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(push).toHaveBeenCalledWith("/login?reset=success");
  });

  it("shows a retry-able error and does not redirect if updateUser fails", async () => {
    updateUser.mockResolvedValue({ error: { message: "Auth session missing", code: "no_session" } });
    render(<ResetPasswordForm />);
    await submit("abcd1234", "abcd1234");

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
