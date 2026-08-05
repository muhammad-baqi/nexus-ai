import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => {
  const lookup = (...args: unknown[]) => lookupMock(...args);
  return { lookup, default: { lookup } };
});

const { safeFetch, readBodyWithLimit, UnsafeFetchTargetError } = await import("./safe-fetch");

function jsonResponse(init: { status?: number; url?: string; headers?: Record<string, string> } = {}) {
  const { status = 200, headers = {} } = init;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

describe("safeFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    lookupMock.mockReset();
  });

  it("rejects a non-http(s) protocol before ever calling fetch", async () => {
    await expect(safeFetch("file:///etc/passwd", { timeoutMs: 1000 })).rejects.toThrow(
      UnsafeFetchTargetError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["10.0.0.5", "private 10.0.0.0/8"],
    ["172.16.0.1", "private 172.16.0.0/12"],
    ["192.168.1.1", "private 192.168.0.0/16"],
    ["169.254.169.254", "link-local / cloud metadata"],
    ["0.0.0.0", "this-network"],
  ])("rejects a literal blocked IPv4 address %s (%s)", async (ip) => {
    await expect(safeFetch(`http://${ip}/`, { timeoutMs: 1000 })).rejects.toThrow(
      UnsafeFetchTargetError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects the IPv6 loopback address", async () => {
    await expect(safeFetch("http://[::1]/", { timeoutMs: 1000 })).rejects.toThrow(
      UnsafeFetchTargetError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows a literal public IPv4 address", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    const { response, finalUrl } = await safeFetch("http://93.184.216.34/", { timeoutMs: 1000 });
    expect(response.status).toBe(200);
    expect(finalUrl).toBe("http://93.184.216.34/");
  });

  it("resolves a hostname via DNS and rejects when it points at a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(
      safeFetch("http://metadata.internal.example/", { timeoutMs: 1000 }),
    ).rejects.toThrow(UnsafeFetchTargetError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows a hostname that resolves to a public address", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    const { response } = await safeFetch("https://example.com/", { timeoutMs: 1000 });
    expect(response.status).toBe(200);
  });

  it("follows a redirect to a public host", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ status: 302, headers: { location: "https://example.com/final" } }),
      )
      .mockResolvedValueOnce(jsonResponse());

    const { response, finalUrl } = await safeFetch("https://example.com/start", { timeoutMs: 1000 });
    expect(response.status).toBe(200);
    expect(finalUrl).toBe("https://example.com/final");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a redirect whose target resolves to a private address, without following it", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ status: 302, headers: { location: "http://169.254.169.254/secret" } }),
    );

    await expect(
      safeFetch("https://example.com/start", { timeoutMs: 1000 }),
    ).rejects.toThrow(UnsafeFetchTargetError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after too many redirects", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ status: 302, headers: { location: "https://example.com/next" } })),
    );

    await expect(
      safeFetch("https://example.com/start", { timeoutMs: 1000 }),
    ).rejects.toThrow(UnsafeFetchTargetError);
  });

  it("rejects a hostname that fails to resolve at all", async () => {
    lookupMock.mockResolvedValue([]);
    await expect(safeFetch("https://nowhere.invalid/", { timeoutMs: 1000 })).rejects.toThrow(
      UnsafeFetchTargetError,
    );
  });
});

describe("readBodyWithLimit", () => {
  function streamResponse(chunks: string[], headers: Record<string, string> = {}) {
    const encoder = new TextEncoder();
    let index = 0;
    const reader = {
      read: () => {
        if (index >= chunks.length) return Promise.resolve({ done: true, value: undefined });
        const value = encoder.encode(chunks[index]);
        index += 1;
        return Promise.resolve({ done: false, value });
      },
      releaseLock: () => {},
    };
    return {
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      body: { getReader: () => reader },
      text: () => Promise.resolve(chunks.join("")),
    } as unknown as Response;
  }

  it("rejects up front based on a too-large Content-Length header, without reading the body", async () => {
    const response = streamResponse(["ignored"], { "content-length": String(10 * 1024 * 1024) });
    await expect(readBodyWithLimit(response, 5 * 1024 * 1024)).rejects.toThrow(
      UnsafeFetchTargetError,
    );
  });

  it("reads and concatenates a body under the limit", async () => {
    const response = streamResponse(["<html>", "</html>"]);
    await expect(readBodyWithLimit(response, 1024)).resolves.toBe("<html></html>");
  });

  it("cancels and rejects once a streamed body exceeds the limit, even with no Content-Length", async () => {
    const response = streamResponse(["a".repeat(10), "b".repeat(10)]);
    await expect(readBodyWithLimit(response, 15)).rejects.toThrow(UnsafeFetchTargetError);
  });
});
