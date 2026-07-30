import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChangePasswordForm } from "./change-password-form";

const getUser = vi.fn();
const signInWithPassword = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser, signInWithPassword, updateUser, signOut },
  }),
}));

async function submit(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: /change password/i }));
}

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    getUser.mockReset();
    signInWithPassword.mockReset();
    updateUser.mockReset();
    signOut.mockReset();
    getUser.mockResolvedValue({ data: { user: { email: "user@example.com" } } });
  });

  it("shows inline validation errors and never calls getUser for an invalid submission", async () => {
    render(<ChangePasswordForm />);
    await submit("", "weak", "weak");

    expect(await screen.findByText(/enter your current password/i)).toBeInTheDocument();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("re-verifies the current password, updates, and signs out other sessions only", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<ChangePasswordForm />);
    await submit("oldpass1", "newpass1", "newpass1");

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "oldpass1",
      }),
    );
    expect(updateUser).toHaveBeenCalledWith({ password: "newpass1" });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(await screen.findByText(/other signed-in sessions have been logged out/i)).toBeInTheDocument();
  });

  it("shows a wrong-current-password error and never calls updateUser when re-auth fails", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    render(<ChangePasswordForm />);
    await submit("wrongpass", "newpass1", "newpass1");

    expect(await screen.findByRole("alert")).toHaveTextContent(/current password is incorrect/i);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
