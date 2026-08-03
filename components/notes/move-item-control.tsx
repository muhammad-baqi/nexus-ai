"use client";

import { useCallback, useEffect, useState } from "react";

import { Label } from "@/components/ui/label";

type Collection = {
  id: string;
  name: string;
  is_archived: boolean;
};

type Props = {
  itemId: string;
  currentCollectionId: string;
  onMoved: (newCollectionId: string) => void;
};

async function fetchCollections(): Promise<Collection[]> {
  // A note can already live inside a collection that's since been archived (archiving a
  // collection never blocked creating items inside it) — the current collection must always be
  // selectable even when it's not in the "active" view, so both views are fetched and merged.
  // "trashed" is never a legal move target and is intentionally excluded.
  const [activeRes, archivedRes] = await Promise.all([
    fetch("/api/collections?view=active"),
    fetch("/api/collections?view=archived"),
  ]);

  if (!activeRes.ok || !archivedRes.ok) {
    throw new Error("Failed to load collections");
  }

  const [activeBody, archivedBody] = await Promise.all([activeRes.json(), archivedRes.json()]);
  return [...activeBody.collections, ...archivedBody.collections];
}

export function MoveItemControl({ itemId, currentCollectionId, onMoved }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [moveError, setMoveError] = useState<string | undefined>();
  const [isMoving, setIsMoving] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      setCollections(await fetchCollections());
      setLoadError(undefined);
    } catch {
      setLoadError("Couldn't load your collections.");
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newCollectionId = e.target.value;
    if (newCollectionId === currentCollectionId) return;

    setMoveError(undefined);
    setIsMoving(true);

    try {
      const response = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection_id: newCollectionId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMoveError(body?.error?.message ?? "Something went wrong moving this item.");
        // The target may have been trashed/deleted between the list fetch and this selection —
        // refresh so the stale option disappears (Knowledge_Items.md's Error States section).
        loadCollections();
        return;
      }

      onMoved(newCollectionId);
    } catch {
      // A thrown fetch (offline/network failure), not just a non-2xx response — without this,
      // isMoving would stay true forever and the select would be stuck disabled.
      setMoveError("Something went wrong moving this item.");
    } finally {
      setIsMoving(false);
    }
  }

  // The current collection might not be in `collections` yet (still loading, or the load
  // failed) — always render it as a fallback option so the select never shows an empty/wrong
  // value while data is in flight.
  const hasCurrentOption = collections.some((c) => c.id === currentCollectionId);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="move-item-collection">Collection</Label>
      <select
        id="move-item-collection"
        value={currentCollectionId}
        onChange={handleChange}
        disabled={isMoving}
        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
      >
        {!hasCurrentOption && <option value={currentCollectionId}>Current collection</option>}
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name}
            {collection.is_archived ? " (Archived)" : ""}
          </option>
        ))}
      </select>
      {loadError && (
        <p className="text-destructive text-sm" role="alert">
          {loadError}
        </p>
      )}
      {moveError && (
        <p className="text-destructive text-sm" role="alert">
          {moveError}
        </p>
      )}
    </div>
  );
}
