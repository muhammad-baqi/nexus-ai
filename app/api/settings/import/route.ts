import { after, NextResponse, type NextRequest } from "next/server";

import { runImportJob } from "@/lib/settings/jobs/run-import-job";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { createImportJobSchema } from "@/lib/validation/settings";

// The import source file is already uploaded direct-to-Storage by the client (same
// direct-to-Storage-then-notify-API pattern as avatars/file uploads) by the time this arrives —
// enqueues the background import job (API_Design.md: "POST /api/settings/import — enqueue
// background import job").
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = createImportJobSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid import request." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { storage_path, source_format } = result.data;

  // The upload itself already went through Storage RLS (data_jobs_owner_insert,
  // 009_settings_data_jobs.sql), which only lets the caller write under their own
  // "{owner_id}/..." prefix — this is a defense-in-depth check that the path a client claims to
  // have uploaded to is actually theirs, same pattern as POST /api/items's file-upload path.
  if (!storage_path.startsWith(`${user.id}/imports/`)) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid storage path." } },
      { status: 400 },
    );
  }

  const { data: job, error } = await supabase
    .from("import_jobs")
    .insert({ owner_id: user.id, source_format, source_storage_path: storage_path })
    .select("id, source_format, status, created_at")
    .single();

  if (error) {
    console.error("[api/settings/import] job create failed:", error);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong starting your import." } },
      { status: 500 },
    );
  }

  after(() => runImportJob(supabase, job.id, user.id, source_format, storage_path));

  return NextResponse.json(job, { status: 202 });
}
