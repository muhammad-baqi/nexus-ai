import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const eqOwner = vi.fn();

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

import { GET } from "./route";

const VALID_JOB_ID = "123e4567-e89b-12d3-a456-426614174000";

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/settings/import/${VALID_JOB_ID}`);
}

describe("GET /api/settings/import/:jobId", () => {
  beforeEach(() => {
    getUser.mockReset();
    maybeSingle.mockReset();
    eqOwner.mockReset();
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

  it("returns status + created_count/skipped_count/skip_reasons once done", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    maybeSingle.mockResolvedValue({
      data: {
        id: VALID_JOB_ID,
        source_format: "json",
        status: "success",
        error_message: null,
        created_count: 3,
        skipped_count: 1,
        skip_reasons: ["\"Bad Item\" in \"Inbox\" was skipped: create failed"],
        created_at: "t",
        completed_at: "t2",
      },
      error: null,
    });

    const response = await GET(requestFor(), { params: Promise.resolve({ jobId: VALID_JOB_ID }) });

    expect(await response.json()).toMatchObject({ status: "success", created_count: 3, skipped_count: 1 });
  });

  it("404s for a job id belonging to a different owner", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET(requestFor(), { params: Promise.resolve({ jobId: VALID_JOB_ID }) });

    expect(response.status).toBe(404);
  });
});
