import { describe, expect, it } from "vitest";

import { detectEmbed } from "./detect-embed";

describe("detectEmbed", () => {
  it("detects a youtube.com/watch?v= URL", () => {
    expect(detectEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("detects a youtu.be short URL", () => {
    expect(detectEmbed("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("detects a youtube.com/shorts/ URL", () => {
    expect(detectEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("extracts the video id correctly even with extra query params before/after v=", () => {
    expect(
      detectEmbed("https://www.youtube.com/watch?list=PLxyz&v=dQw4w9WgXcQ&t=30s"),
    ).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("passes through an already-embed youtube.com/embed/ URL", () => {
    expect(detectEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("detects a vimeo.com numeric-id URL", () => {
    expect(detectEmbed("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
  });

  it("passes through an already-embed player.vimeo.com/video/ URL", () => {
    expect(detectEmbed("https://player.vimeo.com/video/76979871")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
  });

  it("drops a trailing privacy-hash segment on an unlisted Vimeo URL, keeping just the numeric id", () => {
    expect(detectEmbed("https://vimeo.com/76979871/abcdef1234")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
  });

  it("detects an m.youtube.com URL", () => {
    expect(detectEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("returns null for a garbage-suffixed numeric path, not a partial-match embed (regression: unanchored digit regex used to accept this)", () => {
    expect(detectEmbed("https://vimeo.com/76979871abc")).toBeNull();
    expect(detectEmbed("https://player.vimeo.com/video/76979871abc")).toBeNull();
  });

  it("returns null for a lookalike host that merely contains 'youtube.com', not an exact match (host-spoofing guard)", () => {
    expect(detectEmbed("https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("returns null for a YouTube playlist-only URL (no video id)", () => {
    expect(detectEmbed("https://www.youtube.com/playlist?list=PLxyz")).toBeNull();
  });

  it("returns null for a non-video-platform URL", () => {
    expect(detectEmbed("https://example.com/some-article")).toBeNull();
  });

  it("returns null, without throwing, for malformed or empty input", () => {
    expect(detectEmbed("not a url")).toBeNull();
    expect(detectEmbed("")).toBeNull();
  });
});
