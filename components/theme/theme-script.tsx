// Runs synchronously in <head>, before first paint, to avoid a flash of the wrong theme.
// No user input is interpolated here — safe as a static inline script, and simpler than pulling
// in a theming library (next-themes) just for this one snippet.
const THEME_SCRIPT = `
(function () {
  try {
    var match = document.cookie.match(/(?:^|; )theme=([^;]*)/);
    var pref = match ? decodeURIComponent(match[1]) : "system";
    var isDark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`;

export function ThemeScript() {
  // eslint-disable-next-line react/no-danger -- static string above, no user input
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
