import { after, NextResponse, type NextRequest } from "next/server";

import { runExportJob } from "@/lib/settings/jobs/run-export-job";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { createExportJobSchema } from "@/lib/validation/settings";

// Enqueues a background export job (API_Design.md: "POST /api/settings/export — enqueue
// background export job"). Never blocks on the actual export work (CLAUDE.md rule 5) — the row is
// inserted 'pending', the response returns immediately, and runExportJob does the real work via
// after(), closing over this same already-authenticated `supabase` client (same pattern as the
// bookmark-metadata and PDF-extraction background jobs).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = createExportJobSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid export format." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data: job, error } = await supabase
    .from("export_jobs")
    .insert({ owner_id: user.id, format: result.data.format })
    .select("id, format, status, created_at")
    .single();

  if (error) {
    console.error("[api/settings/export] job create failed:", error);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong starting your export." } },
      { status: 500 },
    );
  }

  after(() => runExportJob(supabase, job.id, user.id, result.data.format));

  return NextResponse.json(job, { status: 202 });
}
