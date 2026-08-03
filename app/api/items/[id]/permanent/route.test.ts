import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

let resolvedValue: ResolvedValue;

function createQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const chainable = ["delete", "eq", "not", "select"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => resolvedValue);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => createQueryBuilder(),
  }),
}));

import { DELETE } from "./route";

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/permanent`, {
    method: "DELETE",
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("DELETE /api/items/:id/permanent", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    resolvedValue = { data: null, error: null };
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await DELETE(requestFor(), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the item isn't currently trashed, isn't owned, or doesn't exist", async () => {
    resolvedValue = { data: null, error: { code: "PGRST116" } };

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("This item isn't in Trash.");
  });

  it("hard-deletes the item and returns its id", async () => {
    resolvedValue = { data: { id: VALID_ID }, error: null };

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: VALID_ID, deleted: true });
  });

  it("returns 500 and logs on a delete failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    resolvedValue = { data: null, error: { message: "boom" } };

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
