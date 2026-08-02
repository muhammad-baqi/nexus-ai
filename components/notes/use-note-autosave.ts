import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "saved" | "saving" | "retrying" | "error";

export type NoteDraft = {
  title: string;
  body: string;
};

const DEBOUNCE_MS = 1500;
const RETRY_DELAYS_MS = [2000, 5000, 10000];

function sameDraft(a: NoteDraft, b: NoteDraft) {
  return a.title === b.title && a.body === b.body;
}

export function useNoteAutosave(
  draft: NoteDraft,
  enabled: boolean,
  save: (draft: NoteDraft) => Promise<void>,
) {
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const lastSavedRef = useRef<NoteDraft>(draft);
  const draftRef = useRef<NoteDraft>(draft);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryIndexRef = useRef(0);
  // Indirection so attemptSave can schedule a retry of itself without a same-callback
  // self-reference (which the render/ref lint rules — and JS hoisting — both reject); the ref
  // is kept in sync via the effect below, never mutated during render.
  const attemptSaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    draftRef.current = draft;
    saveRef.current = save;
    enabledRef.current = enabled;
  });

  const attemptSave = useCallback(() => {
    // Snapshot the draft actually being sent — by the time the request resolves,
    // draftRef.current may already point at a *newer* edit (the user kept typing, or
    // itemId changed). Stamping lastSavedRef with the live ref instead of this snapshot
    // would make that newer edit look already-saved and it would never autosave.
    const sent = draftRef.current;
    setStatus("saving");
    saveRef.current(sent).then(
      () => {
        lastSavedRef.current = sent;
        retryIndexRef.current = 0;
        setStatus("saved");
      },
      () => {
        if (retryIndexRef.current < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[retryIndexRef.current];
          retryIndexRef.current += 1;
          setStatus("retrying");
          timerRef.current = setTimeout(() => attemptSaveRef.current(), delay);
        } else {
          setStatus("error");
        }
      },
    );
  }, []);

  useEffect(() => {
    attemptSaveRef.current = attemptSave;
  }, [attemptSave]);

  useEffect(() => {
    if (!enabled || sameDraft(draft, lastSavedRef.current)) {
      return;
    }
    clearTimeout(timerRef.current);
    retryIndexRef.current = 0;
    timerRef.current = setTimeout(() => attemptSaveRef.current(), DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
    // draft.title/draft.body (not the `draft` object reference) are the real dependencies —
    // NoteEditor passes a fresh `{title, body}` literal every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.title, draft.body, enabled]);

  const retryNow = useCallback(() => {
    if (!enabledRef.current) {
      return;
    }
    clearTimeout(timerRef.current);
    retryIndexRef.current = 0;
    attemptSaveRef.current();
  }, []);

  const resetBaseline = useCallback((next: NoteDraft) => {
    clearTimeout(timerRef.current);
    retryIndexRef.current = 0;
    lastSavedRef.current = next;
    setStatus("saved");
  }, []);

  return { status, retryNow, resetBaseline };
}
