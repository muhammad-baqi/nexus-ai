import type { Metadata } from "next";

import { SearchView } from "@/components/search/search-view";

export const metadata: Metadata = {
  title: "Search — Nexus",
};

export default function SearchPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Search</h1>
      <SearchView />
    </div>
  );
}
