"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Collection = {
  id: string;
  name: string;
  description: string | null;
};

type Item = {
  id: string;
  title: string;
  updated_at: string;
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

  const load = useCallback(async () => {
    setStatus("loading");
    const [collectionRes, itemsRes] = await Promise.all([
      fetch(`/api/collections/${collectionId}`),
      fetch(`/api/items?collection_id=${collectionId}`),
    ]);

    if (!collectionRes.ok || !itemsRes.ok) {
      setStatus("error");
      return;
    }

    setCollection(await collectionRes.json());
    const itemsBody = await itemsRes.json();
    setItems(itemsBody.items);
    setStatus("loaded");
  }, [collectionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleNewNote() {
    setCreateError(undefined);
    setIsCreating(true);

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection_id: collectionId }),
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

  if (status === "loading") {
    return <p className="text-muted-foreground text-sm">Loading...</p>;
  }

  if (status === "error" || !collection) {
    return (
      <p className="text-destructive text-sm" role="alert">
        Something went wrong loading this collection.{" "}
        <button type="button" className="underline" onClick={load}>
          Retry
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{collection.name}</h1>
          {collection.description && (
            <p className="text-muted-foreground text-sm">{collection.description}</p>
          )}
        </div>
        <Button type="button" onClick={handleNewNote} disabled={isCreating}>
          {isCreating ? "Creating..." : "New Note"}
        </Button>
      </div>

      {createError && (
        <p className="text-destructive text-sm" role="alert">
          {createError}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No notes yet — create one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-3">
              <Link href={`/items/${item.id}`} className="font-medium hover:underline">
                {item.title || "Untitled Note"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
