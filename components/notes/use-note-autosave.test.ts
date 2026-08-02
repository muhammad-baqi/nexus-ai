import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNoteAutosave, type NoteDraft } from "./use-note-autosave";

function setup(
  initialDraft: NoteDraft,
  save: (draft: NoteDraft) => Promise<void>,
  enabled = true,
) {
  return renderHook(
    ({ draft, enabled }: { draft: NoteDraft; enabled: boolean }) =>
      useNoteAutosave(draft, enabled, save),
    { initialProps: { draft: initialDraft, enabled } },
  );
}

describe("useNoteAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save immediately on a change — waits out the debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "hello" }, enabled: true });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("collapses rapid successive changes within the debounce window into a single save call", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "h" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    rerender({ draft: { title: "A", body: "he" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    rerender({ draft: { title: "A", body: "hel" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "A", body: "hel" });
  });

  it("status goes saving -> saved on a successful save", async () => {
    let resolveSave!: () => void;
    const save = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { result, rerender } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "x" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.status).toBe("saving");

    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("saved");
  });

  it("never schedules a save while enabled is false, even when the draft changes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = setup({ title: "", body: "" }, save, false);

    rerender({ draft: { title: "", body: "typed" }, enabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("resetBaseline marks the draft as already-saved, so an unchanged draft never triggers a save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup({ title: "", body: "" }, save);

    act(() => {
      result.current.resetBaseline({ title: "Loaded", body: "content" });
    });
    rerender({ draft: { title: "Loaded", body: "content" }, enabled: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("a failed save schedules an automatic retry with backoff; status is retrying meanwhile", async () => {
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const { result, rerender } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "x" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("retrying");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("retrying");
  });

  it("becomes error after exhausting all configured retries, and stops auto-retrying", async () => {
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const { result, rerender } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "x" }, enabled: true });
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

    expect(save).toHaveBeenCalledTimes(4);
    expect(result.current.status).toBe("error");

    // No further automatic retries.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(save).toHaveBeenCalledTimes(4);
  });

  it("retryNow() re-attempts immediately from error; success returns status to saved", async () => {
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const { result, rerender } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "x" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(result.current.status).toBe("error");
    expect(save).toHaveBeenCalledTimes(4);

    save.mockResolvedValueOnce(undefined);
    await act(async () => {
      result.current.retryNow();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(5);
    expect(result.current.status).toBe("saved");
  });

  it("a new edit while a retry is pending cancels it and reschedules a fresh debounce for the latest draft", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("e1")).mockResolvedValue(undefined);
    const { result, rerender } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "x" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // initial attempt fails; retry scheduled +2000ms
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("retrying");

    // Edits again before the pending retry fires — this must cancel it, not race it.
    rerender({ draft: { title: "A", body: "xy" }, enabled: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499); // just before the fresh debounce (+1500ms from the edit)
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      // Past both the fresh debounce and where the cancelled retry would have fired.
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ title: "A", body: "xy" });
    expect(result.current.status).toBe("saved");
  });

  it("a newer edit arriving while an older save is still in flight is not silently marked already-saved", async () => {
    // Regression case for the self-review-caught race: stamping lastSavedRef with the *live*
    // ref instead of the draft actually sent would make a newer edit look already-saved once
    // an older in-flight request resolves, and it would never autosave.
    let resolveFirstSave!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { result, rerender } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "first" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // first save call in flight, unresolved
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saving");

    // A newer edit arrives while the first save is still pending.
    rerender({ draft: { title: "A", body: "second" }, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // its own debounce fires while the first is still in flight
    });

    // Now let the first (stale) save resolve.
    await act(async () => {
      resolveFirstSave();
      await Promise.resolve();
    });

    // The newer draft must still get its own save — not be treated as already-saved just
    // because an older in-flight request for a different draft resolved.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledWith({ title: "A", body: "second" });
  });

  it("clears pending timers on unmount", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = setup({ title: "A", body: "" }, save);

    rerender({ draft: { title: "A", body: "x" }, enabled: true });
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(save).not.toHaveBeenCalled();
  });
});
