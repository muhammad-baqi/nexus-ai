import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const insert = vi.fn();
const selectAfterInsert = vi.fn();
const { after, runImportJob } = vi.hoisted(() => ({
  runImportJob: vi.fn(),
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

vi.mock("@/lib/settings/jobs/run-import-job", () => ({ runImportJob }));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after };
});

import { POST } from "./route";

function requestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/settings/import", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/settings/import", () => {
  beforeEach(() => {
    getUser.mockReset();
    insert.mockReset();
    selectAfterInsert.mockReset();
    runImportJob.mockReset();
    after.mockClear();
  });

  it("returns 400 for an invalid payload", async () => {
    const response = await POST(requestWith({ storage_path: "x", source_format: "yaml" }));

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 400 when storage_path isn't under the caller's own {user.id}/imports/ prefix, no job row created", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const response = await POST(
      requestWith({ storage_path: "someone-else/imports/x/source.json", source_format: "json" }),
    );

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a pending import_jobs row and returns it with 202", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    selectAfterInsert.mockResolvedValue({
      data: { id: "job-1", source_format: "json", status: "pending", created_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });

    const response = await POST(
      requestWith({ storage_path: "user-1/imports/upload-1/source.json", source_format: "json" }),
    );

    expect(insert).toHaveBeenCalledWith({
      owner_id: "user-1",
      source_format: "json",
      source_storage_path: "user-1/imports/upload-1/source.json",
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ id: "job-1", status: "pending" });
    expect(after).toHaveBeenCalledWith(expect.any(Function));
    expect(runImportJob).toHaveBeenCalledWith(
      expect.anything(),
      "job-1",
      "user-1",
      "json",
      "user-1/imports/upload-1/source.json",
    );
  });
});
