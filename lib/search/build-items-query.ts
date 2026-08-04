export type ItemsSearchFilters = {
  q?: string;
  type?: string;
  collectionId?: string;
  tagIds?: string[];
  favorite?: boolean;
  archived?: boolean;
  createdFrom?: string;
  createdTo?: string;
  sort?: string;
  page?: number;
};

// Pulled out of the search view so the "what does the current filter state turn into a
// querystring" logic is independently testable without rendering React.
export function buildItemsSearchParams(filters: ItemsSearchFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.collectionId) params.set("collection_id", filters.collectionId);
  for (const tagId of filters.tagIds ?? []) params.append("tag", tagId);
  if (filters.favorite !== undefined) params.set("favorite", String(filters.favorite));
  if (filters.archived !== undefined) params.set("archived", String(filters.archived));
  if (filters.createdFrom) params.set("created_from", filters.createdFrom);
  if (filters.createdTo) params.set("created_to", filters.createdTo);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));

  return params;
}

export function hasActiveFilters(filters: ItemsSearchFilters): boolean {
  return Boolean(
    filters.q ||
      filters.type ||
      filters.collectionId ||
      (filters.tagIds && filters.tagIds.length > 0) ||
      filters.favorite !== undefined ||
      filters.archived !== undefined ||
      filters.createdFrom ||
      filters.createdTo,
  );
}
