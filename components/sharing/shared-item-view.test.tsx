import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SharedItemView } from "./shared-item-view";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 404, json: async () => body };
}

// Scoped to the Rich Link Embeds addition (docs/02_Development/Rich_Embeds.md) — this component
// had no prior unit coverage of its own (previously exercised only via a live-browser pass).
describe("SharedItemView — link embeds", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders a video embed on the public share page when the shared bookmark's saved url is a YouTube link", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        id: "item-1",
        title: "Cool Video",
        description: null,
        type: "website",
        website_metadata: {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          domain: "www.youtube.com",
          og_image_url: "https://example.com/thumb.jpg",
          favicon_url: null,
        },
      }),
    );

    render(<SharedItemView token="tok" />);

    const iframe = await screen.findByTitle("Cool Video");
    expect(iframe).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("falls back to the plain OG-image card for a shared bookmark whose URL isn't a recognized embed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        id: "item-2",
        title: "An Article",
        description: null,
        type: "website",
        website_metadata: {
          url: "https://example.com/article",
          domain: "example.com",
          og_image_url: "https://example.com/thumb.jpg",
          favicon_url: null,
        },
      }),
    );

    const { container } = render(<SharedItemView token="tok" />);

    await screen.findByText("An Article");
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/thumb.jpg");
    expect(container.querySelector("iframe")).not.toBeInTheDocument();
  });
});
