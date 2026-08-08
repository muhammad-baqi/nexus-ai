"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

// Same poll-while-pending pattern/interval as components/bookmarks/bookmark-view.tsx's metadata
// poll — no WebSocket/SSE mechanism exists elsewhere in this codebase, and a short poll converges
// quickly for a personal-knowledge-hub-scale export.
const POLL_INTERVAL_MS = 2000;

// A failed poll request (transient network blip) is retried up to this many times before the
// job's row surfaces an inline error — previously a single failed request permanently froze
// that job at "Generating…" forever, with no retry and no visible error.
const MAX_POLL_FAILURES = 5;

const FORMATS = [
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "zip", label: "ZIP (JSON + files)" },
] as const;

type ExportFormat = (typeof FORMATS)[number]["value"];
type JobStatus = "pending" | "processing" | "success" | "failed";

type ExportJob = {
  id: string;
  format: ExportFormat;
  status: JobStatus;
  error_message: string | null;
  download_url: string | null;
  pollFailed?: boolean;
};

export function DataExportForm() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [startError, setStartError] = useState<string | undefined>();
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pollFailureCounts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  function schedulePoll(jobId: string) {
    const timer = setTimeout(() => poll(jobId), POLL_INTERVAL_MS);
    pollTimers.current.set(jobId, timer);
  }

  async function poll(jobId: string) {
    const response = await fetch(`/api/settings/export/${jobId}`);
    if (!response.ok) {
      const failures = (pollFailureCounts.current.get(jobId) ?? 0) + 1;
      pollFailureCounts.current.set(jobId, failures);
      if (failures < MAX_POLL_FAILURES) {
        schedulePoll(jobId);
      } else {
        setJobs((prev) =>
          prev.map((entry) => (entry.id === jobId ? { ...entry, pollFailed: true } : entry))
        );
      }
      return;
    }

    pollFailureCounts.current.delete(jobId);
    const job: ExportJob = await response.json();
    setJobs((prev) => prev.map((entry) => (entry.id === jobId ? { ...job, pollFailed: false } : entry)));

    if (job.status === "pending" || job.status === "processing") {
      schedulePoll(jobId);
    }
  }

  function retryPoll(jobId: string) {
    pollFailureCounts.current.delete(jobId);
    setJobs((prev) => prev.map((entry) => (entry.id === jobId ? { ...entry, pollFailed: false } : entry)));
    poll(jobId);
  }

  async function startExport(format: ExportFormat) {
    setStartError(undefined);

    const response = await fetch("/api/settings/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setStartError(body?.error?.message ?? "Something went wrong starting your export.");
      return;
    }

    const job: ExportJob = await response.json();
    setJobs((prev) => [{ ...job, error_message: null, download_url: null }, ...prev]);
    schedulePoll(job.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Data Export</h2>
      <div className="flex flex-wrap gap-2">
        {FORMATS.map((format) => (
          <Button key={format.value} type="button" variant="outline" size="sm" onClick={() => startExport(format.value)}>
            Export as {format.label}
          </Button>
        ))}
      </div>
      {startError && (
        <p className="text-destructive text-sm" role="alert">
          {startError}
        </p>
      )}

      {jobs.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
              <span>{FORMATS.find((f) => f.value === job.format)?.label ?? job.format}</span>
              {(job.status === "pending" || job.status === "processing") &&
                (job.pollFailed ? (
                  <span className="flex items-center gap-2">
                    <span className="text-destructive" role="alert">
                      Couldn&apos;t check export status.
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => retryPoll(job.id)}>
                      Retry
                    </Button>
                  </span>
                ) : (
                  <span className="text-muted-foreground" role="status">
                    Generating…
                  </span>
                ))}
              {job.status === "success" && job.download_url && (
                <a href={job.download_url} className="underline">
                  Download
                </a>
              )}
              {job.status === "failed" && (
                <span className="flex items-center gap-2">
                  <span className="text-destructive" role="alert">
                    {job.error_message ?? "Export failed."}
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => startExport(job.format)}>
                    Retry
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
