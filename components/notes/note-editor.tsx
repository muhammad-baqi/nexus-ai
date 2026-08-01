"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | undefined>();
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/items/${itemId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: Item) => {
        if (cancelled) return;
        setItem(data);
        setTitle(data.title);
        setBody(data.description ?? "");
      })
      .catch(() => {
        if (!cancelled) setLoadError("This note couldn't be loaded — it may have been removed.");
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  async function handleSave() {
    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }
    setTitleError(undefined);
    setSaveError(undefined);
    setStatus("saving");

    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: body }),
    });

    if (!response.ok) {
      setStatus("idle");
      setSaveError(await parseErrorMessage(response, "Something went wrong saving this note."));
      return;
    }

    const updated: Item = await response.json();
    setItem(updated);
    setStatus("saved");
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-title">Title</Label>
        <Input
          id="note-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setStatus("idle");
          }}
          aria-invalid={!!titleError}
        />
        {titleError && (
          <p className="text-destructive text-sm" role="alert">
            {titleError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-body">Body</Label>
        <Textarea
          id="note-body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setStatus("idle");
          }}
          rows={16}
        />
      </div>
      {saveError && (
        <p className="text-destructive text-sm" role="alert">
          {saveError}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={status === "saving"}>
          {status === "saving" ? "Saving..." : "Save"}
        </Button>
        {status === "saved" && <span className="text-muted-foreground text-sm">Saved</span>}
      </div>
    </div>
  );
}
