import { beforeEach, describe, expect, it, vi } from "vitest";

import { runExportJob } from "./run-export-job";

type Resolved = { data: unknown; error: unknown };

function createQueryBuilder(resolved: Resolved) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: Resolved) => void) => resolve(resolved);
  return builder;
}

const JOB_ID = "job-1";
const OWNER_ID = "owner-1";

let updateCalls: { table: string; payload: unknown }[];
let uploadMock: ReturnType<typeof vi.fn>;

function createFakeSupabase() {
  return {
    from: (table: string) => {
      if (table === "export_jobs") {
        return {
          update: (payload: unknown) => {
            updateCalls.push({ table, payload });
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      // Every table buildJsonExport/buildZipExport touch — an account with no data at all is
      // enough to exercise the job's own success/failure orchestration.
      return createQueryBuilder({ data: [], error: null });
    },
    storage: { from: () => ({ upload: uploadMock }) },
  };
}

describe("runExportJob", () => {
  beforeEach(() => {
    updateCalls = [];
    uploadMock = vi.fn().mockResolvedValue({ data: {}, error: null });
  });

  it.each(["json", "markdown", "zip"] as const)(
    "%s export ends with status: 'success', a storage_path, and completed_at set",
    async (format) => {
      await runExportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, format);

      const finalUpdate = updateCalls[updateCalls.length - 1];
      expect(finalUpdate.payload).toMatchObject({
        status: "success",
        storage_path: expect.stringContaining(`${OWNER_ID}/exports/${JOB_ID}`),
      });
      expect((finalUpdate.payload as { completed_at: unknown }).completed_at).toEqual(expect.any(String));
    },
  );

  it("a Storage upload failure resolves the job to status: 'failed' with an error_message, never throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    uploadMock.mockResolvedValue({ data: null, error: { message: "quota exceeded" } });

    await expect(
      runExportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "json"),
    ).resolves.toBeUndefined();

    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate.payload).toMatchObject({ status: "failed" });
    expect((finalUpdate.payload as { error_message: unknown }).error_message).toEqual(expect.any(String));
    consoleError.mockRestore();
  });
});
