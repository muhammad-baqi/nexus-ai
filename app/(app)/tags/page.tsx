import type { Metadata } from "next";

import { TagManagementView } from "@/components/tags/tag-management-view";

export const metadata: Metadata = {
  title: "Tags — Nexus",
};

export default function TagsPage() {
  return <TagManagementView />;
}
