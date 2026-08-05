import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;

// The bookmark metadata job fetches a URL the user typed in, server-side. Without this guard a
// signed-in user could save/retry a bookmark pointing at an internal address (cloud metadata
// endpoints, localhost, RFC1918 ranges) and have the response reflected back into the item's
// title/description/og-image. `fetch` also follows redirects transparently, so a public URL that
// 302s to an internal one would bypass a check on the initial URL alone — this validates every
// hop by following redirects manually instead of letting `fetch` do it.
export class UnsafeFetchTargetError extends Error {}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true; // unspecified / loopback
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedV4) return isBlockedIPv4(mappedV4[1]);
  return false;
}

async function assertHostIsSafe(rawHostname: string): Promise<void> {
  // `new URL(...).hostname` keeps IPv6 literals bracketed (e.g. "[::1]") — net.isIP() and
  // dns.lookup() both expect the bare address.
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
    ? rawHostname.slice(1, -1)
    : rawHostname;
  const literalVersion = isIP(hostname);
  if (literalVersion === 4) {
    if (isBlockedIPv4(hostname)) {
      throw new UnsafeFetchTargetError(`refusing to fetch a private/internal address: ${hostname}`);
    }
    return;
  }
  if (literalVersion === 6) {
    if (isBlockedIPv6(hostname)) {
      throw new UnsafeFetchTargetError(`refusing to fetch a private/internal address: ${hostname}`);
    }
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new UnsafeFetchTargetError(`could not resolve host: ${hostname}`);
  }
  for (const record of records) {
    const blocked = record.family === 4 ? isBlockedIPv4(record.address) : isBlockedIPv6(record.address);
    if (blocked) {
      throw new UnsafeFetchTargetError(`host resolves to a private/internal address: ${hostname}`);
    }
  }
}

// Fetches `initialUrl`, rejecting the request (and any redirect hop) if it targets a private,
// loopback, link-local, or otherwise internal address. Returns the final response along with the
// URL that actually produced it (redirects are followed manually, so `response.url` can't be
// trusted to reflect this).
export async function safeFetch(
  initialUrl: string,
  init: { timeoutMs: number; headers?: Record<string, string> },
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new UnsafeFetchTargetError(`unsupported protocol: ${parsed.protocol}`);
    }
    await assertHostIsSafe(parsed.hostname);

    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs),
      headers: init.headers,
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");
    if (!isRedirect || !location) {
      return { response, finalUrl: currentUrl };
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new UnsafeFetchTargetError("too many redirects");
}

// Reads a response body up to `maxBytes`, rejecting (and cancelling the stream) once exceeded —
// protects against a malicious/misbehaving server streaming an unbounded body under a spoofed
// `Content-Type: text/html` faster than the fetch timeout would otherwise catch it.
export async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new UnsafeFetchTargetError(`response body too large: ${contentLength} bytes`);
  }

  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new UnsafeFetchTargetError(`response body too large: exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf-8");
}
