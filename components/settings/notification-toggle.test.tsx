import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationToggle } from "./notification-toggle";

describe("NotificationToggle", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("toggling PATCHes the flipped notification_email_enabled value", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<NotificationToggle initialEnabled={true} />);

    fireEvent.click(screen.getByRole("button", { name: "On" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ notification_email_enabled: false }),
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Off" })).toBeInTheDocument();
  });

  it("a failed PATCH rolls the toggle back and shows an error", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<NotificationToggle initialEnabled={true} />);

    fireEvent.click(screen.getByRole("button", { name: "On" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(screen.getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
  });
});
