import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeSync } from "./theme-sync";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim();
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
}

describe("ThemeSync", () => {
  afterEach(() => {
    clearCookies();
    document.documentElement.classList.remove("dark");
  });

  it("applies the server-known preference when the local cookie disagrees (new device case)", () => {
    document.cookie = "theme=light";
    render(<ThemeSync preference="dark" />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.cookie).toContain("theme=dark");
  });

  it("does nothing when the cookie already matches", () => {
    document.cookie = "theme=light";
    render(<ThemeSync preference="light" />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
