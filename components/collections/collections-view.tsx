"use client";

import { useCallback, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollectionCard, type Collection } from "@/components/collections/collection-card";
import { CreateCollectionForm } from "@/components/collections/create-collection-form";
import { TrashedCollectionRow } from "@/components/collections/trashed-collection-row";

type View = "active" | "archived" | "trashed";
type Status = "loading" | "loaded" | "error";

export function CollectionsView() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("active");

  const load = useCallback(async () => {
    setStatus("loading");
    const response = await fetch(`/api/collections?view=${view}`);
    if (!response.ok) {
      setStatus("error");
      return;
    }
    const body = await response.json();
    setCollections(body.collections);
    setStatus("loaded");
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  // docs/01_MVP/Collections.md: name search filters client-side as-you-type — expected
  // collection counts are small (tens, not thousands) per user.
  const visibleCollections = collections.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Collections</h1>
        <CreateCollectionForm onCreated={load} />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="collectionSearch">Search</Label>
          <Input
            id="collectionSearch"
            placeholder="Search collections by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="collectionView">View</Label>
          <select
            id="collectionView"
            value={view}
            onChange={(e) => setView(e.target.value as View)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="trashed">Trash</option>
          </select>
        </div>
      </div>

      {status === "loading" && <p className="text-muted-foreground text-sm">Loading...</p>}
      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong loading your collections.{" "}
          <button type="button" className="underline" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {status === "loaded" && visibleCollections.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {view === "trashed"
            ? "Trash is empty."
            : view === "archived"
              ? "No archived collections."
              : "No collections match your search yet — create one above."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {view === "trashed"
          ? visibleCollections.map((collection) => (
              <TrashedCollectionRow
                key={collection.id}
                collection={collection}
                onRestored={load}
              />
            ))
          : visibleCollections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} onChanged={load} />
            ))}
      </div>
    </div>
  );
}
