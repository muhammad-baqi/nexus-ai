"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildItemsSearchParams, hasActiveFilters } from "@/lib/search/build-items-query";
import {
  DEFAULT_ITEMS_PAGE_LIMIT,
  KNOWLEDGE_ITEM_TYPES,
  SORT_OPTIONS,
  type SortOption,
} from "@/lib/validation/items";

// Live-results debounce (Search.md: "~200-300ms") vs. the longer "the user has actually settled
// on this query" window before it's worth recording as a recent search — recording on every
// keystroke-driven fetch would fill the list with partial prefixes ("s", "st", "str", ...).
const RESULTS_DEBOUNCE_MS = 250;
const RECENT_SEARCH_SETTLE_MS = 1200;
const PAGE_LIMIT = DEFAULT_ITEMS_PAGE_LIMIT;

type Item = {
  id: string;
  collection_id: string;
  type: string;
  title: string;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

type Collection = { id: string; name: string };
type Tag = { id: string; name: string };
type Status = "idle" | "loading" | "loaded" | "error";

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  website: "Website",
  pdf: "PDF",
  image: "Image",
  file: "File",
  code_snippet: "Code snippet",
};

const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Relevance",
  updated: "Recently updated",
  created: "Recently created",
  title: "Title A–Z",
};

async function fetchAllCollections(): Promise<Collection[]> {
  const [activeRes, archivedRes] = await Promise.all([
    fetch("/api/collections?view=active"),
    fetch("/api/collections?view=archived"),
  ]);
  if (!activeRes.ok || !archivedRes.ok) return [];
  const [activeBody, archivedBody] = await Promise.all([activeRes.json(), archivedRes.json()]);
  return [...activeBody.collections, ...archivedBody.collections];
}

export function SearchView() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [favorite, setFavorite] = useState<boolean | undefined>(undefined);
  const [archived, setArchived] = useState<boolean | undefined>(undefined);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sort, setSort] = useState<SortOption | "">("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status>("idle");

  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    // Filter dropdown data is secondary to the search results themselves — a failure here
    // shouldn't take down the page, just leave those filters showing no options.
    fetchAllCollections()
      .then(setCollections)
      .catch((error) => console.error("[search-view] failed to load collections:", error));
    fetch("/api/tags")
      .then((res) => (res.ok ? res.json() : { tags: [] }))
      .then((body) => setTags(body.tags ?? []))
      .catch((error) => console.error("[search-view] failed to load tags:", error));
  }, []);

  // Render-time only (the "no results"/"clear filters" UI reads this) — runSearch below builds
  // its own copy from the same primitives so it isn't a stale closure captured at callback
  // creation time.
  const filters = {
    q: q.trim() || undefined,
    type: type || undefined,
    collectionId: collectionId || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    favorite,
    archived,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sort: sort || undefined,
    page,
  };

  const runSearch = useCallback(
    async (signal: AbortSignal) => {
      setStatus("loading");
      const params = buildItemsSearchParams({
        q: q.trim() || undefined,
        type: type || undefined,
        collectionId: collectionId || undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        favorite,
        archived,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        sort: sort || undefined,
        page,
      });
      params.set("limit", String(PAGE_LIMIT));

      try {
        const response = await fetch(`/api/items?${params.toString()}`, { signal });
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const body = await response.json();
        setItems(body.items);
        setTotal(body.total);
        setStatus("loaded");
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setStatus("error");
      }
    },
    [q, type, collectionId, tagIds, favorite, archived, createdFrom, createdTo, sort, page],
  );

  // Debounced search-as-you-type — re-runs on any filter/sort/page change, not just typing.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => runSearch(controller.signal), RESULTS_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [runSearch]);

  // Resets to page 1 whenever the query or a filter changes underneath an existing page number —
  // otherwise a narrower filter could leave the view stuck past its own last page.
  const filterKey = JSON.stringify({ q, type, collectionId, tagIds, favorite, archived, createdFrom, createdTo, sort });
  const previousFilterKey = useRef(filterKey);
  useEffect(() => {
    if (previousFilterKey.current !== filterKey) {
      previousFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey]);

  const recordRecentSearch = useCallback((query: string) => {
    if (!query.trim()) return;
    fetch("/api/recent-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim() }),
    }).catch((error) => {
      // Best-effort — losing a single recent-search entry isn't worth surfacing an error to the
      // user for, but a persistent failure should still be visible in logs.
      console.error("[search-view] failed to record recent search:", error);
    });
  }, []);

  // Settle-timer recording, distinct from the live-results debounce above.
  useEffect(() => {
    if (!q.trim()) return;
    const timer = setTimeout(() => recordRecentSearch(q), RECENT_SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [q, recordRecentSearch]);

  function loadRecentSearches() {
    fetch("/api/recent-searches")
      .then((res) => (res.ok ? res.json() : { searches: [] }))
      .then((body) => setRecentSearches(body.searches ?? []));
  }

  function handleFocus() {
    if (!q.trim()) {
      loadRecentSearches();
      setShowSuggestions(true);
    }
  }

  function handleSuggestionClick(query: string) {
    setQ(query);
    setShowSuggestions(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && q.trim()) {
      recordRecentSearch(q);
      setShowSuggestions(false);
    }
    if (event.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  function toggleTag(tagId: string) {
    setTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  }

  function clearFilters() {
    setType("");
    setCollectionId("");
    setTagIds([]);
    setFavorite(undefined);
    setArchived(undefined);
    setCreatedFrom("");
    setCreatedTo("");
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <Label htmlFor="search-input" className="sr-only">
          Search
        </Label>
        <Input
          id="search-input"
          placeholder="Search your notes…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim()) setShowSuggestions(false);
          }}
          onFocus={handleFocus}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {showSuggestions && recentSearches.length > 0 && (
          <ul className="bg-popover absolute z-10 mt-1 w-full rounded-lg border border-border shadow-md">
            {recentSearches.map((query) => (
              <li key={query}>
                <button
                  type="button"
                  className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSuggestionClick(query)}
                >
                  {query}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-type">Type</Label>
          <select
            id="filter-type"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {KNOWLEDGE_ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-collection">Collection</Label>
          <select
            id="filter-collection"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
          >
            <option value="">All collections</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-favorite">Favorite</Label>
          <select
            id="filter-favorite"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={favorite === undefined ? "" : String(favorite)}
            onChange={(e) => setFavorite(e.target.value === "" ? undefined : e.target.value === "true")}
          >
            <option value="">Any</option>
            <option value="true">Favorited only</option>
            <option value="false">Not favorited</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-archived">Archived</Label>
          <select
            id="filter-archived"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={archived === undefined ? "" : String(archived)}
            onChange={(e) => setArchived(e.target.value === "" ? undefined : e.target.value === "true")}
          >
            <option value="">Any (includes archived)</option>
            <option value="true">Archived only</option>
            <option value="false">Not archived</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-created-from">Created from</Label>
          <Input
            id="filter-created-from"
            type="date"
            className="h-9 w-36"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-created-to">Created to</Label>
          <Input
            id="filter-created-to"
            type="date"
            className="h-9 w-36"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-sort">Sort</Label>
          <select
            id="filter-sort"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
          >
            <option value="">{q.trim() ? "Relevance (default)" : "Recently updated (default)"}</option>
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option} disabled={option === "relevance" && !q.trim()}>
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters({ type: filters.type, collectionId: filters.collectionId, tagIds: filters.tagIds, favorite, archived, createdFrom: filters.createdFrom, createdTo: filters.createdTo }) && (
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              aria-pressed={tagIds.includes(tag.id)}
              onClick={() => toggleTag(tag.id)}
              className={`rounded-full px-2 py-0.5 text-xs ${
                tagIds.includes(tag.id)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Something went wrong searching.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              const controller = new AbortController();
              runSearch(controller.signal);
            }}
          >
            Retry
          </button>
        </p>
      )}

      {status === "loading" && <p className="text-muted-foreground text-sm">Searching…</p>}

      {status === "loaded" && items.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {(() => {
            const filtersOnly = hasActiveFilters({ ...filters, q: undefined });
            if (filtersOnly) return "No results — try removing some filters.";
            if (filters.q) return `No results for "${filters.q}".`;
            return "No items yet — anything you create will show up here.";
          })()}
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-3">
              <Link href={`/items/${item.id}`} className="font-medium hover:underline">
                {item.is_favorite && <span aria-label="Favorited">★ </span>}
                {item.title || "Untitled Note"}
              </Link>
              <div className="text-muted-foreground mt-0.5 flex gap-2 text-xs">
                <span>{TYPE_LABELS[item.type] ?? item.type}</span>
                {item.is_archived && <span>Archived</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_LIMIT && (
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
