import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, readThemeCookie } from "./apply-theme";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim();
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
}

describe("readThemeCookie", () => {
  afterEach(() => {
    clearCookies();
  });

  it("returns null when no theme cookie is set", () => {
    expect(readThemeCookie()).toBeNull();
  });

  it("returns null for an unrecognized cookie value", () => {
    document.cookie = "theme=chartreuse";
    expect(readThemeCookie()).toBeNull();
  });

  it("returns the cookie value when it's a valid preference", () => {
    document.cookie = "theme=dark";
    expect(readThemeCookie()).toBe("dark");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    clearCookies();
    document.documentElement.classList.remove("dark");
    vi.unstubAllGlobals();
  });

  it("adds the dark class and sets the cookie for 'dark'", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(readThemeCookie()).toBe("dark");
  });

  it("removes the dark class and sets the cookie for 'light'", () => {
    document.documentElement.classList.add("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(readThemeCookie()).toBe("light");
  });

  it("follows the OS preference for 'system'", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(readThemeCookie()).toBe("system");
  });
});
