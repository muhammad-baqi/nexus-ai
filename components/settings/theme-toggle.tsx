"use client";

import { useState } from "react";

import { applyTheme, type ThemePreference } from "@/lib/theme/apply-theme";
import { Button } from "@/components/ui/button";

type Props = {
  initialPreference: ThemePreference;
};

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle({ initialPreference }: Props) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [error, setError] = useState<string | undefined>();

  async function handleSelect(value: ThemePreference) {
    const previous = preference;
    setPreference(value);
    setError(undefined);
    applyTheme(value);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_preference: value }),
      });

      if (!response.ok) {
        throw new Error(`PATCH /api/settings failed with status ${response.status}`);
      }
    } catch (err) {
      console.error("[theme-toggle] saving theme_preference failed:", err);
      setError("Something went wrong saving your theme. Please try again.");
      setPreference(previous);
      applyTheme(previous);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Theme</h2>
      <div className="flex gap-2" role="group" aria-label="Theme">
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={preference === option.value ? "default" : "outline"}
            size="sm"
            aria-pressed={preference === option.value}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
