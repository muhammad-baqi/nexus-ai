"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Item = { id: string; title: string };

type Props = {
  item: Item;
  // Called with a status message (distinguishing a plain restore from a re-homed one) — the row
  // itself is about to disappear from the list, so the parent is what displays it.
  onRestored: (message: string) => void;
  onPermanentlyDeleted: () => void;
};

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export function TrashedItemRow({ item, onRestored, onPermanentlyDeleted }: Props) {
  const [status, setStatus] = useState<"idle" | "restoring" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | undefined>();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  async function handleRestore() {
    setStatus("restoring");
    setError(undefined);
    const response = await fetch(`/api/items/${item.id}/restore`, { method: "POST" });

    if (!response.ok) {
      setStatus("error");
      setError(await parseErrorMessage(response, "Something went wrong restoring this item."));
      return;
    }

    const body: { rehomed: boolean; rehomedToCollectionName?: string } = await response.json();
    onRestored(
      body.rehomed
        ? `"${item.title}" was restored to ${body.rehomedToCollectionName ?? "a different collection"} (its original collection is gone).`
        : `"${item.title}" was restored.`,
    );
  }

  async function handlePermanentDelete() {
    setStatus("deleting");
    setError(undefined);
    const response = await fetch(`/api/items/${item.id}/permanent`, { method: "DELETE" });

    if (!response.ok) {
      setStatus("error");
      setIsConfirmingDelete(false);
      setError(await parseErrorMessage(response, "Something went wrong deleting this item."));
      return;
    }

    onPermanentlyDeleted();
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-4">
      <span>{item.title}</span>
      <div className="flex flex-col items-end gap-1">
        {isConfirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Delete forever?</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handlePermanentDelete}
              disabled={status === "deleting"}
            >
              {status === "deleting" ? "Deleting…" : "Confirm"}
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
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRestore}
              disabled={status === "restoring"}
            >
              {status === "restoring" ? "Restoring..." : "Restore"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setIsConfirmingDelete(true)}
            >
              Delete forever
            </Button>
          </div>
        )}
        {status === "error" && (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
