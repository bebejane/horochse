import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/seo";
import { VENUES } from "@/lib/types";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return [
    { url: `${origin}/`, changeFrequency: "daily", priority: 1 },
    ...VENUES.map((venue) => ({
      url: `${origin}/${venue.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
