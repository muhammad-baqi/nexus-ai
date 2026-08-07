import { randomBytes } from "node:crypto";

// Unguessable per Database_Schema.md's share_links.token comment — 24 random bytes, base64url
// (URL-safe, no padding) gives 32 characters with 192 bits of entropy, plenty for a public link
// token that's the only thing standing between a viewer and the shared item.
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}
