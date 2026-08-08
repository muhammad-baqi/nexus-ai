import { detectEmbed } from "@/lib/bookmarks/detect-embed";

type Props = {
  url: string;
  title: string;
};

// Renders nothing when `url` isn't a recognized YouTube/Vimeo link — callers fall back to their
// own existing OG-image/favicon card in that case. Shared by the owner's BookmarkView and the
// public SharedItemView (docs/02_Development/Rich_Embeds.md) since the embed carries no
// account-specific data.
export function LinkEmbed({ url, title }: Props) {
  const embed = detectEmbed(url);
  if (!embed) return null;

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
      <iframe
        src={embed.embedUrl}
        title={title}
        className="h-full w-full"
        loading="lazy"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
