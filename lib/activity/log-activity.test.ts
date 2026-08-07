import { describe, expect, it, vi } from "vitest";

import { logActivity } from "./log-activity";

function fakeSupabase(insertResult: { error: unknown }) {
  const insert = vi.fn(async () => insertResult);
  return { from: vi.fn(() => ({ insert })), insert };
}

describe("logActivity", () => {
  it("inserts a row with the given action and target ids", async () => {
    const supabase = fakeSupabase({ error: null });

    await logActivity(supabase as never, { ownerId: "user-1", action: "created", knowledgeItemId: "item-1" });

    expect(supabase.from).toHaveBeenCalledWith("activity_log");
    expect(supabase.insert).toHaveBeenCalledWith({
      owner_id: "user-1",
      action: "created",
      knowledge_item_id: "item-1",
      collection_id: null,
    });
  });

  it("never throws when the insert fails — logs instead", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = fakeSupabase({ error: { message: "boom" } });

    await expect(
      logActivity(supabase as never, { ownerId: "user-1", action: "deleted", collectionId: "col-1" }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
