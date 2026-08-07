import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RemindersPanel } from "./reminders-panel";

function mockFetchSequence(...responses: Array<Partial<Response> & { json?: () => unknown }>) {
  const fn = vi.fn();
  for (const response of responses) {
    fn.mockResolvedValueOnce({ ok: true, json: async () => ({}), ...response });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

const DAILY_REMINDER = {
  id: "rem-1",
  type: "daily",
  schedule: { hour: 9, minute: 0 },
  next_fire_at: "2026-08-10T09:00:00.000Z",
  is_active: true,
  created_at: "2026-08-01T00:00:00.000Z",
};

describe("RemindersPanel", () => {
  it("loads and renders active reminders", async () => {
    mockFetchSequence({ json: async () => ({ reminders: [DAILY_REMINDER] }) });
    render(<RemindersPanel itemId="item-1" />);

    expect(await screen.findByText(/Daily at 09:00 UTC/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no active reminders", async () => {
    mockFetchSequence({ json: async () => ({ reminders: [] }) });
    render(<RemindersPanel itemId="item-1" />);

    expect(await screen.findByText("No active reminders.")).toBeInTheDocument();
  });

  it("creating a daily reminder POSTs the right type-specific payload", async () => {
    const fetchMock = mockFetchSequence(
      { json: async () => ({ reminders: [] }) }, // initial load
      { status: 201, json: async () => ({ reminder: DAILY_REMINDER }) }, // create
      { json: async () => ({ reminders: [DAILY_REMINDER] }) }, // reload after save
    );
    render(<RemindersPanel itemId="item-1" />);

    await screen.findByText("No active reminders.");
    fireEvent.click(screen.getByRole("button", { name: "Add reminder" }));
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "daily" } });
    fireEvent.change(screen.getByLabelText("Time (UTC)"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/item-1/reminders",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: "daily", hour: 9, minute: 0 }),
        }),
      ),
    );
  });

  it("creating a one-time reminder POSTs fire_at as an ISO string", async () => {
    const fetchMock = mockFetchSequence(
      { json: async () => ({ reminders: [] }) },
      { status: 201, json: async () => ({ reminder: DAILY_REMINDER }) },
      { json: async () => ({ reminders: [] }) },
    );
    render(<RemindersPanel itemId="item-1" />);

    await screen.findByText("No active reminders.");
    fireEvent.click(screen.getByRole("button", { name: "Add reminder" }));
    fireEvent.change(screen.getByLabelText("Date & time"), { target: { value: "2099-01-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, init] = fetchMock.mock.calls[1];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.type).toBe("one_time");
    expect(new Date(body.fire_at).getTime()).toBe(new Date("2099-01-01T10:00").getTime());
  });

  it("cancelling a reminder calls DELETE and removes it from the active list", async () => {
    const fetchMock = mockFetchSequence(
      { json: async () => ({ reminders: [DAILY_REMINDER] }) }, // initial load
      { json: async () => ({ reminder: { ...DAILY_REMINDER, is_active: false } }) }, // DELETE
      { json: async () => ({ reminders: [{ ...DAILY_REMINDER, is_active: false }] }) }, // reload
    );
    render(<RemindersPanel itemId="item-1" />);

    await screen.findByText(/Daily at 09:00 UTC/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/reminders/rem-1", expect.objectContaining({ method: "DELETE" })),
    );
    expect(await screen.findByText(/Cancelled/)).toBeInTheDocument();
  });

  it("editing a reminder's time calls PATCH and reflects the updated schedule", async () => {
    const updated = { ...DAILY_REMINDER, schedule: { hour: 18, minute: 0 } };
    const fetchMock = mockFetchSequence(
      { json: async () => ({ reminders: [DAILY_REMINDER] }) }, // initial load
      { json: async () => ({ reminder: updated }) }, // PATCH
      { json: async () => ({ reminders: [updated] }) }, // reload
    );
    render(<RemindersPanel itemId="item-1" />);

    await screen.findByText(/Daily at 09:00 UTC/);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Time (UTC)"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reminders/rem-1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ type: "daily", hour: 18, minute: 0 }) }),
      ),
    );
    expect(await screen.findByText(/Daily at 18:00 UTC/)).toBeInTheDocument();
  });
});
