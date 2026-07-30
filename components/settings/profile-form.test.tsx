import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "./profile-form";

const getUser = vi.fn();
const upload = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    storage: { from: () => ({ upload }) },
  }),
}));

describe("ProfileForm", () => {
  beforeEach(() => {
    getUser.mockReset();
    upload.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("shows initials when there is no avatar", () => {
    render(
      <ProfileForm initialDisplayName="Ada Lovelace" initialAvatarUrl={null} email="ada@example.com" />,
    );

    expect(screen.getByText("AD")).toBeInTheDocument();
  });

  it("falls back to email initials when there is no display name", () => {
    render(<ProfileForm initialDisplayName={null} initialAvatarUrl={null} email="zoe@example.com" />);

    expect(screen.getByText("ZO")).toBeInTheDocument();
  });

  it("renders the avatar image when a URL is set", () => {
    render(
      <ProfileForm
        initialDisplayName="Ada"
        initialAvatarUrl="https://signed.example.com/a"
        email="ada@example.com"
      />,
    );

    expect(screen.getByAltText("Your avatar")).toHaveAttribute(
      "src",
      "https://signed.example.com/a",
    );
  });

  it("saves the display name via PATCH /api/settings", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: "New Name", avatar_url: null }),
    });
    render(<ProfileForm initialDisplayName="Old Name" initialAvatarUrl={null} email="ada@example.com" />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ display_name: "New Name" }),
        }),
      ),
    );
    expect(await screen.findByText(/^saved\.$/i)).toBeInTheDocument();
    // The initials fallback must track the live (just-saved) name, not the original prop value —
    // otherwise it only updates on a full page reload.
    expect(screen.getByText("NE")).toBeInTheDocument();
  });

  it("rejects an oversized avatar file client-side without uploading", async () => {
    render(<ProfileForm initialDisplayName="Ada" initialAvatarUrl={null} email="ada@example.com" />);

    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Avatar"), { target: { files: [oversized] } });

    expect(await screen.findByText(/5mb or smaller/i)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file type client-side without uploading", async () => {
    render(<ProfileForm initialDisplayName="Ada" initialAvatarUrl={null} email="ada@example.com" />);

    const badType = new File(["gif-bytes"], "animated.gif", { type: "image/gif" });
    fireEvent.change(screen.getByLabelText("Avatar"), { target: { files: [badType] } });

    expect(await screen.findByText(/jpeg, png, or webp/i)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads a valid avatar, saves the path, and updates the preview", async () => {
    upload.mockResolvedValue({ error: null });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: "Ada", avatar_url: "https://signed.example.com/new" }),
    });
    render(<ProfileForm initialDisplayName="Ada" initialAvatarUrl={null} email="ada@example.com" />);

    const goodFile = new File(["small-bytes"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Avatar"), { target: { files: [goodFile] } });

    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(
        "user-1/avatar",
        goodFile,
        expect.objectContaining({ upsert: true }),
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ avatar_path: "user-1/avatar" }),
      }),
    );
    expect(await screen.findByAltText("Your avatar")).toHaveAttribute(
      "src",
      "https://signed.example.com/new",
    );
  });

  it("shows a retry-able error when the upload itself fails", async () => {
    upload.mockResolvedValue({ error: { message: "network error" } });
    render(<ProfileForm initialDisplayName="Ada" initialAvatarUrl={null} email="ada@example.com" />);

    const goodFile = new File(["small-bytes"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Avatar"), { target: { files: [goodFile] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong uploading/i);
  });
});
