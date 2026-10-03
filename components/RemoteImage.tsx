"use client";

import Image from "next/image";

import { isAllowedImageHost } from "@/lib/image-url";

/**
 * Renders an optimized `next/image` for allowlisted hosts, and a plain `<img>`
 * otherwise.
 *
 * `next/image` throws when a remote `src` host is not in `images.remotePatterns`
 * (a 500 for the whole route, not just the image). Venue posters are scraped
 * data, so an unexpected host must degrade to an unoptimized image instead of
 * taking the page down. Both call sites are fixed-ratio containers, hence `fill`.
 */
export function RemoteImage({
  src,
  alt = "",
  className,
  sizes,
  onError,
}: {
  src: string;
  alt?: string;
  className?: string;
  sizes?: string;
  onError?: () => void;
}) {
  if (isAllowedImageHost(src)) {
    return (
      <Image
        className={className}
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        onError={onError}
      />
    );
  }
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
