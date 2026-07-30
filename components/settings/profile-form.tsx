"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { AVATAR_ALLOWED_MIME_TYPES, AVATAR_MAX_SIZE_BYTES } from "@/lib/validation/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  initialDisplayName: string | null;
  initialAvatarUrl: string | null;
  email: string;
};

function initialsFrom(displayName: string, email: string) {
  const source = displayName.trim() || email;
  return source.slice(0, 2).toUpperCase();
}

type AvatarStatus = "idle" | "uploading" | "error";
type NameStatus = "idle" | "saving" | "saved" | "error";

export function ProfileForm({ initialDisplayName, initialAvatarUrl, email }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>("idle");
  const [avatarError, setAvatarError] = useState<string | undefined>();
  const [nameStatus, setNameStatus] = useState<NameStatus>("idle");

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type)) {
      setAvatarStatus("error");
      setAvatarError("Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      setAvatarStatus("error");
      setAvatarError("Image must be 5MB or smaller.");
      return;
    }

    setAvatarError(undefined);
    setAvatarStatus("uploading");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAvatarStatus("error");
      setAvatarError("You must be logged in.");
      return;
    }

    // Fixed, extension-less path per user (the actual format lives in the upload's contentType,
    // which is what browsers use to render it) — re-uploading in a different format still
    // upserts the same object instead of orphaning the previous one under a different key.
    const avatarPath = `${user.id}/avatar`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(avatarPath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("[profile] avatar upload failed:", uploadError);
      setAvatarStatus("error");
      setAvatarError("Something went wrong uploading your avatar. Please try again.");
      return;
    }

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_path: avatarPath }),
    });

    if (!response.ok) {
      console.error(
        "[profile] saving avatar_path failed:",
        await response.json().catch(() => null),
      );
      setAvatarStatus("error");
      setAvatarError("Uploaded, but something went wrong saving it. Please try again.");
      return;
    }

    const body = await response.json();
    setAvatarUrl(body.avatar_url);
    setAvatarStatus("idle");
  }

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameStatus("saving");

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName.trim() }),
    });

    if (!response.ok) {
      console.error(
        "[profile] saving display name failed:",
        await response.json().catch(() => null),
      );
      setNameStatus("error");
      return;
    }

    setNameStatus("saved");
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Profile</h2>

      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // Signed URL from private Storage — its signature/query string changes per request, so
          // next/image's remote-pattern allowlist + fetch-through-optimizer model doesn't fit.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="Your avatar" className="size-16 rounded-full object-cover" />
        ) : (
          <div
            className="flex size-16 items-center justify-center rounded-full bg-muted text-lg font-semibold"
            aria-hidden="true"
          >
            {initialsFrom(displayName, email)}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="avatar">Avatar</Label>
          <Input
            id="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            disabled={avatarStatus === "uploading"}
          />
          {avatarStatus === "uploading" && (
            <p className="text-muted-foreground text-sm" role="status">
              Uploading...
            </p>
          )}
          {avatarStatus === "error" && (
            <p className="text-destructive text-sm" role="alert">
              {avatarError}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleNameSubmit} className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setNameStatus("idle");
          }}
        />
        {nameStatus === "saved" && (
          <p className="text-sm" role="status">
            Saved.
          </p>
        )}
        {nameStatus === "error" && (
          <p className="text-destructive text-sm" role="alert">
            Something went wrong saving your name. Please try again.
          </p>
        )}
        <Button type="submit" disabled={nameStatus === "saving"} className="self-start">
          {nameStatus === "saving" ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}
