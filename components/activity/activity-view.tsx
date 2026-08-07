"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatRelativeTime } from "@/lib/format/relative-time";

type ActivityRow = {
  id: string;
  action: "created" | "edited" | "deleted" | "restored" | "shared";
  created_at: string;
  knowledge_items: { id: string; title: string } | null;
  collections: { id: string; name: string } | null;
};

type Status = "loading" | "loaded" | "error";

const ACTION_LABEL: Record<ActivityRow["action"], string> = {
  created: "Created",
  edited: "Edited",
  deleted: "Deleted",
  restored: "Restored",
  shared: "Shared",
};

// A simple per-account timeline (build-order-complete.md #27) — fetch-on-mount, same shape as
// TrashView/TagManagementView.
export function ActivityView() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    const response = await fetch("/api/activity");
    if (!response.ok) {
      setStatus("error");
      return;
    }
    const body: { activity: ActivityRow[] } = await response.json();
    setRows(body.activity);
    setStatus("loaded");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Activity</h1>

      {status === "loading" && <p className="text-muted-foreground text-sm">Loading…</p>}
      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Couldn&apos;t load activity.{" "}
          <button type="button" className="underline" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {status === "loaded" && rows.length === 0 && (
        <p className="text-muted-foreground text-sm">No activity yet.</p>
      )}

      {status === "loaded" && rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {ACTION_LABEL[row.action]}{" "}
                {row.knowledge_items ? (
                  <Link href={`/items/${row.knowledge_items.id}`} className="underline">
                    {row.knowledge_items.title}
                  </Link>
                ) : row.collections ? (
                  <Link href={`/collections/${row.collections.id}`} className="underline">
                    {row.collections.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">(no longer available)</span>
                )}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatRelativeTime(row.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
