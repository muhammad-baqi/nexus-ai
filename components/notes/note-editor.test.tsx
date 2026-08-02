import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoteEditor } from "./note-editor";

// The Rich text surface's own parse/serialize/toolbar behavior is already covered by
// note-rich-text-editor.test.tsx — here we only need to prove that whatever it reports via
// onChange flows into the same autosave draft as the Markdown textarea does.
vi.mock("@/components/notes/note-rich-text-editor", () => ({
  NoteRichTextEditor: ({
    content,
    onChange,
  }: {
    content: string;
    onChange: (value: string) => void;
  }) => (
    <button type="button" onClick={() => onChange(`${content} edited via rich text`)}>
      Simulate rich text edit
    </button>
  ),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

const baseItem = {
  id: "item-1",
  title: "Trip planning",
  description: "Packing list",
  updated_at: "2026-08-01T00:00:00.000Z",
};

// Flushes pending promise microtasks (e.g. the initial GET's .then() chain) without depending
// on real wall-clock time — safe to call whether or not fake timers are active for this test.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("NoteEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens in view mode, rendering the body instead of the textarea", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);
    await flush();

    expect(screen.getByRole("heading", { name: "Trip planning" })).toBeInTheDocument();
    expect(screen.getByText("Packing list")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/items/item-1");
  });

  it("a freshly created note (default title, empty body) opens straight into edit mode", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, title: "Untitled Note", description: null }),
    );

    render(<NoteEditor itemId="item-1" />);
    await flush();

    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Body")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Untitled Note" })).not.toBeInTheDocument();
  });

  it("shows a load error and never renders the view or the form when the fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(null, false));

    render(<NoteEditor itemId="item-1" />);
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't be loaded/i);
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("clicking Edit switches to the form, pre-filled with the current title/body — no Save button anywhere", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ ...baseItem, description: "# Heading with **bold** text" }),
    );

    render(<NoteEditor itemId="item-1" />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByDisplayValue("Trip planning")).toBeInTheDocument();
    expect(screen.getByDisplayValue("# Heading with **bold** text")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });

  it("typing in the body triggers an autosave PATCH after the debounce, with no Save click", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValueOnce(jsonResponse({ ...baseItem, description: "Updated list" }));

    render(<NoteEditor itemId="item-1" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Updated list" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Trip planning", description: "Updated list" }),
      }),
    );
  });

  it("the status indicator shows Saving… while in flight and disappears again once saved", async () => {
    let resolvePatch!: (value: unknown) => void;
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePatch = resolve;
        }),
      );

    render(<NoteEditor itemId="item-1" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Updated list" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    await act(async () => {
      resolvePatch(jsonResponse({ ...baseItem, description: "Updated list" }));
      await vi.advanceTimersByTimeAsync(0);
    });

    // Only shown once there's something to say — a freshly-saved note stays quiet.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clearing the title shows an inline error, disables Done, and never triggers a PATCH", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText("Title is required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^done$/i })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a failed autosave keeps the typed content and, once retries are exhausted, shows Not saved with a working Retry now", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValue(jsonResponse({ error: { message: "boom" } }, false));

    render(<NoteEditor itemId="item-1" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Draft content" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // initial attempt
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000); // retry 1
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000); // retry 2
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000); // retry 3 -> exhausted
    });

    expect(screen.getByRole("status")).toHaveTextContent("Not saved");
    expect(screen.getByDisplayValue("Draft content")).toBeInTheDocument();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ ...baseItem, description: "Draft content" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^retry now$/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Only shown once there's something to say — a freshly-saved note stays quiet.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("leaving edit mode (Done) and reopening it (Edit) preserves an in-progress draft instead of reverting to the last-synced value", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

    render(<NoteEditor itemId="item-1" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Still typing" } });
    // Leave before the debounce fires — the draft is only in local state, not yet autosaved.
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByDisplayValue("Still typing")).toBeInTheDocument();
  });

  it("editing via the Rich text surface also drives the autosave cycle", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse(baseItem))
      .mockResolvedValueOnce(
        jsonResponse({ ...baseItem, description: "Packing list edited via rich text" }),
      );

    render(<NoteEditor itemId="item-1" />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rich text" }));

    fireEvent.click(screen.getByRole("button", { name: "Simulate rich text edit" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Trip planning",
          description: "Packing list edited via rich text",
        }),
      }),
    );
  });
});
