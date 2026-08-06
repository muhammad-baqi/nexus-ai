"use client";

import CodeMirrorBase from "@uiw/react-codemirror";
import { useEffect, useState } from "react";

import { resolveLanguageExtension } from "@/lib/code-snippets/languages";

type Props = {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
};

// Theme read once from the `dark` class on <html> (set by components/theme/theme-script.tsx) —
// deliberately not a live listener, same no-live-OS/explicit-toggle-while-open scope cut Day 2's
// theming feature already made for the rest of the app.
export function CodeEditor({ value, language, onChange, readOnly }: Props) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const extension = resolveLanguageExtension(language);

  return (
    <CodeMirrorBase
      value={value}
      onChange={onChange}
      editable={!readOnly}
      readOnly={readOnly}
      theme={theme}
      extensions={extension ? [extension] : []}
      basicSetup={{ lineNumbers: true, foldGutter: false }}
      className="rounded-md border border-border text-sm"
    />
  );
}
