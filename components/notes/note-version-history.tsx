"use client";

import { format } from "date-fns";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { NoteBody } from "@/components/notes/note-body";

type VersionSummary = {
  id: string;
  created_at: string;
};

type VersionDetail = VersionSummary & {
  content: string;
};

type Status = "loading" | "loaded" | "error";

type Props = {
  itemId: string;
  onRestored: (content: string, versionId: string | null) => void;
};

export function NoteVersionHistory({ itemId, onRestored }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<VersionDetail | null>(null);
  const [previewError, setPreviewError] = useState<string | undefined>();
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Initial status is already "loading" — no setState needed before the fetch here.
    fetch(`/api/items/${itemId}/versions`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: VersionSummary[]) => {
        if (cancelled) return;
        setVersions(data);
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  function retryLoad() {
    setStatus("loading");
    fetch(`/api/items/${itemId}/versions`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: VersionSummary[]) => {
        setVersions(data);
        setStatus("loaded");
      })
      .catch(() => setStatus("error"));
  }

  async function handlePreview(versionId: string) {
    setPreviewId(versionId);
    setPreview(null);
    setPreviewError(undefined);

    const response = await fetch(`/api/items/${itemId}/versions/${versionId}`);
    if (!response.ok) {
      setPreviewError("Something went wrong loading this version.");
      return;
    }
    setPreview(await response.json());
  }

  function closePreview() {
    setPreviewId(null);
    setPreview(null);
    setPreviewError(undefined);
  }

  async function handleRestore(versionId: string) {
    setIsRestoring(true);
    const response = await fetch(`/api/items/${itemId}/versions/${versionId}/restore`, {
      method: "POST",
    });
    setIsRestoring(false);

    if (!response.ok) {
      setPreviewError("Something went wrong restoring this version.");
      return;
    }

    const updated = await response.json();
    onRestored(updated.description ?? "", updated.versionId ?? null);
    closePreview();
    retryLoad(); // restoring adds a new version entry — refresh the list to show it
  }

  if (status === "loading") {
    return <p className="text-muted-foreground text-sm">Loading version history…</p>;
  }

  if (status === "error") {
    return (
      <p className="text-destructive text-sm" role="alert">
        Something went wrong loading version history.{" "}
        <button type="button" className="underline" onClick={retryLoad}>
          Retry
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <h2 className="text-sm font-semibold">Version history</h2>

      {versions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No previous versions yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {versions.map((version) => (
            <li key={version.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">
                {format(new Date(version.created_at), "MMM d, yyyy, h:mm a")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreview(version.id)}
              >
                Preview
              </Button>
            </li>
          ))}
        </ul>
      )}

      {previewId && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          {previewError && (
            <p className="text-destructive text-sm" role="alert">
              {previewError}
            </p>
          )}
          {preview ? (
            <>
              <NoteBody content={preview.content} />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleRestore(preview.id)}
                  disabled={isRestoring}
                >
                  {isRestoring ? "Restoring…" : "Restore this version"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={closePreview}>
                  Close
                </Button>
              </div>
            </>
          ) : (
            !previewError && <p className="text-muted-foreground text-sm">Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}
