import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const signInWithPassword = vi.fn();
const resend = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword, resend } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

async function fillForm(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    resend.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  it("shows inline required-field errors for an empty submit and never calls signInWithPassword", async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows an inline error for an invalid email format and never calls signInWithPassword", async () => {
    render(<LoginForm />);
    await fillForm("not-an-email", "somepassword");

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("announces the invalid-email field error via role=alert, linked to the input via aria-describedby", async () => {
    render(<LoginForm />);
    await fillForm("not-an-email", "somepassword");

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(/enter a valid email address/i);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-describedby", error.id);
  });

  it("shows 'Invalid email or password' inline on invalid_credentials and stays on the login form", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    render(<LoginForm />);
    await fillForm("user@example.com", "wrongpass1");

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("swaps to the verify-your-email state with a resend control on email_not_confirmed", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    });
    render(<LoginForm />);
    await fillForm("unverified@example.com", "abcd1234");

    expect(await screen.findByText(/verify your email first/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend email/i })).toBeEnabled();
  });

  it("redirects to / on a successful login", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm />);
    await fillForm("user@example.com", "abcd1234");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a retry-able server-error message, distinct from the invalid-credentials copy, on a genuine failure", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Network request failed", code: "unexpected_failure" },
    });
    render(<LoginForm />);
    await fillForm("user@example.com", "abcd1234");

    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong signing you in/i);
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });

  it("never leaves the submit button stuck disabled after an error", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    render(<LoginForm />);
    await fillForm("user@example.com", "wrongpass1");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^log in$/i })).toBeEnabled(),
    );
  });
});
