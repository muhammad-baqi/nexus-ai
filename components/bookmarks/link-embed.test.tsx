import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkEmbed } from "./link-embed";

describe("LinkEmbed", () => {
  it("renders an iframe with the youtube-nocookie src and the passed title for a YouTube URL", () => {
    render(<LinkEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="My Video" />);

    const iframe = screen.getByTitle("My Video");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("renders an iframe with the player.vimeo.com src for a Vimeo URL", () => {
    render(<LinkEmbed url="https://vimeo.com/76979871" title="My Vimeo Video" />);

    const iframe = screen.getByTitle("My Vimeo Video");
    expect(iframe).toHaveAttribute("src", "https://player.vimeo.com/video/76979871");
  });

  it("renders nothing for a URL that isn't a recognized video link", () => {
    const { container } = render(
      <LinkEmbed url="https://example.com/some-article" title="An Article" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
