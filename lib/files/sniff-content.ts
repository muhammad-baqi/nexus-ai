// Content-based file-type sniffing — File_Uploads.md's Security Requirements: "correct MIME type
// matching the file's actual content, not just its extension." Hand-rolled magic-byte signatures
// rather than a dependency: unlike HTML parsing (cheerio, added for the bookmarks feature — a
// real parser is genuinely needed for malformed-HTML tolerance), this only needs to recognize a
// handful of well-known binary headers, which is small, deterministic, and fully unit-testable
// without one.

export type SniffedCategory =
  | "pdf"
  | "image-png"
  | "image-jpeg"
  | "image-gif"
  | "image-webp"
  | "zip-container" // docx/xlsx/odt/ods/zip all share the ZIP outer format
  | "ole-compound" // legacy .doc/.xls
  | "text" // no reliable magic number — "looks like text, not binary"
  | "unknown";

function bytesStartWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

// `bytes` should be at least the first ~4KB of the file — every signature checked here appears
// well within that, and callers only need to fetch a small prefix (lib/files/verify-upload.ts),
// not the whole object.
export function sniffContentCategory(bytes: Uint8Array): SniffedCategory {
  if (asciiAt(bytes, 0, "%PDF-")) return "pdf";
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image-png";
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "image-jpeg";
  if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) return "image-gif";
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) return "image-webp";
  if (bytesStartWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || bytesStartWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    return "zip-container";
  }
  if (bytesStartWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole-compound";

  // "Looks like text": no null bytes and no control characters outside whitespace in the sampled
  // prefix — catches a disguised binary (e.g. a renamed executable) masquerading as .txt/.csv/
  // .md/.json, without needing a full encoding-detection library for genuinely diverse UTF-8
  // content.
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  const looksLikeText = sample.every((byte) => byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte !== 0x7f));
  if (looksLikeText) return "text";

  return "unknown";
}

// Maps a declared MIME type to the set of sniffed categories that are consistent with it. A
// mismatch means the uploaded bytes don't actually look like what the client claimed — reject
// and clean up the Storage object rather than trusting the declared type.
export function isSniffedCategoryConsistent(mimeType: string, category: SniffedCategory): boolean {
  switch (mimeType) {
    case "application/pdf":
      return category === "pdf";
    case "image/png":
      return category === "image-png";
    case "image/jpeg":
      return category === "image-jpeg";
    case "image/gif":
      return category === "image-gif";
    case "image/webp":
      return category === "image-webp";
    case "application/zip":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.oasis.opendocument.text":
    case "application/vnd.oasis.opendocument.spreadsheet":
      return category === "zip-container";
    case "application/msword":
    case "application/vnd.ms-excel":
      return category === "ole-compound";
    case "text/plain":
    case "text/csv":
    case "text/markdown":
    case "application/json":
      return category === "text";
    default:
      return false;
  }
}
