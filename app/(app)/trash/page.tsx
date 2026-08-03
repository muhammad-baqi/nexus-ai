import type { Metadata } from "next";

import { TrashView } from "@/components/notes/trash-view";

export const metadata: Metadata = {
  title: "Trash — Nexus",
};

export default function TrashPage() {
  return <TrashView />;
}
