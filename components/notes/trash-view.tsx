"use client";

import { useCallback, useEffect, useState } from "react";

import { TrashedCollectionRow } from "@/components/collections/trashed-collection-row";
import { TrashedItemRow } from "@/components/notes/trashed-item-row";

type Item = { id: string; title: string };
type Collection = { id: string; name: string };
type Status = "loading" | "loaded" | "error";

// Per docs/03_Architecture/API_Design.md's Trash section: one unified Trash view for both
// trashed items and trashed collections (GET /api/trash), even though each type's own
// restore/permanent-delete still goes through its own existing route
// (collections have no permanent-delete route — only items do, per Knowledge_Items.md).
// Collections also remain reachable via their own inline Trash toggle on /collections
// (components/collections/collections-view.tsx) — this page doesn't replace that, just adds
// the single cross-type view the API doc calls for.
export function TrashView() {
  const [items, setItems] = useState<Item[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  const load = useCallback(async () => {
    setStatus("loading");
    const response = await fetch("/api/trash");
    if (!response.ok) {
      setStatus("error");
      return;
    }
    const body = await response.json();
    setItems(body.items);
    setCollections(body.collections);
    setStatus("loaded");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleItemRestored(message: string) {
    setStatusMessage(message);
    load();
  }

  function handleCollectionRestored() {
    setStatusMessage(undefined);
    load();
  }

  function handlePermanentlyDeleted() {
    setStatusMessage(undefined);
    load();
  }

  const isEmpty = items.length === 0 && collections.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Trash</h1>

      {statusMessage && (
        <p className="text-muted-foreground text-sm" role="status">
          {statusMessage}
        </p>
      )}

      {status === "loading" && <p className="text-muted-foreground text-sm">Loading...</p>}
      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong loading Trash.{" "}
          <button type="button" className="underline" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {status === "loaded" && isEmpty && (
        <p className="text-muted-foreground text-sm">Trash is empty.</p>
      )}

      {collections.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">Collections</h2>
          {collections.map((collection) => (
            <TrashedCollectionRow
              key={collection.id}
              collection={collection}
              onRestored={handleCollectionRestored}
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">Items</h2>
          {items.map((item) => (
            <TrashedItemRow
              key={item.id}
              item={item}
              onRestored={handleItemRestored}
              onPermanentlyDeleted={handlePermanentlyDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
