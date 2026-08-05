"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  collectionId: string;
};

type CreateResponse = { duplicate: true; existingItemId: string } | { id: string };

// Mirrors CollectionDetailView's existing "New Note" POST pattern (components/collections/
// collection-detail-view.tsx) — a collapsed button that expands into an inline form, same shape
// as CreateCollectionForm. The one extra step is the non-blocking duplicate prompt
// (Website_Bookmarks.md's Duplicate Detection section): a 200 response with `duplicate: true`
// isn't an error, it's a choice for the user — view the existing bookmark, or save anyway.
export function SaveBookmarkForm({ collectionId }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateItemId, setDuplicateItemId] = useState<string | undefined>();

  function reset() {
    setUrl("");
    setFieldError(undefined);
    setDuplicateItemId(undefined);
  }

  async function save(confirmDuplicate: boolean) {
    setFieldError(undefined);
    setIsSubmitting(true);

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "website", collection_id: collectionId, url, confirmDuplicate }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setFieldError(body?.error?.message ?? "Something went wrong saving this bookmark.");
      return;
    }

    const body: CreateResponse = await response.json();

    if ("duplicate" in body) {
      setDuplicateItemId(body.existingItemId);
      return;
    }

    reset();
    setIsOpen(false);
    router.push(`/items/${body.id}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      setFieldError("Enter a URL");
      return;
    }
    await save(false);
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
        Save Bookmark
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bookmarkUrl">URL</Label>
        <Input
          id="bookmarkUrl"
          type="url"
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={!!fieldError}
        />
      </div>

      {fieldError && (
        <p className="text-destructive text-sm" role="alert">
          {fieldError}
        </p>
      )}

      {duplicateItemId && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
          <p>You already saved this — view existing bookmark?</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/items/${duplicateItemId}`)}
            >
              View existing
            </Button>
            <Button type="button" size="sm" onClick={() => save(true)} disabled={isSubmitting}>
              Save anyway
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset();
            setIsOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
