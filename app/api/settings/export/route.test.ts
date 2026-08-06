import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const insert = vi.fn();
const selectAfterInsert = vi.fn();
// vi.hoisted: referenced inside the vi.mock() factories below, which are hoisted above regular
// top-level const declarations (same reasoning as app/api/items/route.test.ts's own comment).
const { after, runExportJob } = vi.hoisted(() => ({
  runExportJob: vi.fn(),
  after: vi.fn((callback: () => void) => callback()),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      insert: (payload: unknown) => {
        insert(payload);
        return { select: () => ({ single: selectAfterInsert }) };
      },
    }),
  }),
}));

vi.mock("@/lib/settings/jobs/run-export-job", () => ({ runExportJob }));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after };
});

import { POST } from "./route";

function requestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/settings/export", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/settings/export", () => {
  beforeEach(() => {
    getUser.mockReset();
    insert.mockReset();
    selectAfterInsert.mockReset();
    runExportJob.mockReset();
    after.mockClear();
  });

  it("returns 400 for an invalid format", async () => {
    const response = await POST(requestWith({ format: "pdf" }));

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 401 without creating a job when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestWith({ format: "json" }));

    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a pending export_jobs row and returns it with 202", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    selectAfterInsert.mockResolvedValue({
      data: { id: "job-1", format: "json", status: "pending", created_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });

    const response = await POST(requestWith({ format: "json" }));

    expect(insert).toHaveBeenCalledWith({ owner_id: "user-1", format: "json" });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ id: "job-1", status: "pending" });
    expect(after).toHaveBeenCalledWith(expect.any(Function));
    expect(runExportJob).toHaveBeenCalledWith(expect.anything(), "job-1", "user-1", "json");
  });
});
