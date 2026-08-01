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
      <NoteEditor itemId={id} />
    </div>
  );
}
