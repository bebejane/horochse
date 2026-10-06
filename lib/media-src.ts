// Strömmar från kända värdar spelas via egen väg så frekvensanalysen får ljudet.

const STREAM_HOSTS = ["bandcamp.com", "bcbits.com", "sndcdn.com", "soundcloud.com", "dzcdn.net", "deezer.com"];

export function allowedStreamHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return STREAM_HOSTS.some((root) => host === root || host.endsWith("." + root));
}

export function playbackUrl(stream: string): string {
  try {
    const url = new URL(stream);
    if (url.protocol !== "https:" || !allowedStreamHost(url.hostname)) return stream;
  } catch {
    return stream;
  }
  return "/api/media?u=" + encodeURIComponent(stream);
}
