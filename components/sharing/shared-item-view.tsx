"use client";

import { useEffect, useState } from "react";

import { CodeEditor } from "@/components/code-snippets/code-editor";
import { NoteBody } from "@/components/notes/note-body";

type SharedItem = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  website_metadata?: { url: string; domain: string | null; og_image_url: string | null; favicon_url: string | null } | null;
  file_asset?: { original_filename: string; mime_type: string; size_bytes: number; download_url: string | null } | null;
  code_snippet_data?: { language: string; code_content: string } | null;
};

type Props = {
  token: string;
};

// The public, unauthenticated, read-only counterpart to each item-view component
// (NoteEditor/BookmarkView/FileItemView/CodeSnippetView) — same type-specific rendering, none of
// the edit/favorite/archive/trash/tags/reminders/share chrome those carry.
export function SharedItemView({ token }: Props) {
  const [item, setItem] = useState<SharedItem | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/share/${token}`)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setError(body?.error?.message ?? "This link is invalid or has been revoked.");
          return;
        }
        setItem(await response.json());
      })
      .catch(() => {
        if (!cancelled) setError("Something went wrong loading this item.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {error}
      </p>
    );
  }

  if (!item) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{item.title}</h1>

      {item.type === "note" && <NoteBody content={item.description ?? ""} />}

      {item.type === "website" && item.website_metadata && (
        <div className="flex flex-col gap-2">
          {item.website_metadata.og_image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary third-party image URL, same as bookmark-view.tsx
            <img src={item.website_metadata.og_image_url} alt="" className="max-w-full rounded-md" />
          )}
          {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}
          <a href={item.website_metadata.url} target="_blank" rel="noreferrer noopener" className="text-sm underline">
            {item.website_metadata.domain ?? item.website_metadata.url}
          </a>
        </div>
      )}

      {(item.type === "pdf" || item.type === "image" || item.type === "file") && item.file_asset && (
        <div className="flex flex-col gap-2">
          {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}
          {item.file_asset.download_url && item.type === "pdf" && (
            <iframe src={item.file_asset.download_url} title={item.title} className="h-[600px] w-full rounded-md border" />
          )}
          {item.file_asset.download_url && item.type === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary signed Storage URL
            <img src={item.file_asset.download_url} alt={item.title} className="max-w-full rounded-md" />
          )}
          {item.file_asset.download_url && (
            <a href={item.file_asset.download_url} className="text-sm underline">
              Download {item.file_asset.original_filename}
            </a>
          )}
        </div>
      )}

      {item.type === "code_snippet" && item.code_snippet_data && (
        <div className="flex flex-col gap-2">
          {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}
          <CodeEditor value={item.code_snippet_data.code_content} language={item.code_snippet_data.language} readOnly />
        </div>
      )}
    </div>
  );
}
