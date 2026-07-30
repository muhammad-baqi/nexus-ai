import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./theme-toggle";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim();
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    clearCookies();
    document.documentElement.classList.remove("dark");
  });

  it("marks the initial preference as pressed", () => {
    render(<ThemeToggle initialPreference="light" />);
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "false");
  });

  it("applies the theme immediately and PATCHes /api/settings", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ThemeToggle initialPreference="light" />);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ theme_preference: "dark" }),
        }),
      ),
    );
  });

  it("reverts to the previous theme if saving fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ThemeToggle initialPreference="light" />);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reverts to the previous theme if the fetch itself throws (offline/network failure)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));
    render(<ThemeToggle initialPreference="light" />);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
  });
});
