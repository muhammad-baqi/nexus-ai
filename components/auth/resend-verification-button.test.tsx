import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResendVerificationButton } from "./resend-verification-button";

const resend = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { resend } }),
}));

describe("ResendVerificationButton", () => {
  beforeEach(() => {
    resend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls resend with type signup and the given email", async () => {
    resend.mockResolvedValue({ data: {}, error: null });
    render(<ResendVerificationButton email="resend-me@example.com" />);

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));

    await waitFor(() =>
      expect(resend).toHaveBeenCalledWith({ type: "signup", email: "resend-me@example.com" }),
    );
  });

  it("disables the button with a cooldown after a successful send, and a second click does not resend again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resend.mockResolvedValue({ data: {}, error: null });
    render(<ResendVerificationButton email="user@example.com" />);

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
    render(<ResendVerificationButton email="user@example.com" />);

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/wait a bit/i);
    expect(screen.getByRole("button", { name: /resend email \(\d+s\)/i })).toBeDisabled();
  });

  it("shows a retry-able error on a generic resend failure, without starting a cooldown", async () => {
    resend.mockResolvedValue({
      data: {},
      error: { message: "Network request failed", code: "unexpected_failure" },
    });
    render(<ResendVerificationButton email="user@example.com" />);

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't resend/i);
    expect(screen.getByRole("button", { name: /^resend email$/i })).toBeEnabled();
  });

  it("shows the same generic error for an already-confirmed account as any other failure — no account-state enumeration", async () => {
    resend.mockResolvedValue({
      data: {},
      error: { message: "Email already confirmed", code: "email_already_confirmed" },
    });
    render(<ResendVerificationButton email="user@example.com" />);

    fireEvent.click(screen.getByRole("button", { name: /resend email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't resend/i);
    expect(screen.queryByText(/already confirmed/i)).not.toBeInTheDocument();
  });
});
