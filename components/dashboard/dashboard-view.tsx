"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatRelativeTime } from "@/lib/format/relative-time";

type SectionResult<T> = { data: T; error: string | null };

type Item = {
  id: string;
  collection_id: string;
  type: string;
  title: string;
  is_favorite?: boolean;
  is_archived?: boolean;
  updated_at: string;
};

type ViewedItem = Item & { viewed_at: string };

type Collection = { id: string; name: string; color: string | null; icon: string | null };

type RecentCollection = Collection & { is_favorite: boolean; last_activity_at: string };

type Favorites = { collections: Collection[]; items: Item[] };

type Statistics = { totalItems: number; totalCollections: number; byType: { type: string; count: number }[] };

type DashboardData = {
  recentItems: SectionResult<Item[]>;
  recentlyViewed: SectionResult<ViewedItem[]>;
  favorites: SectionResult<Favorites>;
  recentCollections: SectionResult<RecentCollection[]>;
  statistics: SectionResult<Statistics>;
  // Always empty for now — Reminders/Notifications is a Day 6 feature (see the matching note on
  // loadUpcomingReminders in app/api/dashboard/route.ts). The shape stays a real SectionResult
  // (not hardcoded away) so this section still gets real error handling if the backend query
  // ever fails, and needs no client change once Day 6 starts returning real rows.
  upcomingReminders: SectionResult<unknown[]>;
};

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  website: "Website",
  pdf: "PDF",
  image: "Image",
  file: "File",
  code_snippet: "Code snippet",
};

type Status = "loading" | "loaded" | "error";

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="text-destructive text-sm" role="alert">
      Couldn&apos;t load this section.{" "}
      <button type="button" className="underline" onClick={onRetry}>
        Retry
      </button>
    </p>
  );
}

function SectionShell({
  title,
  error,
  onRetry,
  empty,
  emptyMessage,
  children,
}: {
  title: string;
  error: string | null;
  onRetry: () => void;
  empty: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{title}</h2>
      {error ? (
        <SectionError onRetry={onRetry} />
      ) : empty ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        children
      )}
    </div>
  );
}

function ItemRow({ item, timestamp, timestampLabel }: { item: Item; timestamp: string; timestampLabel?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <Link href={`/items/${item.id}`} className="truncate hover:underline">
        {item.is_favorite && <span aria-label="Favorited">★ </span>}
        {item.title || "Untitled Note"}
        <span className="text-muted-foreground ml-1.5 text-xs">{TYPE_LABELS[item.type] ?? item.type}</span>
      </Link>
      <span className="text-muted-foreground shrink-0 text-xs" title={timestampLabel}>
        {formatRelativeTime(timestamp)}
      </span>
    </li>
  );
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  // Every SectionShell's retry button (and the whole-page retry) calls the same `load` — without
  // this, clicking retry while a slower prior request is still in flight could let that stale
  // response resolve *after* the retry's fresh one and silently clobber good data with old/failed
  // state (self-review-caught race, same AbortController pattern search-view.tsx already uses).
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    fetch("/api/dashboard", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("dashboard fetch failed"))))
      .then((body: DashboardData) => {
        setData(body);
        setStatus("loaded");
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        console.error("[dashboard-view] failed to load dashboard:", error);
        setStatus("error");
      });
  }, []);

  // Per Dashboard.md's Data Freshness section: client-side revalidation on navigation to the
  // page is sufficient (no live-updating feed required) — a plain fetch-on-mount already
  // satisfies that since Next.js remounts this component on each navigation to /dashboard.
  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  if (status === "loading" && !data) {
    return <p className="text-muted-foreground text-sm">Loading your dashboard…</p>;
  }

  if (status === "error" && !data) {
    return (
      <p className="text-destructive text-sm" role="alert">
        Something went wrong loading the dashboard.{" "}
        <button type="button" className="underline" onClick={load}>
          Retry
        </button>
      </p>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <SectionShell
        title="Recent Items"
        error={data.recentItems.error}
        onRetry={load}
        empty={data.recentItems.data?.length === 0}
        emptyMessage="No items yet — save your first note and it'll show up here."
      >
        <ul className="flex flex-col gap-1.5">
          {data.recentItems.data?.map((item) => (
            <ItemRow key={item.id} item={item} timestamp={item.updated_at} />
          ))}
        </ul>
      </SectionShell>

      <SectionShell
        title="Recently Viewed"
        error={data.recentlyViewed.error}
        onRetry={load}
        empty={data.recentlyViewed.data?.length === 0}
        emptyMessage="Items you open will show up here."
      >
        <ul className="flex flex-col gap-1.5">
          {data.recentlyViewed.data?.map((item) => (
            <ItemRow key={item.id} item={item} timestamp={item.viewed_at} />
          ))}
        </ul>
      </SectionShell>

      <SectionShell
        title="Favorites"
        error={data.favorites.error}
        onRetry={load}
        empty={
          (data.favorites.data?.collections.length ?? 0) === 0 && (data.favorites.data?.items.length ?? 0) === 0
        }
        emptyMessage="Favorite a Collection or item and it'll show up here."
      >
        <div className="flex flex-col gap-3">
          {data.favorites.data && data.favorites.data.collections.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.favorites.data.collections.map((collection) => (
                <Link
                  key={collection.id}
                  href={`/collections/${collection.id}`}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs hover:underline"
                >
                  ★ {collection.name}
                </Link>
              ))}
            </div>
          )}
          {data.favorites.data && data.favorites.data.items.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {data.favorites.data.items.map((item) => (
                <ItemRow key={item.id} item={item} timestamp={item.updated_at} />
              ))}
            </ul>
          )}
        </div>
      </SectionShell>

      <SectionShell
        title="Recent Collections"
        error={data.recentCollections.error}
        onRetry={load}
        empty={data.recentCollections.data?.length === 0}
        emptyMessage="Your most recently active Collections will appear here."
      >
        <ul className="flex flex-col gap-1.5">
          {data.recentCollections.data?.map((collection) => (
            <li key={collection.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/collections/${collection.id}`} className="truncate hover:underline">
                {collection.is_favorite && <span aria-label="Favorited">★ </span>}
                {collection.name}
              </Link>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatRelativeTime(collection.last_activity_at)}
              </span>
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell title="Statistics" error={data.statistics.error} onRetry={load} empty={false}>
        {data.statistics.data && (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              {data.statistics.data.totalItems} item{data.statistics.data.totalItems === 1 ? "" : "s"} ·{" "}
              {data.statistics.data.totalCollections} Collection
              {data.statistics.data.totalCollections === 1 ? "" : "s"}
            </p>
            {data.statistics.data.byType.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {data.statistics.data.byType
                  .map((row) => `${row.count} ${(TYPE_LABELS[row.type] ?? row.type).toLowerCase()}${row.count === 1 ? "" : "s"}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Upcoming Reminders"
        error={data.upcomingReminders.error}
        onRetry={load}
        empty={data.upcomingReminders.data?.length === 0}
        emptyMessage="No upcoming reminders."
      >
        {null}
      </SectionShell>
    </div>
  );
}
