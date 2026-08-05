import type { createClient } from "@/lib/supabase/server";
import { FILES_STORAGE_BUCKET } from "@/lib/files/constants";
import { isSniffedCategoryConsistent, sniffContentCategory } from "@/lib/files/sniff-content";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const SNIFF_BYTE_RANGE = "bytes=0-4095";
const SIGNED_URL_TTL_SECONDS = 60;

// A Range-request response reports the object's real total size regardless of how much of it was
// actually fetched — either via `Content-Range: bytes 0-4095/<total>` (206, the common case for
// anything over the requested range), or `Content-Length` on a 200 (the whole object was smaller
// than the requested range, so Storage returned it in full instead). Returns null if neither is
// present/parseable — callers fall back to the client-declared size rather than treating that as
// a hard failure.
function parseActualSizeBytes(response: Response): number | null {
  const contentRange = response.headers.get("content-range");
  const totalFromRange = contentRange?.match(/\/(\d+)$/)?.[1];
  if (totalFromRange) return Number(totalFromRange);

  const contentLength = response.headers.get("content-length");
  if (response.status === 200 && contentLength) return Number(contentLength);

  return null;
}

// Files upload directly from the browser to Storage (same architecture as avatars —
// components/settings/profile-form.tsx — rather than routing large binary payloads through this
// server, which is the better fit for PDFs up to 50MB). That means this server never sees the
// raw bytes as they arrive, so content-based verification (File_Uploads.md's Security
// Requirements) has to happen *after* the upload, by fetching a small prefix back from Storage
// and sniffing it — not trusting the client-declared Content-Type used during upload. Only reads
// the first 4KB (via a Range request), not the whole object, regardless of the file's real size.
// Also reports the object's *actual* size (from the Range response's own headers) so the caller
// can authoritatively re-check the size cap — validateFileUpload alone only ever saw whatever
// size_bytes the client claimed in its POST /api/items body, which a client could simply lie
// about to slide under a per-type cap while the real (larger) bytes already sit in Storage.
export async function verifyUploadedFileContent(
  supabase: SupabaseClient,
  storagePath: string,
  declaredMimeType: string,
): Promise<{ ok: true; actualSizeBytes: number | null } | { ok: false; reason: string }> {
  const { data: signed, error: signError } = await supabase.storage
    .from(FILES_STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    console.error("[verifyUploadedFileContent] createSignedUrl failed:", signError);
    return { ok: false, reason: "Something went wrong verifying the uploaded file." };
  }

  try {
    const response = await fetch(signed.signedUrl, { headers: { Range: SNIFF_BYTE_RANGE } });
    if (!response.ok) {
      console.error("[verifyUploadedFileContent] fetching uploaded bytes failed:", response.status);
      return { ok: false, reason: "Something went wrong verifying the uploaded file." };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const category = sniffContentCategory(bytes);
    if (!isSniffedCategoryConsistent(declaredMimeType, category)) {
      return { ok: false, reason: "This file's content doesn't match its declared type." };
    }

    return { ok: true, actualSizeBytes: parseActualSizeBytes(response) };
  } catch (error) {
    console.error("[verifyUploadedFileContent] verification failed:", error);
    return { ok: false, reason: "Something went wrong verifying the uploaded file." };
  }
}

// Best-effort cleanup of a Storage object that shouldn't be kept — a failed content check, or a
// DB write that failed after the upload already succeeded. Never throws (CLAUDE.md rule 7):
// there's nothing more this request can do about it beyond logging for a future periodic sweep
// (File_Uploads.md's Error States section anticipates orphaned objects needing exactly that).
export async function deleteUploadedObject(supabase: SupabaseClient, storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(FILES_STORAGE_BUCKET).remove([storagePath]);
  if (error) {
    console.error("[deleteUploadedObject] cleanup failed:", storagePath, error);
  }
}
