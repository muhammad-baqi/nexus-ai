import type { Metadata } from "next";

import { NoteEditor } from "@/components/notes/note-editor";

export const metadata: Metadata = {
  title: "Note — Nexus",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ItemPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      {/* key={id}: forces a full remount on navigation between notes, so a still-ticking
          autosave debounce/retry timer for the previous note can never fire against — and
          overwrite — a different note's id once its own effects/refs are torn down. */}
      <NoteEditor key={id} itemId={id} />
    </div>
  );
}
