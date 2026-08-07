"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type ShareLink = { token: string; url: string } | null;

type Props = {
  itemId: string;
};

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

// Self-contained fetch/state, same shape as RemindersPanel — reads current share status off
// GET /api/items/:id (which now embeds `share_link`) rather than a dedicated GET
// /api/items/:id/share route, since API_Design.md only documents POST/DELETE for that path.
export function ShareControl({ itemId }: Props) {
  const [link, setLink] = useState<ShareLink>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isWorking, setIsWorking] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const load = useCallback(async () => {
    const response = await fetch(`/api/items/${itemId}`);
    if (response.ok) {
      const body: { share_link: ShareLink } = await response.json();
      setLink(body.share_link);
    }
    setLoaded(true);
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleShare() {
    setError(undefined);
    setIsWorking(true);
    const response = await fetch(`/api/items/${itemId}/share`, { method: "POST" });
    setIsWorking(false);
    if (!response.ok) {
      setError(await parseErrorMessage(response, "Something went wrong creating this link."));
      return;
    }
    setLink(await response.json());
  }

  async function handleRevoke() {
    setError(undefined);
    setIsWorking(true);
    const response = await fetch(`/api/items/${itemId}/share`, { method: "DELETE" });
    setIsWorking(false);
    if (!response.ok) {
      setError(await parseErrorMessage(response, "Something went wrong revoking this link."));
      return;
    }
    setLink(null);
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
  }

  if (!loaded) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {link ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              {copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Couldn't copy" : "Copy share link"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleRevoke} disabled={isWorking}>
              {isWorking ? "Revoking…" : "Revoke"}
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={handleShare} disabled={isWorking}>
            {isWorking ? "Sharing…" : "Share"}
          </Button>
        )}
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
