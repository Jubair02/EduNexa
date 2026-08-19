/** Converts common video page URLs to embeddable iframe URLs. */
export const toEmbedUrl = (videoUrl: string): string | null => {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.pathname.startsWith("/embed/")) return videoUrl;
    if (url.pathname.startsWith("/shorts/")) {
      return `https://www.youtube.com/embed/${url.pathname.split("/")[2]}`;
    }
    return null;
  }
  if (host === "youtu.be") {
    return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") return videoUrl;

  return null;
};
