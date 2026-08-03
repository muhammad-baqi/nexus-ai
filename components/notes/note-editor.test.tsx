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

// Isolates NoteVersionHistory's own fetch/render behavior (already covered by
// note-version-history.test.tsx) from NoteEditor's own wiring: the toggle, and threading a
// restore's content/versionId back into local state and the autosave hook's baseline.
vi.mock("@/components/notes/note-version-history", () => ({
  NoteVersionHistory: ({
    onRestored,
  }: {
    onRestored: (content: string, versionId: string | null) => void;
  }) => (
    <button type="button" onClick={() => onRestored("# Restored content", "restored-version")}>
      Simulate restore
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
  is_favorite: false,
  is_archived: false,
  tags: [] as { id: string; name: string }[],
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
        body: JSON.stringify({
          title: "Trip planning",
          description: "Updated list",
          openVersionId: null,
        }),
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
          openVersionId: null,
        }),
      }),
    );
  });

  describe("favorite/archive/tags", () => {
    it("renders TagInput with the note's current tags", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        jsonResponse({ ...baseItem, tags: [{ id: "tag-1", name: "travel" }] }),
      );

      render(<NoteEditor itemId="item-1" />);
      await flush();

      expect(screen.getByText("travel")).toBeInTheDocument();
      expect(screen.getByLabelText("Add tag")).toBeInTheDocument();
    });

    it("toggling Favorite in view mode PATCHes is_favorite and updates the label", async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(jsonResponse(baseItem))
        .mockResolvedValueOnce(jsonResponse({ ...baseItem, is_favorite: true }));

      render(<NoteEditor itemId="item-1" />);
      await flush();

      fireEvent.click(screen.getByRole("button", { name: /^favorite$/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(fetch).toHaveBeenCalledWith(
        "/api/items/item-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ is_favorite: true }),
        }),
      );
      expect(screen.getByRole("button", { name: /^unfavorite$/i })).toBeInTheDocument();
      expect(screen.getByLabelText("Favorited")).toBeInTheDocument();
    });

    it("toggling Archive in edit mode PATCHes is_archived", async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(jsonResponse(baseItem))
        .mockResolvedValueOnce(jsonResponse({ ...baseItem, is_archived: true }));

      render(<NoteEditor itemId="item-1" />);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(fetch).toHaveBeenCalledWith(
        "/api/items/item-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ is_archived: true }),
        }),
      );
      expect(screen.getByRole("button", { name: /^unarchive$/i })).toBeInTheDocument();
    });

    it("shows an inline error when a favorite/archive toggle fails", async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(jsonResponse(baseItem))
        .mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, false));

      render(<NoteEditor itemId="item-1" />);
      await flush();

      fireEvent.click(screen.getByRole("button", { name: /^favorite$/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByRole("alert")).toHaveTextContent("boom");
    });
  });

  describe("version history", () => {
    it("the History toggle shows/hides the panel, in both view and edit mode", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

      render(<NoteEditor itemId="item-1" />);
      await flush();

      expect(screen.queryByText("Simulate restore")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "History" }));
      expect(screen.getByText("Simulate restore")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      // Opened from view mode — stays open after switching to edit mode.
      expect(screen.getByText("Simulate restore")).toBeInTheDocument();
    });

    it("restoring a version updates the visible body and does not immediately fire another autosave PATCH for that same content", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(baseItem));

      render(<NoteEditor itemId="item-1" />);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      fireEvent.click(screen.getByRole("button", { name: "History" }));
      (fetch as ReturnType<typeof vi.fn>).mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Simulate restore" }));

      expect(screen.getByDisplayValue("# Restored content")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("the first autosave after entering Edit mode sends openVersionId: null; a restore's versionId is used for the next one", async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(jsonResponse(baseItem))
        .mockResolvedValueOnce(jsonResponse({ ...baseItem, description: "Second edit" }));

      render(<NoteEditor itemId="item-1" />);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      fireEvent.click(screen.getByRole("button", { name: "History" }));
      fireEvent.click(screen.getByRole("button", { name: "Simulate restore" }));

      fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Second edit" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(fetch).toHaveBeenCalledWith(
        "/api/items/item-1",
        expect.objectContaining({
          body: JSON.stringify({
            title: "Trip planning",
            description: "Second edit",
            openVersionId: "restored-version",
          }),
        }),
      );
    });

    it("a stale in-flight autosave response doesn't clobber a restore that happened while it was pending", async () => {
      // Self-review-caught race: without a generation guard, a slow autosave started *before*
      // a restore could resolve *after* it and silently revert both the visible content and
      // which version the next autosave coalesces into.
      let resolveStalePatch!: (value: unknown) => void;
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(jsonResponse(baseItem))
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveStalePatch = resolve;
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ ...baseItem, description: "Third edit" }));

      render(<NoteEditor itemId="item-1" />);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      fireEvent.change(screen.getByLabelText("Body"), { target: { value: "First edit" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500); // first autosave now in flight, unresolved
      });

      fireEvent.click(screen.getByRole("button", { name: "History" }));
      fireEvent.click(screen.getByRole("button", { name: "Simulate restore" }));
      expect(screen.getByDisplayValue("# Restored content")).toBeInTheDocument();

      // The stale first PATCH resolves now, reporting the pre-restore content and a different
      // versionId — this must not override the restore.
      await act(async () => {
        resolveStalePatch(
          jsonResponse({ ...baseItem, description: "First edit", versionId: "stale-version" }),
        );
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByDisplayValue("# Restored content")).toBeInTheDocument();

      // The next autosave must coalesce into the restore's version, not the stale one.
      fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Third edit" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(fetch).toHaveBeenLastCalledWith(
        "/api/items/item-1",
        expect.objectContaining({
          body: JSON.stringify({
            title: "Trip planning",
            description: "Third edit",
            openVersionId: "restored-version",
          }),
        }),
      );
    });
  });

  describe("checklist toggle from the rendered view", () => {
    it("clicking a checkbox in view mode immediately PATCHes the toggled content, without entering edit mode", async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          jsonResponse({ ...baseItem, description: "- [ ] Book flights\n- [ ] Pack bag" }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            ...baseItem,
            description: "- [x] Book flights\n- [ ] Pack bag",
            versionId: "v1",
          }),
        );

      render(<NoteEditor itemId="item-1" />);
      await flush();

      fireEvent.click(screen.getAllByRole("checkbox")[0]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(fetch).toHaveBeenCalledWith(
        "/api/items/item-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            title: "Trip planning",
            // toggleTaskAtIndex re-serializes via remark-stringify, which always ends output
            // with a trailing newline.
            description: "- [x] Book flights\n- [ ] Pack bag\n",
            openVersionId: null,
          }),
        }),
      );
      // Still in view mode — no Edit click was ever needed.
      expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    });

    it("updates the view optimistically before the PATCH resolves", async () => {
      let resolvePatch!: (value: unknown) => void;
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(jsonResponse({ ...baseItem, description: "- [ ] Task" }))
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolvePatch = resolve;
          }),
        );

      render(<NoteEditor itemId="item-1" />);
      await flush();

      fireEvent.click(screen.getByRole("checkbox"));
      expect(screen.getByRole("checkbox")).toBeChecked();

      await act(async () => {
        resolvePatch(jsonResponse({ ...baseItem, description: "- [x] Task", versionId: "v1" }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole("checkbox")).toBeChecked();
    });

    it("reverts the checkbox and shows an inline error when the toggle PATCH fails", async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(jsonResponse({ ...baseItem, description: "- [ ] Task" }))
        .mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, false));

      render(<NoteEditor itemId="item-1" />);
      await flush();

      fireEvent.click(screen.getByRole("checkbox"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByRole("checkbox")).not.toBeChecked();
      expect(screen.getByRole("alert")).toHaveTextContent(/went wrong/i);
    });

    it("the toggle reuses the currently-open version, coalescing exactly like autosave", async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(jsonResponse({ ...baseItem, description: "- [ ] Task" }))
        .mockResolvedValueOnce(
          jsonResponse({
            ...baseItem,
            description: "- [ ] Task edited",
            versionId: "existing-version",
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            ...baseItem,
            description: "- [x] Task edited",
            versionId: "existing-version",
          }),
        );

      render(<NoteEditor itemId="item-1" />);
      await flush();

      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      fireEvent.change(screen.getByLabelText("Body"), { target: { value: "- [ ] Task edited" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      fireEvent.click(screen.getByRole("button", { name: /^done$/i }));

      fireEvent.click(screen.getByRole("checkbox"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(fetch).toHaveBeenLastCalledWith(
        "/api/items/item-1",
        expect.objectContaining({
          body: JSON.stringify({
            title: "Trip planning",
            description: "- [x] Task edited\n",
            openVersionId: "existing-version",
          }),
        }),
      );
    });
  });
});
