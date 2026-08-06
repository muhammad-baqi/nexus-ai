"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  initialPreference: string;
};

// Only "en" is real — Settings.md: the selector must be "functional" as scaffolding for future
// localization, but only one option needs to actually work at launch. Structured as the same
// button-group control components/settings/theme-toggle.tsx uses (not a disabled input) so it
// genuinely is a working selector, just with one option today.
const OPTIONS = [{ value: "en", label: "English" }];

export function LanguageSelector({ initialPreference }: Props) {
  const [preference, setPreference] = useState(initialPreference);
  const [error, setError] = useState<string | undefined>();

  async function handleSelect(value: string) {
    const previous = preference;
    setPreference(value);
    setError(undefined);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language_preference: value }),
      });

      if (!response.ok) {
        throw new Error(`PATCH /api/settings failed with status ${response.status}`);
      }
    } catch (err) {
      console.error("[language-selector] saving language_preference failed:", err);
      setError("Something went wrong saving your language. Please try again.");
      setPreference(previous);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Language</h2>
      <div className="flex gap-2" role="group" aria-label="Language">
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
