"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoveItemControl } from "@/components/notes/move-item-control";
import { NoteBody } from "@/components/notes/note-body";
import { NoteRichTextEditor } from "@/components/notes/note-rich-text-editor";
import { NoteVersionHistory } from "@/components/notes/note-version-history";
import { TagInput, type ItemTag } from "@/components/notes/tag-input";
import { type AutosaveStatus, useNoteAutosave } from "@/components/notes/use-note-autosave";
import { toggleTaskAtIndex } from "@/lib/notes/toggle-task";
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
  is_favorite: boolean;
  is_archived: boolean;
  collection_id: string;
  tags: ItemTag[];
};

// What GET/PATCH /api/items/:id actually send: `tags` is `null` specifically when the server's
// tags read failed (not when the item genuinely has none), so it can't just be typed as ItemTag[].
type ServerItem = Omit<Item, "tags"> & { tags: ItemTag[] | null };

type Props = {
  itemId: string;
};

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

// Falls back to the previous local tags (or [] with no previous item, i.e. the initial load)
// whenever the server reports `tags: null` — a failed post-mutation tags read shouldn't wipe a
// list the user can already see (self-review-caught gap).
function mergeServerItem(prev: Item | null, updated: ServerItem): Item {
  return { ...updated, tags: updated.tags ?? prev?.tags ?? [] };
}

export function NoteEditor({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editSurface, setEditSurface] = useState<EditSurface>("markdown");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | undefined>();

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

      const updated: ServerItem & { versionId: string | null } = await response.json();
      if (saveGenerationRef.current !== generation) {
        // A restore landed while this request was in flight — it already reflects newer state
        // than this (now-stale) response does; don't let it overwrite that.
        return;
      }
      setItem((prev) => mergeServerItem(prev, updated));
      openVersionIdRef.current = updated.versionId;
    },
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/items/${itemId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: ServerItem) => {
        if (cancelled) return;
        setItem(mergeServerItem(null, data));
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
    setToggleError(undefined);
    setMode("edit");
  }

  function finishEditing() {
    setToggleError(undefined);
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

  // Toggling a checklist item from the rendered view (not edit mode) autosaves immediately —
  // Notes.md's Checklists section. Bypasses useNoteAutosave's debounce (that's for the
  // continuous typing stream in edit mode) in favor of a direct, immediate, optimistic PATCH,
  // since this is a single discrete action — but still reuses the hook's baseline/status
  // machinery via resetBaseline, so the two paths can't race each other (see below).
  async function handleToggleTask(index: number) {
    if (!item) return;
    // Based on `body`, not `item.description`: `item` only reflects the last *successful*
    // save, which can lag behind `body` (e.g. Done was clicked before the 1500ms autosave
    // debounce fired). Toggling against the stale value — and, worse, overwriting `body` with
    // a version that doesn't include the not-yet-saved edit — would silently drop that edit
    // (self-review-caught bug). `body` is always the true current content.
    const previousBody = body;
    const nextContent = toggleTaskAtIndex(previousBody, index);
    if (nextContent === null) return;

    setToggleError(undefined);
    setBody(nextContent);
    setItem((prev) => (prev ? { ...prev, description: nextContent } : prev));
    // Tells the autosave hook this is already the saved baseline *before* this function's own
    // PATCH resolves — otherwise the hook's own debounce is still armed by the setBody above and
    // could independently fire a redundant, racing PATCH for the same change if this request is
    // slow (self-review-caught gap in an earlier version of this fix).
    resetBaseline({ title, body: nextContent });

    const generation = ++saveGenerationRef.current;
    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: nextContent,
        openVersionId: openVersionIdRef.current,
      }),
    });

    if (!response.ok) {
      console.error(
        "[NoteEditor] checklist toggle failed:",
        response.status,
        await parseErrorMessage(response, "unknown error"),
      );
      if (saveGenerationRef.current === generation) {
        setBody(previousBody);
        setItem((prev) => (prev ? { ...prev, description: previousBody } : prev));
        resetBaseline({ title, body: previousBody });
        setToggleError("Something went wrong saving that — try again.");
      }
      return;
    }

    const updated: ServerItem & { versionId: string | null } = await response.json();
    if (saveGenerationRef.current !== generation) {
      // Something newer (another toggle, a restore) has already landed — don't overwrite it.
      return;
    }
    setItem((prev) => mergeServerItem(prev, updated));
    setBody(updated.description ?? "");
    openVersionIdRef.current = updated.versionId;
    resetBaseline({ title, body: updated.description ?? "" });
  }

  // Favorite/archive are simple column toggles — unlike the checklist toggle above, they never
  // touch description/note_versions, so no openVersionIdRef bookkeeping is needed here.
  async function toggleFavorite() {
    if (!item) return;
    setToggleError(undefined);
    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: !item.is_favorite }),
    });
    if (!response.ok) {
      setToggleError(await parseErrorMessage(response, "Something went wrong."));
      return;
    }
    const updated: ServerItem & { versionId: string | null } = await response.json();
    setItem((prev) => mergeServerItem(prev, updated));
  }

  async function toggleArchived() {
    if (!item) return;
    setToggleError(undefined);
    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: !item.is_archived }),
    });
    if (!response.ok) {
      setToggleError(await parseErrorMessage(response, "Something went wrong."));
      return;
    }
    const updated: ServerItem & { versionId: string | null } = await response.json();
    setItem((prev) => mergeServerItem(prev, updated));
  }

  function handleTagsChange(tags: ItemTag[]) {
    setItem((prev) => (prev ? { ...prev, tags } : prev));
  }

  function handleMoved(newCollectionId: string) {
    setItem((prev) => (prev ? { ...prev, collection_id: newCollectionId } : prev));
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
        <TagInput itemId={itemId} tags={item.tags} onTagsChange={handleTagsChange} />
        <MoveItemControl
          itemId={itemId}
          currentCollectionId={item.collection_id}
          onMoved={handleMoved}
        />
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
        {toggleError && (
          <p className="text-destructive text-sm" role="alert">
            {toggleError}
          </p>
        )}
        {statusIndicator}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={finishEditing} disabled={!!titleError}>
            Done
          </Button>
          <Button type="button" variant="outline" onClick={toggleFavorite}>
            {item.is_favorite ? "Unfavorite" : "Favorite"}
          </Button>
          <Button type="button" variant="outline" onClick={toggleArchived}>
            {item.is_archived ? "Unarchive" : "Archive"}
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
        <h1 className="text-2xl font-semibold">
          {item.is_favorite && <span aria-label="Favorited">★ </span>}
          {item.title}
          {item.is_archived && (
            <span className="text-muted-foreground ml-2 text-sm font-normal">(Archived)</span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            Edit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggleFavorite}>
            {item.is_favorite ? "Unfavorite" : "Favorite"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggleArchived}>
            {item.is_archived ? "Unarchive" : "Archive"}
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
      <TagInput itemId={itemId} tags={item.tags} onTagsChange={handleTagsChange} />
      <MoveItemControl
        itemId={itemId}
        currentCollectionId={item.collection_id}
        onMoved={handleMoved}
      />
      {statusIndicator}
      {toggleError && (
        <p className="text-destructive text-sm" role="alert">
          {toggleError}
        </p>
      )}
      {historyOpen && <NoteVersionHistory itemId={itemId} onRestored={handleRestored} />}
      {/* body, not item.description: item only reflects the last successful save, which can
          lag behind body for a moment (e.g. Done clicked before the autosave debounce fired) —
          rendering item here would show stale content the user didn't just type. */}
      <NoteBody content={body} onToggleTask={handleToggleTask} />
    </div>
  );
}
