"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tag = { id: string; name: string };
type Status = "loading" | "loaded" | "error";

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

type TagRowProps = {
  tag: Tag;
  otherTags: Tag[];
  onChanged: () => void;
};

function TagRow({ tag, otherTags, onChanged }: TagRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [editError, setEditError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [actionError, setActionError] = useState<string | undefined>();

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setEditError(undefined);

    const response = await fetch(`/api/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    setIsSaving(false);

    if (!response.ok) {
      setEditError(await parseErrorMessage(response, "Something went wrong renaming this tag."));
      return;
    }

    setIsEditing(false);
    onChanged();
  }

  async function handleDelete() {
    setActionError(undefined);
    const response = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (!response.ok) {
      setActionError(await parseErrorMessage(response, "Something went wrong deleting this tag."));
      return;
    }
    onChanged();
  }

  async function handleMerge() {
    if (!mergeTarget) return;
    setActionError(undefined);
    const response = await fetch("/api/tags/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_tag_id: tag.id, target_tag_id: mergeTarget }),
    });
    if (!response.ok) {
      setActionError(await parseErrorMessage(response, "Something went wrong merging this tag."));
      return;
    }
    onChanged();
  }

  if (isEditing) {
    return (
      <form
        onSubmit={handleRename}
        className="flex flex-col gap-2 rounded-lg border border-border p-3"
      >
        <div className="flex items-center gap-2">
          <Input
            aria-label="Tag name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!editError}
          />
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </div>
        {editError && (
          <p className="text-destructive text-sm" role="alert">
            {editError}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{tag.name}</span>
        {!isConfirmingDelete && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Rename
            </Button>
            {otherTags.length > 0 && (
              <>
                <select
                  aria-label={`Merge ${tag.name} into`}
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">Merge into…</option>
                  {otherTags.map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMerge}
                  disabled={!mergeTarget}
                >
                  Merge
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setIsConfirmingDelete(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      {actionError && (
        <p className="text-destructive text-sm" role="alert">
          {actionError}
        </p>
      )}
      {isConfirmingDelete && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <p className="text-sm">
            Remove &quot;{tag.name}&quot;? It will be detached from every item that has it — the
            items themselves aren&apos;t affected.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
              Delete tag
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmingDelete(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TagManagementView() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    const response = await fetch("/api/tags");
    if (!response.ok) {
      setStatus("error");
      return;
    }
    const body = await response.json();
    setTags(body.tags);
    setStatus("loaded");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Tags</h1>

      {status === "loading" && <p className="text-muted-foreground text-sm">Loading...</p>}
      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong loading your tags.{" "}
          <button type="button" className="underline" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {status === "loaded" && tags.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No tags yet — tag a note from its editor to create one.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {tags.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            otherTags={tags.filter((t) => t.id !== tag.id)}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  );
}
