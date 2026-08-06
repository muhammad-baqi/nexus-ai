import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const single = vi.fn();
const update = vi.fn();
const eqUpdate = vi.fn();
const selectAfterUpdate = vi.fn();
const createSignedUrl = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({ eq: () => ({ single }) }),
      update: (values: unknown) => {
        update(values);
        return { eq: eqUpdate };
      },
    }),
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

import { GET, PATCH } from "./route";

function patchRequestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("GET /api/settings", () => {
  beforeEach(() => {
    getUser.mockReset();
    single.mockReset();
    createSignedUrl.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns the profile with no avatar_url when none is set", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    single.mockResolvedValue({ data: { display_name: "Ada", avatar_url: null } });

    const response = await GET();

    expect(await response.json()).toEqual({ display_name: "Ada", avatar_url: null });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs the stored avatar path into a URL", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    single.mockResolvedValue({ data: { display_name: "Ada", avatar_url: "user-1/avatar.png" } });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example.com/a" } });

    const response = await GET();

    expect(createSignedUrl).toHaveBeenCalledWith("user-1/avatar.png", 60 * 60);
    expect(await response.json()).toEqual({
      display_name: "Ada",
      avatar_url: "https://signed.example.com/a",
    });
  });

  it("defaults language_preference to 'en'", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    single.mockResolvedValue({ data: { display_name: "Ada", avatar_url: null, language_preference: "en" } });

    const response = await GET();

    expect(await response.json()).toMatchObject({ language_preference: "en" });
  });
});

describe("PATCH /api/settings", () => {
  beforeEach(() => {
    getUser.mockReset();
    update.mockReset();
    eqUpdate.mockReset();
    selectAfterUpdate.mockReset();
    createSignedUrl.mockReset();
    eqUpdate.mockReturnValue({
      select: () => ({ single: selectAfterUpdate }),
    });
  });

  it("returns 400 for an invalid payload", async () => {
    const response = await PATCH(patchRequestWith({ display_name: "a".repeat(101) }));

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 401 without updating when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(patchRequestWith({ display_name: "Ada" }));

    expect(response.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates only the display_name column when only display_name is sent", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    selectAfterUpdate.mockResolvedValue({ data: { display_name: "Ada", avatar_url: null } });

    const response = await PATCH(patchRequestWith({ display_name: "Ada" }));

    expect(update).toHaveBeenCalledWith({ display_name: "Ada" });
    expect(await response.json()).toEqual({ display_name: "Ada", avatar_url: null });
  });

  it("updates only the theme_preference column when only theme_preference is sent", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    selectAfterUpdate.mockResolvedValue({
      data: { display_name: null, avatar_url: null, theme_preference: "dark" },
    });

    const response = await PATCH(patchRequestWith({ theme_preference: "dark" }));

    expect(update).toHaveBeenCalledWith({ theme_preference: "dark" });
    expect(await response.json()).toEqual({
      display_name: null,
      avatar_url: null,
      theme_preference: "dark",
    });
  });

  it("updates only the avatar_url column when only avatar_path is sent", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    selectAfterUpdate.mockResolvedValue({
      data: { display_name: null, avatar_url: "user-1/avatar" },
    });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example.com/a" } });

    const response = await PATCH(patchRequestWith({ avatar_path: "user-1/avatar" }));

    expect(update).toHaveBeenCalledWith({ avatar_url: "user-1/avatar" });
    expect(await response.json()).toEqual({
      display_name: null,
      avatar_url: "https://signed.example.com/a",
    });
  });

  it("rejects an avatar_path that isn't the caller's own fixed path, without updating", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const response = await PATCH(patchRequestWith({ avatar_path: "someone-else/avatar" }));

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates only the language_preference column when only language_preference is sent", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    selectAfterUpdate.mockResolvedValue({
      data: { display_name: null, avatar_url: null, language_preference: "en" },
    });

    const response = await PATCH(patchRequestWith({ language_preference: "en" }));

    expect(update).toHaveBeenCalledWith({ language_preference: "en" });
    expect(await response.json()).toMatchObject({ language_preference: "en" });
  });

  it("rejects an invalid language_preference value with 400", async () => {
    const response = await PATCH(patchRequestWith({ language_preference: "fr" }));

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("flips notification_email_enabled true -> false -> true", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    selectAfterUpdate.mockResolvedValueOnce({
      data: { display_name: null, avatar_url: null, notification_email_enabled: false },
    });
    const toFalse = await PATCH(patchRequestWith({ notification_email_enabled: false }));
    expect(update).toHaveBeenLastCalledWith({ notification_email_enabled: false });
    expect(await toFalse.json()).toMatchObject({ notification_email_enabled: false });

    selectAfterUpdate.mockResolvedValueOnce({
      data: { display_name: null, avatar_url: null, notification_email_enabled: true },
    });
    const toTrue = await PATCH(patchRequestWith({ notification_email_enabled: true }));
    expect(update).toHaveBeenLastCalledWith({ notification_email_enabled: true });
    expect(await toTrue.json()).toMatchObject({ notification_email_enabled: true });
  });
});
