import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const eqOwner = vi.fn();
// vi.hoisted: referenced inside the vi.mock() factory below, which is hoisted above regular
// top-level const declarations (same reasoning as app/api/items/route.test.ts's own comment).
const { signExportUrl } = vi.hoisted(() => ({ signExportUrl: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: eqOwner }),
      }),
    }),
  }),
}));

vi.mock("@/lib/settings/signed-export-url", () => ({ signExportUrl }));

import { GET } from "./route";

const VALID_JOB_ID = "123e4567-e89b-12d3-a456-426614174000";

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/settings/export/${VALID_JOB_ID}`);
}

describe("GET /api/settings/export/:jobId", () => {
  beforeEach(() => {
    getUser.mockReset();
    maybeSingle.mockReset();
    eqOwner.mockReset();
    signExportUrl.mockReset();
    eqOwner.mockReturnValue({ maybeSingle });
  });

  it("returns 400 for a malformed job id", async () => {
    const response = await GET(requestFor(), { params: Promise.resolve({ jobId: "not-a-uuid" }) });

    expect(response.status).toBe(400);
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor(), { params: Promise.resolve({ jobId: VALID_JOB_ID }) });

    expect(response.status).toBe(401);
  });

  it("returns the job's current status", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    maybeSingle.mockResolvedValue({
      data: {
        id: VALID_JOB_ID,
        format: "json",
        status: "processing",
        error_message: null,
        created_at: "t",
        completed_at: null,
        storage_path: null,
      },
      error: null,
    });

    const response = await GET(requestFor(), { params: Promise.resolve({ jobId: VALID_JOB_ID }) });

    expect(await response.json()).toMatchObject({ status: "processing", download_url: null });
    expect(signExportUrl).not.toHaveBeenCalled();
  });

  it("includes a signed download_url only once status is success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    maybeSingle.mockResolvedValue({
      data: {
        id: VALID_JOB_ID,
        format: "json",
        status: "success",
        error_message: null,
        created_at: "t",
        completed_at: "t2",
        storage_path: "user-1/exports/job-1.json",
      },
      error: null,
    });
    signExportUrl.mockResolvedValue("https://signed.example.com/export.json");

    const response = await GET(requestFor(), { params: Promise.resolve({ jobId: VALID_JOB_ID }) });

    expect(signExportUrl).toHaveBeenCalledWith(expect.anything(), "user-1/exports/job-1.json");
    expect(await response.json()).toMatchObject({
      status: "success",
      download_url: "https://signed.example.com/export.json",
    });
  });

  it("404s for a job id belonging to a different owner (never leaks existence)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET(requestFor(), { params: Promise.resolve({ jobId: VALID_JOB_ID }) });

    expect(response.status).toBe(404);
  });
});
