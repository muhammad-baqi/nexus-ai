import { THEME_PREFERENCES } from "@/lib/validation/settings";

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readThemeCookie(): ThemePreference | null {
  const match = document.cookie.match(/(?:^|; )theme=([^;]*)/);
  const value = match ? decodeURIComponent(match[1]) : null;
  return (THEME_PREFERENCES as readonly string[]).includes(value ?? "")
    ? (value as ThemePreference)
    : null;
}

// Applies a theme preference immediately (no reload) and persists it client-side via a cookie —
// the server-rendered <html> class and components/theme/theme-script.tsx's pre-paint script both
// read this same cookie on the next navigation/load.
export function applyTheme(preference: ThemePreference) {
  const isDark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
  document.cookie = `theme=${encodeURIComponent(preference)}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}`;
}
