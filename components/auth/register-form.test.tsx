import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

async function submitAndReachCheckYourEmail(email: string = "new-user@example.com") {
  signUp.mockResolvedValue({ data: {}, error: null });
  render(<RegisterForm />);
  await fillForm(email, "abcd1234");
  await screen.findByText(/check your email/i);
}

describe("RegisterForm", () => {
  beforeEach(() => {
    signUp.mockReset();
    resend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("shows an inline error for mismatched passwords and never calls signUp", async () => {
    render(<RegisterForm />);
    await fillForm("user@example.com", "abcd1234", "abcd9999");

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows the check-your-email screen on a successful signUp", async () => {
    signUp.mockResolvedValue({ data: {}, error: null });
    render(<RegisterForm />);
    await fillForm("new-user@example.com", "abcd1234");

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(signUp).toHaveBeenCalledWith({
      email: "new-user@example.com",
      password: "abcd1234",
    });
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

  it("calls resend with type signup and the registered email", async () => {
    resend.mockResolvedValue({ data: {}, error: null });
    await submitAndReachCheckYourEmail("resend-me@example.com");

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));

    await waitFor(() =>
      expect(resend).toHaveBeenCalledWith({ type: "signup", email: "resend-me@example.com" }),
    );
  });

  it("disables the resend button with a cooldown after a successful send, and a second click does not resend again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resend.mockResolvedValue({ data: {}, error: null });
    await submitAndReachCheckYourEmail();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /resend email/i }));
    });

    expect(resend).toHaveBeenCalledTimes(1);
    const cooldownButton = screen.getByRole("button", { name: /resend email \(\d+s\)/i });
    expect(cooldownButton).toBeDisabled();

    fireEvent.click(cooldownButton);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("shows a 'please wait' message and starts a cooldown on a rate-limited resend", async () => {
    resend.mockResolvedValue({
      data: {},
      error: { message: "Too many requests", code: "over_email_send_rate_limit" },
    });
    await submitAndReachCheckYourEmail();

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/wait a bit/i);
    expect(screen.getByRole("button", { name: /resend email \(\d+s\)/i })).toBeDisabled();
  });

  it("shows a retry-able error and keeps the check-your-email screen on a generic resend failure, without starting a cooldown", async () => {
    resend.mockResolvedValue({
      data: {},
      error: { message: "Network request failed", code: "unexpected_failure" },
    });
    await submitAndReachCheckYourEmail();

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't resend/i);
    expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^resend email$/i })).toBeEnabled();
  });

  it("shows the same generic error for an already-confirmed account as any other resend failure — no account-state enumeration", async () => {
    resend.mockResolvedValue({
      data: {},
      error: { message: "Email already confirmed", code: "email_already_confirmed" },
    });
    await submitAndReachCheckYourEmail();

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't resend/i);
    expect(screen.queryByText(/already confirmed/i)).not.toBeInTheDocument();
  });
});
