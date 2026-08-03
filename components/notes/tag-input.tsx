"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ItemTag = { id: string; name: string };

type Props = {
  itemId: string;
  tags: ItemTag[];
  onTagsChange: (tags: ItemTag[]) => void;
};

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export function TagInput({ itemId, tags, onTagsChange }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isAdding, setIsAdding] = useState(false);

  // Not optimistic on add (unlike remove below): the attached tag's real id comes from the
  // server (get-or-create may reuse an existing tag), and removal needs that real id — a
  // placeholder-then-replace approach would just add complexity for a fast, low-latency request.
  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;

    setError(undefined);
    setIsAdding(true);
    const response = await fetch(`/api/items/${itemId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setIsAdding(false);

    if (!response.ok) {
      setError(await parseErrorMessage(response, "Something went wrong adding that tag."));
      return;
    }

    // The attach itself always succeeded here — `tags` is only `null` when the server's
    // post-attach re-read failed, in which case `tag` (the one just attached) is merged into
    // the current list locally instead of trusting a misleadingly empty list.
    const body: { tag: ItemTag; tags: ItemTag[] | null } = await response.json();
    onTagsChange(body.tags ?? [...tags, body.tag]);
    setDraft("");
  }

  async function handleRemove(tag: ItemTag) {
    setError(undefined);
    const previous = tags;
    onTagsChange(tags.filter((t) => t.id !== tag.id));

    const response = await fetch(`/api/items/${itemId}/tags/${tag.id}`, { method: "DELETE" });

    if (!response.ok) {
      onTagsChange(previous);
      setError(await parseErrorMessage(response, "Something went wrong removing that tag."));
      return;
    }

    // The detach itself always succeeded here — `tags` is only `null` when the server's
    // post-detach re-read failed. The optimistic removal above is already correct in that case;
    // only sync to the server's list when it actually confirmed one.
    const body: { tags: ItemTag[] | null } = await response.json();
    if (body.tags !== null) onTagsChange(body.tags);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            {tag.name}
            <button
              type="button"
              aria-label={`Remove tag ${tag.name}`}
              onClick={() => handleRemove(tag)}
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </span>
        ))}
        <form onSubmit={handleAdd} className="flex items-center gap-1">
          <Input
            aria-label="Add tag"
            placeholder="Add tag…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 w-28"
            disabled={isAdding}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={isAdding || !draft.trim()}
          >
            Add
          </Button>
        </form>
      </div>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
