import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageSelector } from "./language-selector";

describe("LanguageSelector", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("selecting English PATCHes language_preference: 'en'", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<LanguageSelector initialPreference="en" />);

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ language_preference: "en" }),
        }),
      ),
    );
  });

  it("a failed PATCH rolls the selection back and shows an error", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<LanguageSelector initialPreference="en" />);

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  });
});
