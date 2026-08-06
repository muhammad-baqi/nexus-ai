import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { dataJobIdSchema } from "@/lib/validation/settings";

type RouteParams = { params: Promise<{ jobId: string }> };

// API_Design.md: "GET /api/settings/import/:jobId — poll job status/summary". Polled by
// components/settings/data-import-form.tsx while the job is pending/processing.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;
  if (!dataJobIdSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "Invalid job id." } }, { status: 400 });
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // Scoped to owner_id explicitly, same "never leak existence of another user's job" convention
  // as the export job GET route.
  const { data: job, error } = await supabase
    .from("import_jobs")
    .select("id, source_format, status, error_message, created_count, skipped_count, skip_reasons, created_at, completed_at")
    .eq("id", jobId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[api/settings/import/:jobId] fetch failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong checking your import." } },
      { status: 500 },
    );
  }

  if (!job) {
    return NextResponse.json({ error: { code: "not_found", message: "Import job not found." } }, { status: 404 });
  }

  return NextResponse.json(job);
}
