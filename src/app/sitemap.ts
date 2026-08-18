import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/seo/catalog";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map((entry) => ({
    url: entry.url,
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
  }));
}
