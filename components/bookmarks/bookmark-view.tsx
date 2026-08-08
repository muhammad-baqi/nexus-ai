"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoveItemControl } from "@/components/notes/move-item-control";
import { TagInput, type ItemTag } from "@/components/notes/tag-input";
import { RemindersPanel } from "@/components/reminders/reminders-panel";
import { ShareControl } from "@/components/sharing/share-control";

// Metadata fills in asynchronously (Website_Bookmarks.md's Save Flow) — while `pending`, poll
// for it rather than requiring a manual refresh. Not WebSocket/SSE-backed (no such mechanism
// exists elsewhere in this codebase); a short poll is simple and the fetch job itself times out
// at 10s, so this converges quickly either way.
const METADATA_POLL_INTERVAL_MS = 2000;

// A background poll tick failing (a transient network blip) must not blank an already-loaded
// page — see load()'s `isPoll` param below. Bounded so a persistently-broken connection doesn't
// poll forever; the item's last-known state (still correctly "pending") stays visible either way.
const MAX_POLL_FAILURES = 5;

type WebsiteMetadata = {
  url: string;
  canonical_url: string | null;
  domain: string | null;
  og_image_url: string | null;
  favicon_url: string | null;
  fetch_status: "pending" | "success" | "failed";
};

type Item = {
  id: string;
  title: string;
  description: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  collection_id: string;
  tags: ItemTag[];
  website_metadata: WebsiteMetadata | null;
};

type ServerItem = Omit<Item, "tags"> & { tags: ItemTag[] | null };

type Props = {
  itemId: string;
};

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

function mergeServerItem(prev: Item | null, updated: ServerItem): Item {
  return { ...updated, tags: updated.tags ?? prev?.tags ?? [] };
}

export function BookmarkView({ itemId }: Props) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saveError, setSaveError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isConfirmingTrash, setIsConfirmingTrash] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollFailureCountRef = useRef(0);
  const cancelledRef = useRef(false);

  // `isPoll` distinguishes the initial page load (no item yet — a failure is genuinely
  // blocking) from a background metadata poll tick (the item already rendered successfully
  // once — a transient failure here must not discard it, unlike the initial-load case).
  async function load(isPoll = false) {
    const response = await fetch(`/api/items/${itemId}`);
    if (!response.ok) {
      if (!isPoll) {
        setLoadError("This bookmark couldn't be loaded — it may have been removed.");
      }
      return;
    }
    const data: ServerItem = await response.json();
    setItem((prev) => mergeServerItem(prev, data));
    return data;
  }

  // Component-scoped (not effect-local) so handleRetry's resumed poll below can route through
  // the same bounded-retry path as every other poll tick, rather than a bare one-off `load(true)`
  // that — on failure — would silently stop with no reschedule and no surfaced error.
  async function loadAndSchedule(isPoll = false) {
    const data = await load(isPoll);
    if (cancelledRef.current) return;

    if (!data) {
      if (isPoll && pollFailureCountRef.current < MAX_POLL_FAILURES) {
        pollFailureCountRef.current += 1;
        pollTimerRef.current = setTimeout(() => loadAndSchedule(true), METADATA_POLL_INTERVAL_MS);
      }
      return;
    }

    pollFailureCountRef.current = 0;
    if (data.website_metadata?.fetch_status === "pending") {
      pollTimerRef.current = setTimeout(() => loadAndSchedule(true), METADATA_POLL_INTERVAL_MS);
    }
  }

  useEffect(() => {
    cancelledRef.current = false;
    pollFailureCountRef.current = 0;
    loadAndSchedule(false);

    return () => {
      cancelledRef.current = true;
      clearTimeout(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  function startEditing() {
    if (!item) return;
    setDraftTitle(item.title);
    setDraftDescription(item.description ?? "");
    setSaveError(undefined);
    setMode("edit");
  }

  async function handleSave() {
    if (!draftTitle.trim()) return;
    setSaveError(undefined);
    setIsSaving(true);

    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: draftTitle.trim(), description: draftDescription }),
    });

    setIsSaving(false);

    if (!response.ok) {
      setSaveError(await parseErrorMessage(response, "Something went wrong saving."));
      return;
    }

    const updated: ServerItem = await response.json();
    setItem((prev) => mergeServerItem(prev, updated));
    setMode("view");
  }

  async function handleRetry() {
    if (!item) return;
    setIsRetrying(true);
    const response = await fetch(`/api/items/${itemId}/metadata/retry`, { method: "POST" });
    setIsRetrying(false);

    if (!response.ok) {
      setSaveError(await parseErrorMessage(response, "Something went wrong retrying the fetch."));
      return;
    }

    const updated: { website_metadata: WebsiteMetadata } = await response.json();
    setItem((prev) => (prev ? { ...prev, website_metadata: updated.website_metadata } : prev));
    // Resume polling — the retry just reset fetch_status back to pending. Routed through
    // loadAndSchedule (not a bare load(true)) so a failure on this resumed tick gets the same
    // bounded-retry treatment as every other poll tick, instead of silently dead-ending.
    clearTimeout(pollTimerRef.current);
    pollFailureCountRef.current = 0;
    pollTimerRef.current = setTimeout(() => loadAndSchedule(true), METADATA_POLL_INTERVAL_MS);
  }

  function handleTagsChange(tags: ItemTag[]) {
    setItem((prev) => (prev ? { ...prev, tags } : prev));
  }

  function handleMoved(newCollectionId: string) {
    setItem((prev) => (prev ? { ...prev, collection_id: newCollectionId } : prev));
  }

  async function toggleFavorite() {
    if (!item) return;
    setSaveError(undefined);
    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: !item.is_favorite }),
    });
    if (!response.ok) {
      setSaveError(await parseErrorMessage(response, "Something went wrong."));
      return;
    }
    const updated: ServerItem = await response.json();
    setItem((prev) => mergeServerItem(prev, updated));
  }

  async function toggleArchived() {
    if (!item) return;
    setSaveError(undefined);
    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: !item.is_archived }),
    });
    if (!response.ok) {
      setSaveError(await parseErrorMessage(response, "Something went wrong."));
      return;
    }
    const updated: ServerItem = await response.json();
    setItem((prev) => mergeServerItem(prev, updated));
  }

  async function handleTrash() {
    if (!item) return;
    setSaveError(undefined);
    setIsTrashing(true);
    const response = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
    setIsTrashing(false);

    if (!response.ok) {
      setIsConfirmingTrash(false);
      setSaveError(await parseErrorMessage(response, "Something went wrong."));
      return;
    }

    router.push(`/collections/${item.collection_id}`);
  }

  if (loadError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {loadError}
      </p>
    );
  }

  if (!item) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  const metadata = item.website_metadata;

  const statusIndicator = metadata?.fetch_status === "pending" && (
    <p className="text-muted-foreground text-sm" role="status" aria-live="polite">
      Fetching metadata…
    </p>
  );

  const failedIndicator = metadata?.fetch_status === "failed" && (
    <div className="flex items-center gap-2">
      <p className="text-muted-foreground text-sm" role="status">
        Metadata unavailable
      </p>
      <Button type="button" variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying}>
        {isRetrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      {mode === "view" && (
        <Button type="button" variant="outline" size="sm" onClick={startEditing}>
          Edit
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={toggleFavorite}>
        {item.is_favorite ? "Unfavorite" : "Favorite"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={toggleArchived}>
        {item.is_archived ? "Unarchive" : "Archive"}
      </Button>
      {isConfirmingTrash ? (
        <>
          <span className="text-sm">Move to Trash?</span>
          <Button type="button" variant="destructive" size="sm" onClick={handleTrash} disabled={isTrashing}>
            {isTrashing ? "Moving…" : "Confirm"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsConfirmingTrash(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setIsConfirmingTrash(true)}>
          Move to Trash
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        {metadata?.favicon_url && (
          // Arbitrary external URL from a third-party site fetched at runtime — next/image needs
          // a pre-configured remotePatterns allowlist, and a wildcard pattern would turn the
          // image-optimization proxy into an open fetch-any-URL relay (same reasoning below).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={metadata.favicon_url} alt="" className="mt-1 h-5 w-5 shrink-0" />
        )}
        <div className="flex-1">
          {mode === "edit" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bookmark-title">Title</Label>
              <Input
                id="bookmark-title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                aria-invalid={!draftTitle.trim()}
              />
              {!draftTitle.trim() && (
                <p className="text-destructive text-sm" role="alert">
                  Title is required
                </p>
              )}
            </div>
          ) : (
            <h1 className="text-2xl font-semibold">
              {item.is_favorite && <span aria-label="Favorited">★ </span>}
              {item.title}
              {item.is_archived && (
                <span className="text-muted-foreground ml-2 text-sm font-normal">(Archived)</span>
              )}
            </h1>
          )}
          {metadata?.domain && (
            <a
              href={metadata.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground text-sm hover:underline"
            >
              {metadata.domain}
            </a>
          )}
        </div>
      </div>

      {statusIndicator}
      {failedIndicator}

      {metadata?.og_image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- see favicon note above.
        <img
          src={metadata.og_image_url}
          alt=""
          className="max-h-64 w-full rounded-lg border border-border object-cover"
        />
      )}

      <TagInput itemId={itemId} tags={item.tags} onTagsChange={handleTagsChange} />
      <MoveItemControl itemId={itemId} currentCollectionId={item.collection_id} onMoved={handleMoved} />
      <RemindersPanel itemId={itemId} />
      <ShareControl itemId={itemId} />

      {mode === "edit" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bookmark-description">Description</Label>
          <Textarea
            id="bookmark-description"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            rows={6}
          />
        </div>
      ) : (
        item.description && <p className="whitespace-pre-wrap">{item.description}</p>
      )}

      {saveError && (
        <p className="text-destructive text-sm" role="alert">
          {saveError}
        </p>
      )}

      {mode === "edit" ? (
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={isSaving || !draftTitle.trim()}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </div>
      ) : (
        actions
      )}
    </div>
  );
}
