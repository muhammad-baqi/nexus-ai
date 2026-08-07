import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

type ResolvedValue = { data: unknown; error: unknown; count?: number };
let result: ResolvedValue;

function createQueryBuilder() {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "range"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: ResolvedValue) => void) => resolve(result);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => createQueryBuilder(),
  }),
}));

import { GET } from "./route";

function requestFor(query = "") {
  return new NextRequest(`http://localhost:3000/api/activity${query}`);
}

describe("GET /api/activity", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    result = { data: [], error: null, count: 0 };
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(requestFor());
    expect(response.status).toBe(401);
  });

  it("returns rows most-recent-first with pagination metadata", async () => {
    result = {
      data: [
        { id: "a1", action: "created", knowledge_item_id: "item-1", collection_id: null, created_at: "t", knowledge_items: { id: "item-1", title: "Trip" }, collections: null },
      ],
      error: null,
      count: 1,
    };

    const response = await GET(requestFor());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activity).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
  });

  it("returns 500 and logs on a query failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    result = { data: null, error: { message: "boom" } };

    const response = await GET(requestFor());

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
