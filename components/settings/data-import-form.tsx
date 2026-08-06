"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { DATA_JOBS_STORAGE_BUCKET, IMPORT_SOURCE_MAX_BYTES } from "@/lib/settings/constants";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 2000;

type SourceFormat = "json" | "markdown";
type JobStatus = "pending" | "processing" | "success" | "failed";

type ImportJob = {
  id: string;
  status: JobStatus;
  error_message: string | null;
  created_count: number;
  skipped_count: number;
  skip_reasons: string[];
};

function sourceFormatFor(file: File): SourceFormat | null {
  if (file.type === "application/json" || file.name.endsWith(".json")) return "json";
  if (file.type === "application/zip" || file.name.endsWith(".zip")) return "markdown";
  return null;
}

// Accepts a previously exported JSON bundle or Markdown-ZIP (Settings.md's Import section — the
// binary-inclusive 'zip' export format isn't a supported import source, see
// lib/settings/jobs/run-import-job.ts's comment on why). Same direct-to-Storage-then-notify-API
// upload shape as components/files/upload-file-form.tsx, then polls the same way
// data-export-form.tsx polls its own jobs.
export function DataImportForm() {
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isUploading, setIsUploading] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  async function poll(jobId: string) {
    const response = await fetch(`/api/settings/import/${jobId}`);
    if (!response.ok) return;

    const latest: ImportJob = await response.json();
    setJob(latest);

    if (latest.status === "pending" || latest.status === "processing") {
      pollTimer.current = setTimeout(() => poll(jobId), POLL_INTERVAL_MS);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(undefined);
    setJob(null);

    const sourceFormat = sourceFormatFor(file);
    if (!sourceFormat) {
      setError("Please choose a .json or .zip export file.");
      return;
    }
    if (file.size > IMPORT_SOURCE_MAX_BYTES) {
      setError(`This file is too large — the limit is ${Math.round(IMPORT_SOURCE_MAX_BYTES / (1024 * 1024))}MB.`);
      return;
    }

    setIsUploading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setIsUploading(false);
      setError("You must be logged in.");
      return;
    }

    const extension = sourceFormat === "json" ? "json" : "zip";
    const storagePath = `${user.id}/imports/${crypto.randomUUID()}/source.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(DATA_JOBS_STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type });

    if (uploadError) {
      console.error("[DataImportForm] Storage upload failed:", uploadError);
      setIsUploading(false);
      setError("Something went wrong uploading this file.");
      return;
    }

    const response = await fetch("/api/settings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storage_path: storagePath, source_format: sourceFormat }),
    });

    setIsUploading(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Something went wrong starting your import.");
      return;
    }

    const created: { id: string; status: JobStatus } = await response.json();
    setJob({ id: created.id, status: created.status, error_message: null, created_count: 0, skipped_count: 0, skip_reasons: [] });
    pollTimer.current = setTimeout(() => poll(created.id), POLL_INTERVAL_MS);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Data Import</h2>
      <label className="flex flex-col gap-1.5 text-sm">
        <span>Import a previous export (JSON or Markdown ZIP)</span>
        <input
          type="file"
          accept=".json,.zip,application/json,application/zip"
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </label>

      {isUploading && (
        <p className="text-muted-foreground text-sm" role="status">
          Uploading…
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {job && (job.status === "pending" || job.status === "processing") && (
        <p className="text-muted-foreground text-sm" role="status">
          Importing…
        </p>
      )}
      {job?.status === "failed" && (
        <p className="text-destructive text-sm" role="alert">
          {job.error_message ?? "Import failed."}
        </p>
      )}
      {job?.status === "success" && (
        <div className="text-sm">
          <p>
            Imported {job.created_count} item{job.created_count === 1 ? "" : "s"}
            {job.skipped_count > 0 && `, skipped ${job.skipped_count}`}.
          </p>
          {job.skip_reasons.length > 0 && (
            <ul className="text-muted-foreground list-disc pl-5">
              {job.skip_reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
