"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CodeEditor } from "@/components/code-snippets/code-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORTED_LANGUAGES } from "@/lib/code-snippets/languages";
import { MoveItemControl } from "@/components/notes/move-item-control";
import { TagInput, type ItemTag } from "@/components/notes/tag-input";
import { RemindersPanel } from "@/components/reminders/reminders-panel";

type CodeSnippetData = {
  language: string;
  code_content: string;
};

type Item = {
  id: string;
  title: string;
  description: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  collection_id: string;
  tags: ItemTag[];
  code_snippet_data: CodeSnippetData | null;
};

// tags: null means "the read itself failed" (see the route's own comment); code_snippet_data:
// undefined means "this response didn't touch it at all" (e.g. a favorite/archive PATCH) — both
// distinct from Item's own always-present shape, and both require mergeServerItem's fallback.
type ServerItem = Omit<Item, "tags" | "code_snippet_data"> & {
  tags: ItemTag[] | null;
  code_snippet_data?: CodeSnippetData | null;
};

type Props = {
  itemId: string;
};

async function parseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

// code_snippet_data is only ever included in a PATCH response when this request's body actually
// touched language/code_content (app/api/items/[id]/route.ts) — a plain favorite/archive toggle
// omits it entirely, same reason `tags` needs the identical `?? prev?.` fallback below. Without
// it, every toggle click would blank the visible code editor by overwriting a real value with
// `undefined`.
function mergeServerItem(prev: Item | null, updated: ServerItem): Item {
  return {
    ...updated,
    tags: updated.tags ?? prev?.tags ?? [],
    code_snippet_data: updated.code_snippet_data ?? prev?.code_snippet_data ?? null,
  };
}

// Explicit Save, not continuous autosave — Code_Snippets.md leaves this to implementation
// ("no autosave-while-typing... as strict as Notes'"), and snippets are typically pasted in
// rather than composed over a long session. Mirrors BookmarkView's Edit/Save toggle shape.
export function CodeSnippetView({ itemId }: Props) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftLanguage, setDraftLanguage] = useState("plaintext");
  const [draftCode, setDraftCode] = useState("");
  const [saveError, setSaveError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isConfirmingTrash, setIsConfirmingTrash] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch(`/api/items/${itemId}`);
      if (cancelled) return;
      if (!response.ok) {
        setLoadError("This snippet couldn't be loaded — it may have been removed.");
        return;
      }
      const data: ServerItem = await response.json();
      setItem((prev) => mergeServerItem(prev, data));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  function startEditing() {
    if (!item) return;
    setDraftTitle(item.title);
    setDraftDescription(item.description ?? "");
    setDraftLanguage(item.code_snippet_data?.language ?? "plaintext");
    setDraftCode(item.code_snippet_data?.code_content ?? "");
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
      body: JSON.stringify({
        title: draftTitle.trim(),
        description: draftDescription,
        language: draftLanguage,
        code_content: draftCode,
      }),
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

  async function handleCopy() {
    if (!item?.code_snippet_data) return;
    try {
      await navigator.clipboard.writeText(item.code_snippet_data.code_content);
      setCopyStatus("copied");
    } catch (error) {
      console.error("[code-snippet-view] copy to clipboard failed:", error);
      setCopyStatus("error");
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
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

  const snippet = item.code_snippet_data;

  const actions = (
    <div className="flex items-center gap-2">
      {mode === "view" && (
        <Button type="button" variant="outline" size="sm" onClick={startEditing}>
          Edit
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={!snippet}>
        {copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Couldn't copy" : "Copy"}
      </Button>
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
      {mode === "edit" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="snippet-title">Title</Label>
          <Input
            id="snippet-title"
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

      <TagInput itemId={itemId} tags={item.tags} onTagsChange={handleTagsChange} />
      <MoveItemControl itemId={itemId} currentCollectionId={item.collection_id} onMoved={handleMoved} />
      <RemindersPanel itemId={itemId} />

      {mode === "edit" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="snippet-language">Language</Label>
          <select
            id="snippet-language"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={draftLanguage}
            onChange={(e) => setDraftLanguage(e.target.value)}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        snippet && (
          <p className="text-muted-foreground text-sm">
            {SUPPORTED_LANGUAGES.find((lang) => lang.value === snippet.language)?.label ?? snippet.language}
          </p>
        )
      )}

      {mode === "edit" ? (
        <CodeEditor value={draftCode} language={draftLanguage} onChange={setDraftCode} />
      ) : (
        snippet && <CodeEditor value={snippet.code_content} language={snippet.language} readOnly />
      )}

      {mode === "edit" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="snippet-description">Description</Label>
          <Textarea
            id="snippet-description"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            rows={4}
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
