import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "./logout-button";

const signOut = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("LogoutButton", () => {
  beforeEach(() => {
    signOut.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  it("calls signOut with global scope when clicked", async () => {
    signOut.mockResolvedValue({ error: null });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "global" }));
  });

  it("redirects to / and refreshes on a successful sign-out", async () => {
    signOut.mockResolvedValue({ error: null });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a retry-able inline error and does not navigate away on a failed sign-out", async () => {
    signOut.mockResolvedValue({
      error: { message: "Network request failed", code: "unexpected_failure" },
    });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't log you out/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("never leaves the button stuck disabled after an error", async () => {
    signOut.mockResolvedValue({
      error: { message: "Network request failed", code: "unexpected_failure" },
    });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^log out$/i })).toBeEnabled(),
    );
  });
});
