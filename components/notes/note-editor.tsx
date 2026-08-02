"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NoteBody } from "@/components/notes/note-body";
import { NoteRichTextEditor } from "@/components/notes/note-rich-text-editor";
import { DEFAULT_NOTE_TITLE } from "@/lib/validation/items";

type EditSurface = "markdown" | "richtext";

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
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/items/${itemId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: Item) => {
        if (cancelled) return;
        setItem(data);
        setTitle(data.title);
        setBody(data.description ?? "");
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
  }, [itemId]);

  function startEditing() {
    if (!item) return;
    setTitle(item.title);
    setBody(item.description ?? "");
    setTitleError(undefined);
    setSaveError(undefined);
    setEditSurface("markdown");
    setMode("edit");
  }

  function cancelEditing() {
    setTitleError(undefined);
    setSaveError(undefined);
    setMode("view");
  }

  async function handleSave() {
    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }
    setTitleError(undefined);
    setSaveError(undefined);
    setIsSaving(true);

    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: body }),
    });

    setIsSaving(false);

    if (!response.ok) {
      setSaveError(await parseErrorMessage(response, "Something went wrong saving this note."));
      return;
    }

    const updated: Item = await response.json();
    setItem(updated);
    setMode("view");
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

  if (mode === "edit") {
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
        {saveError && (
          <p className="text-destructive text-sm" role="alert">
            {saveError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={cancelEditing} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <Button type="button" variant="outline" size="sm" onClick={startEditing}>
          Edit
        </Button>
      </div>
      <NoteBody content={item.description ?? ""} />
    </div>
  );
}
