"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  initialEnabled: boolean;
};

// A single global on/off toggle (Settings.md's Notification Preferences: "reminder emails on/off
// globally" — per-channel settings beyond this one are explicitly out of scope for MVP). Same
// optimistic-update-then-PATCH-then-rollback-on-error shape as components/settings/theme-toggle.tsx.
export function NotificationToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | undefined>();

  async function handleToggle() {
    const previous = enabled;
    const next = !enabled;
    setEnabled(next);
    setError(undefined);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_email_enabled: next }),
      });

      if (!response.ok) {
        throw new Error(`PATCH /api/settings failed with status ${response.status}`);
      }
    } catch (err) {
      console.error("[notification-toggle] saving notification_email_enabled failed:", err);
      setError("Something went wrong saving this. Please try again.");
      setEnabled(previous);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Notifications</h2>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">Reminder emails</span>
        <Button type="button" variant={enabled ? "default" : "outline"} size="sm" aria-pressed={enabled} onClick={handleToggle}>
          {enabled ? "On" : "Off"}
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
