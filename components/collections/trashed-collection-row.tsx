"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  collection: { id: string; name: string };
  onRestored: () => void;
};

export function TrashedCollectionRow({ collection, onRestored }: Props) {
  const [status, setStatus] = useState<"idle" | "restoring" | "error">("idle");

  async function handleRestore() {
    setStatus("restoring");
    const response = await fetch(`/api/collections/${collection.id}/restore`, {
      method: "POST",
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    onRestored();
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-4">
      <span>{collection.name}</span>
      <div className="flex flex-col items-end gap-1">
        <Button type="button" variant="outline" size="sm" onClick={handleRestore} disabled={status === "restoring"}>
          {status === "restoring" ? "Restoring..." : "Restore"}
        </Button>
        {status === "error" && (
          <p className="text-destructive text-xs" role="alert">
            Something went wrong restoring this collection.
          </p>
        )}
      </div>
    </div>
  );
}
