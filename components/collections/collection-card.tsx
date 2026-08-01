"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import {
  COLLECTION_COLORS,
  COLLECTION_ICONS,
  type UpdateCollectionInput,
} from "@/lib/validation/collections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Collection = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_favorite: boolean;
  is_archived: boolean;
  updated_at: string;
};

type Stats = { total: number; by_type: Record<string, number>; last_updated: string | null };

type Props = {
  collection: Collection;
  onChanged: () => void;
};

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export function CollectionCard({ collection, onChanged }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const [color, setColor] = useState(collection.color);
  const [icon, setIcon] = useState(collection.icon);
  const [editError, setEditError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/collections/${collection.id}/stats`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("stats fetch failed"))))
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        // Stats are a nice-to-have for the summary line, but the delete confirmation's item
        // count must never silently default to 0 on a failed fetch — that would understate what
        // Trash is about to affect (docs/01_MVP/Collections.md's confirmation requirement).
        if (!cancelled) setStatsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [collection.id]);

  async function patch(body: UpdateCollectionInput) {
    const response = await fetch(`/api/collections/${collection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response;
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setEditError(undefined);

    const response = await patch({
      name: name.trim(),
      description: description.trim() || null,
      color: color as (typeof COLLECTION_COLORS)[number],
      icon: icon as (typeof COLLECTION_ICONS)[number],
    });

    setIsSaving(false);

    if (!response.ok) {
      setEditError(await parseErrorMessage(response, "Something went wrong saving changes."));
      return;
    }

    setIsEditing(false);
    onChanged();
  }

  async function toggleFavorite() {
    setActionError(undefined);
    const response = await patch({ is_favorite: !collection.is_favorite });
    if (!response.ok) {
      setActionError(await parseErrorMessage(response, "Something went wrong."));
      return;
    }
    onChanged();
  }

  async function toggleArchived() {
    setActionError(undefined);
    const response = await patch({ is_archived: !collection.is_archived });
    if (!response.ok) {
      setActionError(await parseErrorMessage(response, "Something went wrong."));
      return;
    }
    onChanged();
  }

  async function handleDelete() {
    setActionError(undefined);
    const response = await fetch(`/api/collections/${collection.id}`, { method: "DELETE" });
    if (!response.ok) {
      setActionError(await parseErrorMessage(response, "Something went wrong deleting this collection."));
      return;
    }
    onChanged();
  }

  if (isEditing) {
    return (
      <form
        onSubmit={handleEditSubmit}
        className="flex flex-col gap-2 rounded-lg border border-border p-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${collection.id}`}>Name</Label>
          <Input
            id={`name-${collection.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!editError}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`description-${collection.id}`}>Description</Label>
          <Input
            id={`description-${collection.id}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`color-${collection.id}`}>Color</Label>
            <select
              id={`color-${collection.id}`}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              {COLLECTION_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`icon-${collection.id}`}>Icon</Label>
            <select
              id={`icon-${collection.id}`}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              {COLLECTION_ICONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        </div>
        {editError && (
          <p className="text-destructive text-sm" role="alert">
            {editError}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {collection.is_favorite && <span aria-label="Favorited">★ </span>}
            <Link href={`/collections/${collection.id}`} className="hover:underline">
              {collection.name}
            </Link>
          </h3>
          {collection.description && (
            <p className="text-muted-foreground text-sm">{collection.description}</p>
          )}
          <p className="text-muted-foreground text-xs">
            {stats
              ? `${stats.total} item${stats.total === 1 ? "" : "s"}${
                  stats.last_updated
                    ? ` · updated ${new Date(stats.last_updated).toLocaleDateString()}`
                    : ""
                }`
              : "…"}
          </p>
        </div>
      </div>

      {actionError && (
        <p className="text-destructive text-sm" role="alert">
          {actionError}
        </p>
      )}

      {isConfirmingDelete ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <p className="text-sm">
            {stats
              ? `This will move ${stats.total} item${stats.total === 1 ? "" : "s"} to Trash along with "${collection.name}". This can be undone by restoring it from Trash.`
              : statsFailed
                ? `We couldn't confirm how many items would be affected. "${collection.name}" (and any items in it) will still move to Trash, and can be restored.`
                : `Checking how many items are in "${collection.name}"...`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Move to Trash
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsConfirmingDelete(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggleFavorite}>
            {collection.is_favorite ? "Unfavorite" : "Favorite"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggleArchived}>
            {collection.is_archived ? "Unarchive" : "Archive"}
          </Button>
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
  );
}
