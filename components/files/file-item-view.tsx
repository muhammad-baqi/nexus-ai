"use client";

import Image from "next/image";
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
import { formatBytes } from "@/lib/format/format-bytes";
import { isTextPreviewable } from "@/lib/files/constants";

// PDF text extraction runs as a background job (extractPdfText, enqueued at upload time) and can
// still be 'pending' by the time this view's first load lands — same short-poll pattern
// BookmarkView already established for its own background job (fetchBookmarkMetadata), for the
// same reason: no WebSocket/SSE mechanism exists elsewhere in this codebase, and the job itself
// is bounded (a single PDF parse), so a short poll converges quickly.
const EXTRACTION_POLL_INTERVAL_MS = 2000;

// A background poll tick failing (a transient network blip) must not blank an already-loaded
// page — see load()'s `isPoll` param below. Bounded so a persistently-broken connection doesn't
// poll forever; the item's last-known state (still correctly "pending") stays visible either way.
const MAX_POLL_FAILURES = 5;

type FileAsset = {
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  extraction_status: "not_applicable" | "pending" | "success" | "failed";
  download_url: string | null;
};

type Item = {
  id: string;
  type: "pdf" | "image" | "file";
  title: string;
  description: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  collection_id: string;
  tags: ItemTag[];
  file_asset: FileAsset | null;
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

export function FileItemView({ itemId }: Props) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saveError, setSaveError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingTrash, setIsConfirmingTrash] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);
  const [textPreview, setTextPreview] = useState<string | undefined>();
  const [textPreviewFailed, setTextPreviewFailed] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollFailureCountRef = useRef(0);

  // `isPoll` distinguishes the initial page load (no item yet — a failure is genuinely
  // blocking) from a background extraction-status poll tick (the item already rendered
  // successfully once — a transient failure here must not discard it, unlike the initial-load
  // case).
  async function load(isPoll = false) {
    const response = await fetch(`/api/items/${itemId}`);
    if (!response.ok) {
      if (!isPoll) {
        setLoadError("This file couldn't be loaded — it may have been removed.");
      }
      return;
    }
    const data: ServerItem = await response.json();
    setItem((prev) => mergeServerItem(prev, data));
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    pollFailureCountRef.current = 0;

    async function loadAndSchedule(isPoll = false) {
      const data = await load(isPoll);
      if (cancelled) return;

      if (!data) {
        if (isPoll && pollFailureCountRef.current < MAX_POLL_FAILURES) {
          pollFailureCountRef.current += 1;
          pollTimerRef.current = setTimeout(() => loadAndSchedule(true), EXTRACTION_POLL_INTERVAL_MS);
        }
        return;
      }

      pollFailureCountRef.current = 0;
      if (data.file_asset?.extraction_status === "pending") {
        pollTimerRef.current = setTimeout(() => loadAndSchedule(true), EXTRACTION_POLL_INTERVAL_MS);
      }
    }

    loadAndSchedule(false);

    return () => {
      cancelled = true;
      clearTimeout(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  useEffect(() => {
    let cancelled = false;
    const asset = item?.file_asset;
    if (!asset?.download_url || !isTextPreviewable(asset.mime_type)) {
      setTextPreview(undefined);
      setTextPreviewFailed(false);
      return;
    }

    setTextPreviewFailed(false);
    fetch(asset.download_url)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("fetch failed"))))
      .then((text) => {
        if (!cancelled) setTextPreview(text);
      })
      .catch((error) => {
        console.error("[FileItemView] text preview fetch failed:", error);
        if (!cancelled) {
          setTextPreview(undefined);
          setTextPreviewFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
    // Deliberately narrowed to the two primitive fields the fetch actually depends on, not the
    // whole `item?.file_asset` object — mergeServerItem builds a new item object on every PATCH
    // response (e.g. toggling favorite), which would otherwise re-run this effect (and re-fetch
    // the text preview) on every unrelated field change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.file_asset?.download_url, item?.file_asset?.mime_type]);

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

  const asset = item.file_asset;

  const extractionIndicator = asset?.extraction_status === "pending" && (
    <p className="text-muted-foreground text-sm" role="status" aria-live="polite">
      Extracting text…
    </p>
  );

  const notSearchableIndicator = asset?.extraction_status === "failed" && (
    <p className="text-muted-foreground text-sm" role="status">
      Text search unavailable for this file.
    </p>
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
      <div className="flex-1">
        {mode === "edit" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file-title">Title</Label>
            <Input
              id="file-title"
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
        {asset && (
          <p className="text-muted-foreground text-sm">
            {asset.original_filename} · {formatBytes(asset.size_bytes)}
          </p>
        )}
      </div>

      {extractionIndicator}
      {notSearchableIndicator}

      <FilePreview
        type={item.type}
        asset={asset}
        textPreview={textPreview}
        textPreviewFailed={textPreviewFailed}
        title={item.title}
      />

      {asset?.download_url && (
        <a
          href={asset.download_url}
          download={asset.original_filename}
          className="text-primary self-start text-sm underline"
        >
          Download original file
        </a>
      )}

      <TagInput itemId={itemId} tags={item.tags} onTagsChange={handleTagsChange} />
      <MoveItemControl itemId={itemId} currentCollectionId={item.collection_id} onMoved={handleMoved} />
      <RemindersPanel itemId={itemId} />
      <ShareControl itemId={itemId} />

      {mode === "edit" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="file-description">Notes</Label>
          <Textarea
            id="file-description"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            rows={4}
          />
        </div>
      )}
      {mode === "view" && item.description && <p className="whitespace-pre-wrap">{item.description}</p>}

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

type FilePreviewProps = {
  type: Item["type"];
  asset: FileAsset | null;
  textPreview: string | undefined;
  textPreviewFailed: boolean;
  title: string;
};

// Preview mechanics genuinely differ per type (File_Uploads.md): PDFs get an in-app viewer,
// Images render full-size, general Files get an inline preview only where feasible (plain text)
// and otherwise fall back to the metadata-card + Download that's already shown above this.
function FilePreview({ type, asset, textPreview, textPreviewFailed, title }: FilePreviewProps) {
  if (!asset?.download_url) return null;

  if (type === "pdf") {
    // Browser-native PDF rendering via <iframe>, not a bundled pdf.js viewer — a deliberate,
    // documented implementation choice (File_Uploads.md leaves the exact viewer mechanism
    // unspecified) that avoids a heavy new dependency; every evergreen browser this app targets
    // renders PDFs natively this way.
    return (
      <iframe
        src={asset.download_url}
        title={title}
        className="h-[600px] w-full rounded-lg border border-border"
      />
    );
  }

  if (type === "image") {
    return (
      <div className="relative h-[500px] w-full overflow-hidden rounded-lg border border-border bg-muted">
        <Image
          src={asset.download_url}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, 700px"
          className="object-contain"
        />
      </div>
    );
  }

  if (textPreview !== undefined) {
    return (
      <pre className="max-h-[500px] overflow-auto rounded-lg border border-border bg-muted p-4 text-sm whitespace-pre-wrap">
        {textPreview}
      </pre>
    );
  }

  if (textPreviewFailed) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Preview unavailable — the file content couldn&apos;t be loaded. You can still download it
        above.
      </p>
    );
  }

  return null;
}
