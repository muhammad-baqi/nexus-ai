import type { Metadata } from "next";

import { CollectionDetailView } from "@/components/collections/collection-detail-view";

export const metadata: Metadata = {
  title: "Collection — Nexus",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CollectionDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <CollectionDetailView collectionId={id} />
    </div>
  );
}
