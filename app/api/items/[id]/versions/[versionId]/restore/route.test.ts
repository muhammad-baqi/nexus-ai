import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_VERSION_ID = "223e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

let queues: Record<string, ResolvedValue[]>;

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "update", "insert", "eq", "is"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => builder);
  builder.then = (resolve: (value: ResolvedValue) => void) => {
    const queue = queues[table];
    resolve(queue && queue.length > 0 ? queue.shift()! : { data: null, error: null });
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => createQueryBuilder(table),
  }),
}));

import { POST } from "./route";

function requestFor() {
  return new NextRequest(
    `http://localhost:3000/api/items/${VALID_ID}/versions/${VALID_VERSION_ID}/restore`,
    { method: "POST" },
  );
}

const params = Promise.resolve({ id: VALID_ID, versionId: VALID_VERSION_ID });

function queueHappyPath(content: string) {
  queueResponse("note_versions", { data: { content }, error: null }); // version lookup
  queueResponse("knowledge_items", { data: { type: "note" }, error: null }); // type check
  queueResponse("knowledge_items", {
    data: { id: VALID_ID, title: "Trip planning", description: content },
    error: null,
  }); // item update
}

describe("POST /api/items/:id/versions/:versionId/restore", () => {
  beforeEach(() => {
    getUser.mockReset();
    queues = {};
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns 400 for a malformed item or version id", async () => {
    const response = await POST(requestFor(), {
      params: Promise.resolve({ id: "not-a-uuid", versionId: VALID_VERSION_ID }),
    });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the version doesn't exist or belongs to a different item/user", async () => {
    queueResponse("note_versions", { data: null, error: { code: "PGRST116" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(404);
  });

  it("returns 404 when the item itself no longer exists/is trashed", async () => {
    queueResponse("note_versions", { data: { content: "# Old" }, error: null });
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(404);
  });

  it("restores the content, inserts a new version entry, and returns the updated item + its id", async () => {
    queueHappyPath("# Old heading");
    queueResponse("note_versions", { data: { id: "new-version-id" }, error: null }); // new entry insert

    const response = await POST(requestFor(), { params });

    expect(await response.json()).toEqual({
      id: VALID_ID,
      title: "Trip planning",
      description: "# Old heading",
      versionId: "new-version-id",
    });
  });

  it("a failure inserting the new version entry still returns 200 with the restored item", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueHappyPath("# Old heading");
    queueResponse("note_versions", { data: null, error: { message: "insert failed" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      description: "# Old heading",
      versionId: null,
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
