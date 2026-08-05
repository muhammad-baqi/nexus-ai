import type { Metadata } from "next";

import { BookmarkView } from "@/components/bookmarks/bookmark-view";
import { FileItemView } from "@/components/files/file-item-view";
import { NoteEditor } from "@/components/notes/note-editor";
import { createClient } from "@/lib/supabase/server";

const FILE_ITEM_TYPES = new Set(["pdf", "image", "file"]);

export const metadata: Metadata = {
  title: "Item — Nexus",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ItemPage({ params }: Props) {
  const { id } = await params;

  // A lightweight server-side type lookup (same direct-Supabase-in-a-Server-Component pattern
  // app/(app)/settings/page.tsx already uses) decides which client component to mount. RLS
  // already scopes this to the caller's own items; a wrong-owner/nonexistent/trashed id just
  // resolves to `type: undefined` here and falls through to NoteEditor below, whose own
  // client-side fetch renders the standard "couldn't be loaded" error — not duplicated here.
  const supabase = await createClient();
  const { data } = await supabase.from("knowledge_items").select("type").eq("id", id).maybeSingle();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      {data?.type === "website" ? (
        <BookmarkView key={id} itemId={id} />
      ) : data?.type && FILE_ITEM_TYPES.has(data.type) ? (
        <FileItemView key={id} itemId={id} />
      ) : (
        // key={id}: forces a full remount on navigation between items, so a still-ticking
        // autosave debounce/retry timer for the previous note can never fire against — and
        // overwrite — a different note's id once its own effects/refs are torn down.
        <NoteEditor key={id} itemId={id} />
      )}
    </div>
  );
}
