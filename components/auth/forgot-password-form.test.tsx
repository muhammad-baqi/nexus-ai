import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordForm } from "./forgot-password-form";

const resetPasswordForEmail = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { resetPasswordForEmail } }),
}));

async function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
}

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset();
  });

  it("shows an inline error for an invalid email and never calls resetPasswordForEmail", async () => {
    render(<ForgotPasswordForm />);
    await submit("not-an-email");

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("shows the same generic 'check your email' message on success", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    render(<ForgotPasswordForm />);
    await submit("user@example.com");

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/if an account exists for user@example.com/i)).toBeInTheDocument();
  });

  it("shows the same generic 'check your email' message even when the account doesn't exist — no enumeration", async () => {
    // docs/01_MVP/Authentication.md: resetPasswordForEmail itself never reveals non-existence —
    // Supabase returns { error: null } regardless, so the UI can't and doesn't distinguish it.
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    render(<ForgotPasswordForm />);
    await submit("unknown@example.com");

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });

  it("shows a rate-limited message but still the generic copy on over_email_send_rate_limit", async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: "Too many requests", code: "over_email_send_rate_limit" },
    });
    render(<ForgotPasswordForm />);
    await submit("user@example.com");

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/wait a bit/i)).toBeInTheDocument();
  });

  it("shows a retry-able error on a genuine failure, not the success screen", async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: "Network request failed", code: "unexpected_failure" },
    });
    render(<ForgotPasswordForm />);
    await submit("user@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });
});
