import { NextResponse, type NextRequest } from "next/server";

import { signExportUrl } from "@/lib/settings/signed-export-url";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { dataJobIdSchema } from "@/lib/validation/settings";

type RouteParams = { params: Promise<{ jobId: string }> };

// API_Design.md: "GET /api/settings/export/:jobId — poll job status/download link". Polled by
// components/settings/data-export-form.tsx while the job is pending/processing.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;
  if (!dataJobIdSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "Invalid job id." } }, { status: 400 });
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // Scoped to owner_id explicitly (not just relying on RLS) so a guessed/another-user's job id
  // 404s rather than leaking whether it exists (same "never leak existence" convention as every
  // other :id route in this app).
  const { data: job, error } = await supabase
    .from("export_jobs")
    .select("id, format, status, error_message, created_at, completed_at, storage_path")
    .eq("id", jobId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[api/settings/export/:jobId] fetch failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong checking your export." } },
      { status: 500 },
    );
  }

  if (!job) {
    return NextResponse.json({ error: { code: "not_found", message: "Export job not found." } }, { status: 404 });
  }

  const download_url = job.status === "success" && job.storage_path
    ? await signExportUrl(supabase, job.storage_path)
    : null;

  return NextResponse.json({
    id: job.id,
    format: job.format,
    status: job.status,
    error_message: job.error_message,
    created_at: job.created_at,
    completed_at: job.completed_at,
    download_url,
  });
}
