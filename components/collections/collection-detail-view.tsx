"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SaveBookmarkForm } from "@/components/bookmarks/save-bookmark-form";
import { UploadFileForm } from "@/components/files/upload-file-form";

type Collection = {
  id: string;
  name: string;
  description: string | null;
};

type ItemType = "note" | "website" | "pdf" | "image" | "file" | "code_snippet";

type Item = {
  id: string;
  type: ItemType;
  title: string;
  updated_at: string;
  is_favorite: boolean;
  is_archived: boolean;
};

// A plain text/emoji marker rather than an icon-font dependency — keeps this list lightweight;
// each type also gets a text label via aria-label since emoji alone isn't reliably announced.
const TYPE_MARKERS: Record<ItemType, { icon: string; label: string }> = {
  note: { icon: "📝", label: "Note" },
  website: { icon: "🔗", label: "Bookmark" },
  pdf: { icon: "📄", label: "PDF" },
  image: { icon: "🖼️", label: "Image" },
  file: { icon: "📎", label: "File" },
  code_snippet: { icon: "💻", label: "Code snippet" },
};

type Status = "loading" | "loaded" | "error";

type Props = {
  collectionId: string;
};

export function CollectionDetailView({ collectionId }: Props) {
  const router = useRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [createError, setCreateError] = useState<string | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  // Archived items are hidden from this default view (Knowledge_Items.md: archiving "removes
  // an item from default Collection views") but stay reachable here via this toggle — Day 4's
  // global archived filter doesn't exist yet, and hiding with no way back would strand an
  // archived item with no path to unarchive it. Mirrors the discoverability pattern the
  // existing Trash view already established.
  const [showArchived, setShowArchived] = useState(false);

  // `background: true` refetches without flipping to the full-page "Loading..."/error states —
  // needed for UploadFileForm's onUploaded callback below, which fires once per successfully
  // uploaded file in a batch. Each call used to unconditionally call setStatus("loading") first,
  // which unmounts this entire component (including UploadFileForm's own in-progress child, with
  // its per-file status list) every time an earlier file in the same batch finishes — discovered
  // via the Day 5 bulk-import stress test, where a 2-file batch upload's progress list vanished
  // mid-upload after the first file's success triggered this refresh. A background refresh
  // failure is also just logged, not surfaced as a full-page error — replacing an already-working
  // page with an error screen over a transient list-refresh hiccup during upload would be worse
  // than briefly stale data (CLAUDE.md rule 7: a failing enhancement shouldn't take down the core
  // feature already on screen).
  const load = useCallback(
    async (options: { background?: boolean } = {}) => {
      if (!options.background) setStatus("loading");
      const [collectionRes, itemsRes] = await Promise.all([
        fetch(`/api/collections/${collectionId}`),
        fetch(`/api/items?collection_id=${collectionId}`),
      ]);

      if (!collectionRes.ok || !itemsRes.ok) {
        if (options.background) {
          console.error("[CollectionDetailView] background refresh failed:", {
            collectionStatus: collectionRes.status,
            itemsStatus: itemsRes.status,
          });
          return;
        }
        setStatus("error");
        return;
      }

      setCollection(await collectionRes.json());
      const itemsBody = await itemsRes.json();
      setItems(itemsBody.items);
      setStatus("loaded");
    },
    [collectionId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleNewNote() {
    setCreateError(undefined);
    setIsCreating(true);

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", collection_id: collectionId }),
    });

    setIsCreating(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setCreateError(body?.error?.message ?? "Something went wrong creating the note.");
      return;
    }

    const created = await response.json();
    router.push(`/items/${created.id}`);
  }

  async function handleNewSnippet() {
    setCreateError(undefined);
    setIsCreating(true);

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code_snippet", collection_id: collectionId }),
    });

    setIsCreating(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setCreateError(body?.error?.message ?? "Something went wrong creating the snippet.");
      return;
    }

    const created = await response.json();
    router.push(`/items/${created.id}`);
  }

  if (status === "loading") {
    return <p className="text-muted-foreground text-sm">Loading...</p>;
  }

  if (status === "error" || !collection) {
    return (
      <p className="text-destructive text-sm" role="alert">
        Something went wrong loading this collection.{" "}
        <button type="button" className="underline" onClick={() => load()}>
          Retry
        </button>
      </p>
    );
  }

  const archivedCount = items.filter((item) => item.is_archived).length;
  const visibleItems = showArchived ? items : items.filter((item) => !item.is_archived);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{collection.name}</h1>
          {collection.description && (
            <p className="text-muted-foreground text-sm">{collection.description}</p>
          )}
        </div>
        <div className="flex items-start gap-2">
          <Button type="button" onClick={handleNewNote} disabled={isCreating}>
            {isCreating ? "Creating..." : "New Note"}
          </Button>
          <Button type="button" variant="outline" onClick={handleNewSnippet} disabled={isCreating}>
            {isCreating ? "Creating..." : "New Snippet"}
          </Button>
          <SaveBookmarkForm collectionId={collectionId} />
          <UploadFileForm collectionId={collectionId} onUploaded={() => load({ background: true })} />
        </div>
      </div>

      {createError && (
        <p className="text-destructive text-sm" role="alert">
          {createError}
        </p>
      )}

      {archivedCount > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          aria-pressed={showArchived}
          onClick={() => setShowArchived((show) => !show)}
        >
          {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
        </Button>
      )}

      {visibleItems.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {items.length === 0
            ? "No items yet — create a note or save a bookmark above."
            : "No items to show — everything in this collection is archived."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleItems.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-3">
              <Link href={`/items/${item.id}`} className="font-medium hover:underline">
                <span aria-label={TYPE_MARKERS[item.type].label}>{TYPE_MARKERS[item.type].icon}</span>{" "}
                {item.is_favorite && <span aria-label="Favorited">★ </span>}
                {item.title || "Untitled Note"}
                {item.is_archived && (
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    (Archived)
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
