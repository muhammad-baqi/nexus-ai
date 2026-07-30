"use client";

import { useEffect } from "react";

import { applyTheme, readThemeCookie, type ThemePreference } from "@/lib/theme/apply-theme";

// docs/01_MVP/Settings.md: theme preference "follows the user across devices/browsers" — this
// reconciles a signed-in session's stored preference (the source of truth) into the local
// cookie/DOM on first load of an authenticated page, covering the case where this browser never
// had a theme cookie set (e.g. a brand-new device) or has a stale one from before the account's
// preference was last changed elsewhere.
export function ThemeSync({ preference }: { preference: ThemePreference }) {
  useEffect(() => {
    if (readThemeCookie() !== preference) {
      applyTheme(preference);
    }
  }, [preference]);

  return null;
}
