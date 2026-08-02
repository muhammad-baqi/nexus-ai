"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NoteBody } from "@/components/notes/note-body";
import { NoteRichTextEditor } from "@/components/notes/note-rich-text-editor";
import { NoteVersionHistory } from "@/components/notes/note-version-history";
import { type AutosaveStatus, useNoteAutosave } from "@/components/notes/use-note-autosave";
import { DEFAULT_NOTE_TITLE } from "@/lib/validation/items";

type EditSurface = "markdown" | "richtext";

const STATUS_LABEL: Record<AutosaveStatus, string> = {
  saving: "Saving…",
  saved: "Saved",
  retrying: "Not saved — retrying…",
  error: "Not saved",
};

type Item = {
  id: string;
  title: string;
  description: string | null;
  updated_at: string;
};

type Props = {
  itemId: string;
};

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export function NoteEditor({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editSurface, setEditSurface] = useState<EditSurface>("markdown");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  // The note_versions row the *next* autosave should coalesce into — null means "open a new
  // boundary instead" (a fresh Edit session, or the previous write's version-bookkeeping
  // failed and there's nothing safe to coalesce into). Deliberately an explicit id round-tripped
  // through each PATCH response rather than re-derived server-side from "whichever row is
  // newest" — self-review found that inferring "latest" could silently coalesce into, and
  // corrupt, an unrelated older version whenever a boundary-opening write's insert had failed.
  const openVersionIdRef = useRef<string | null>(null);
  // Bumped whenever a restore happens, so a stale autosave response that was already in flight
  // *before* the restore can't clobber the now-current state when it resolves afterward (the
  // PATCH itself still completes normally server-side — this only guards this component's own
  // local state from regressing).
  const saveGenerationRef = useRef(0);

  const { status, retryNow, resetBaseline } = useNoteAutosave(
    { title, body },
    !!item && title.trim().length > 0,
    async (draft) => {
      const generation = saveGenerationRef.current;
      const response = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.body,
          openVersionId: openVersionIdRef.current,
        }),
      });

      if (!response.ok) {
        console.error(
          "[NoteEditor] autosave failed:",
          response.status,
          await parseErrorMessage(response, "unknown error"),
        );
        throw new Error("autosave failed");
      }

      const updated: Item & { versionId: string | null } = await response.json();
      if (saveGenerationRef.current !== generation) {
        // A restore landed while this request was in flight — it already reflects newer state
        // than this (now-stale) response does; don't let it overwrite that.
        return;
      }
      setItem(updated);
      openVersionIdRef.current = updated.versionId;
    },
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/items/${itemId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: Item) => {
        if (cancelled) return;
        setItem(data);
        setTitle(data.title);
        setBody(data.description ?? "");
        resetBaseline({ title: data.title, body: data.description ?? "" });
        // A just-created note (still the server-assigned default title, no body yet) has
        // nothing to show in view mode — open straight into editing instead of forcing an
        // extra "Edit" click before the user can type anything (CLAUDE.md: save in <10s).
        const isFreshlyCreated = data.title === DEFAULT_NOTE_TITLE && !data.description?.trim();
        setMode(isFreshlyCreated ? "edit" : "view");
      })
      .catch(() => {
        if (!cancelled) setLoadError("This note couldn't be loaded — it may have been removed.");
      });
    return () => {
      cancelled = true;
    };
    // resetBaseline is stable (useCallback with an empty dep array in useNoteAutosave) —
    // omitted to keep this effect scoped to itemId, matching its cleanup semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  function startEditing() {
    // title/body already hold the live draft (autosaved or mid-retry) — resetting them from
    // `item` here would silently discard an unsaved edit if a save is stuck retrying.
    setEditSurface("markdown");
    openVersionIdRef.current = null;
    setMode("edit");
  }

  function finishEditing() {
    setMode("view");
  }

  function handleRestored(content: string, versionId: string | null) {
    saveGenerationRef.current += 1;
    setBody(content);
    setItem((prev) => (prev ? { ...prev, description: content } : prev));
    openVersionIdRef.current = versionId;
    // The restore endpoint already persisted this — resetBaseline stops the autosave hook from
    // treating it as a new unsaved edit and firing a redundant PATCH for content that's already
    // saved server-side.
    resetBaseline({ title, body: content });
  }

  if (loadError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {loadError}
      </p>
    );
  }

  if (!item) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  // Rendered in both view and edit mode — Notes.md requires a *persistent* "not saved"
  // indicator, so leaving edit mode (Done) can't make a still-retrying/failed save vanish from
  // view. Only shown once there's something to say (a fresh "saved" note stays quiet).
  const statusIndicator = status !== "saved" && (
    <div className="flex items-center gap-2">
      <p className="text-muted-foreground text-sm" role="status" aria-live="polite">
        {STATUS_LABEL[status]}
      </p>
      {status === "error" && (
        <Button type="button" variant="outline" size="sm" onClick={retryNow}>
          Retry now
        </Button>
      )}
    </div>
  );

  if (mode === "edit") {
    const titleError = !title.trim() ? "Title is required" : undefined;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-title">Title</Label>
          <Input
            id="note-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!titleError}
          />
          {titleError && (
            <p className="text-destructive text-sm" role="alert">
              {titleError}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="note-body">Body</Label>
            <div className="flex items-center gap-1" role="group" aria-label="Editing surface">
              <Button
                type="button"
                variant={editSurface === "markdown" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={editSurface === "markdown"}
                onClick={() => setEditSurface("markdown")}
              >
                Markdown
              </Button>
              <Button
                type="button"
                variant={editSurface === "richtext" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={editSurface === "richtext"}
                onClick={() => setEditSurface("richtext")}
              >
                Rich text
              </Button>
            </div>
          </div>
          {editSurface === "markdown" ? (
            <Textarea
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
            />
          ) : (
            <NoteRichTextEditor content={body} onChange={setBody} />
          )}
        </div>
        {statusIndicator}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={finishEditing} disabled={!!titleError}>
            Done
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            History
          </Button>
        </div>
        {historyOpen && <NoteVersionHistory itemId={itemId} onRestored={handleRestored} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            History
          </Button>
        </div>
      </div>
      {statusIndicator}
      {historyOpen && <NoteVersionHistory itemId={itemId} onRestored={handleRestored} />}
      <NoteBody content={item.description ?? ""} />
    </div>
  );
}
