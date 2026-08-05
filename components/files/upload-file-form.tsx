"use client";

import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { FILES_STORAGE_BUCKET } from "@/lib/files/constants";
import { validateFileUpload } from "@/lib/files/validate-upload";
import { createClient } from "@/lib/supabase/client";

type Props = {
  collectionId: string;
  // Called once per file that finishes saving successfully, so the parent's item list can
  // refresh incrementally as a batch upload progresses rather than waiting for every file.
  onUploaded: () => void;
};

type EntryStatus = "uploading" | "saving" | "success" | "error";

type Entry = {
  id: string;
  name: string;
  status: EntryStatus;
  error?: string;
};

// Storage object paths can't contain "/" within a segment or most control characters — files are
// stored under "{owner_id}/{random-id}/{sanitized-filename}" (the random-id segment already
// guarantees uniqueness, so this only needs to strip characters Storage itself would reject, not
// fully deduplicate).
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200) || "file";
}

// Batch drag-and-drop + file-picker upload for PDFs/Images/general Files
// (File_Uploads.md's Shared Upload Requirements). Files upload directly from the browser to
// Storage (same architecture as avatars — components/settings/profile-form.tsx — the better fit
// for files up to 50MB than routing bytes through a Next.js route handler), then this posts the
// resulting path + declared metadata to POST /api/items, which re-validates everything
// authoritatively and content-sniffs the actual bytes before accepting it. Progress is shown as
// a per-file status label rather than a numeric percentage — File_Uploads.md explicitly allows
// "percentage or spinner for small files," and supabase-js's storage upload doesn't expose
// upload-progress events to build a true percentage from.
export function UploadFileForm({ collectionId, onUploaded }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function updateEntry(id: string, patch: Partial<Entry>) {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setEntries((prev) => [...prev, { id, name: file.name, status: "uploading" }]);

    // Client-side check first for immediate feedback (File_Uploads.md) — the server repeats this
    // exact check (lib/files/validate-upload.ts is shared/isomorphic) as the authoritative one.
    const validation = validateFileUpload({ mimeType: file.type, sizeBytes: file.size });
    if (!validation.valid) {
      updateEntry(id, { status: "error", error: validation.error });
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      updateEntry(id, { status: "error", error: "You must be logged in." });
      return;
    }

    const storagePath = `${user.id}/${crypto.randomUUID()}/${sanitizeFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(FILES_STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type });

    if (uploadError) {
      console.error("[UploadFileForm] Storage upload failed:", uploadError);
      updateEntry(id, { status: "error", error: "Something went wrong uploading this file." });
      return;
    }

    updateEntry(id, { status: "saving" });

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: validation.type,
        collection_id: collectionId,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      updateEntry(id, {
        status: "error",
        error: body?.error?.message ?? "Something went wrong saving this file.",
      });
      return;
    }

    updateEntry(id, { status: "success" });
    onUploaded();
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setIsOpen(true);
    await Promise.all(Array.from(fileList).map(uploadOne));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
        Upload Files
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
          isDragging ? "border-primary bg-muted" : "border-border"
        }`}
      >
        Drag and drop files here, or click to choose files
        <input
          ref={inputRef}
          type="file"
          multiple
          aria-label="Choose files to upload"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {entries.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{entry.name}</span>
              {entry.status === "error" ? (
                <span className="text-destructive shrink-0" role="alert">
                  {entry.error}
                </span>
              ) : (
                <span className="text-muted-foreground shrink-0">
                  {entry.status === "uploading" && "Uploading…"}
                  {entry.status === "saving" && "Saving…"}
                  {entry.status === "success" && "Done"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          setIsOpen(false);
          setEntries([]);
        }}
      >
        Close
      </Button>
    </div>
  );
}
