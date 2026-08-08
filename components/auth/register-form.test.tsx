import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "./register-form";

const signUp = vi.fn();
const resend = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp, resend } }),
}));

async function fillForm(
  email: string,
  password: string,
  confirmPassword: string = password,
) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: confirmPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

describe("RegisterForm", () => {
  beforeEach(() => {
    signUp.mockReset();
    resend.mockReset();
  });

  it("shows password requirements before any submit attempt", () => {
    render(<RegisterForm />);
    expect(
      screen.getByText(/at least 8 characters.*one letter and one number/i),
    ).toBeInTheDocument();
  });

  it("shows an inline error for a short password and never calls signUp", async () => {
    render(<RegisterForm />);
    await fillForm("user@example.com", "ab1");

    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("announces the short-password field error via role=alert, linked to the input via aria-describedby", async () => {
    render(<RegisterForm />);
    await fillForm("user@example.com", "ab1");

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(/password must be at least 8 characters/i);
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", error.id);
  });

  it("shows an inline error for mismatched passwords and never calls signUp", async () => {
    render(<RegisterForm />);
    await fillForm("user@example.com", "abcd1234", "abcd9999");

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows the check-your-email screen with a working resend control on a successful signUp", async () => {
    signUp.mockResolvedValue({ data: {}, error: null });
    render(<RegisterForm />);
    await fillForm("new-user@example.com", "abcd1234");

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(signUp).toHaveBeenCalledWith({
      email: "new-user@example.com",
      password: "abcd1234",
    });
    expect(screen.getByRole("button", { name: /resend email/i })).toBeEnabled();
  });

  it("shows the identical check-your-email screen when Supabase reports a duplicate email by code", async () => {
    // Only reachable locally, where supabase/config.toml disables email
    // confirmation — with confirmations on (staging/prod), Supabase already
    // returns { error: null } for a duplicate, which case 5 above covers.
    signUp.mockResolvedValue({
      data: {},
      error: { message: "User already registered", code: "user_already_exists" },
    });
    render(<RegisterForm />);
    await fillForm("existing-user@example.com", "abcd1234");

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });

  it("shows the check-your-email screen with a resend-cooldown note when signUp is rate-limited on resend", async () => {
    // Regression test: re-submitting registration for an email that just signed up moments ago
    // (within GoTrue's 60s max_frequency window) returns this code, not
    // DUPLICATE_EMAIL_ERROR_CODE — confirmed live against real local Supabase, where the raw
    // error was "AuthApiError: For security purposes, you can only request this after 58
    // seconds." Before this was special-cased it fell through to the generic error branch
    // ("Something went wrong creating your account"), hiding the fact that a valid confirmation
    // email from the earlier attempt already existed.
    signUp.mockResolvedValue({
      data: {},
      error: { message: "For security purposes, you can only request this after 58 seconds.", code: "over_email_send_rate_limit" },
    });
    render(<RegisterForm />);
    await fillForm("recently-registered@example.com", "abcd1234");

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/already requested one recently/i)).toBeInTheDocument();
  });

  it("shows a retry-able error message on a genuine signUp failure", async () => {
    signUp.mockResolvedValue({
      data: {},
      error: { message: "Network request failed", code: "unexpected_failure" },
    });
    render(<RegisterForm />);
    await fillForm("user@example.com", "abcd1234");

    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong/i);
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });

  it("never leaves the submit button stuck disabled after an error", async () => {
    signUp.mockResolvedValue({
      data: {},
      error: { message: "Network request failed", code: "unexpected_failure" },
    });
    render(<RegisterForm />);
    await fillForm("user@example.com", "abcd1234");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /create account/i })).toBeEnabled(),
    );
  });
});
