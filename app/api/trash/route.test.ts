import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

type ResolvedValue = { data: unknown; error: unknown };

let resolved: Record<string, ResolvedValue>;

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "eq", "not", "order"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: ResolvedValue) => void) => {
    resolve(resolved[table] ?? { data: null, error: null });
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => createQueryBuilder(table),
  }),
}));

import { GET } from "./route";

function requestFor() {
  return new NextRequest("http://localhost:3000/api/trash");
}

describe("GET /api/trash", () => {
  beforeEach(() => {
    getUser.mockReset();
    resolved = {};
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor());

    expect(response.status).toBe(401);
  });

  it("returns both trashed items and trashed collections", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    resolved.knowledge_items = { data: [{ id: "item-1", title: "Trip planning" }], error: null };
    resolved.collections = { data: [{ id: "col-1", name: "Old Project" }], error: null };

    const response = await GET(requestFor());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ id: "item-1", title: "Trip planning" }],
      collections: [{ id: "col-1", name: "Old Project" }],
    });
  });

  it("returns 500 and logs when the items query fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    resolved.knowledge_items = { data: null, error: { message: "boom" } };
    resolved.collections = { data: [], error: null };

    const response = await GET(requestFor());

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 and logs when the collections query fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    resolved.knowledge_items = { data: [], error: null };
    resolved.collections = { data: null, error: { message: "boom" } };

    const response = await GET(requestFor());

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
