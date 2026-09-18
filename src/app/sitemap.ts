import type { MetadataRoute } from "next"
import { hasSubmissions } from "../lib/env"
import { allPublishedSlugs, topicList } from "../server/materials/queries"

/**
 * The site's public address. Falling back to localhost is fine in development
 * and wrong in production — a sitemap full of localhost URLs is worse than no
 * sitemap at all, so this refuses rather than emitting one.
 */
function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_SITE_URL is not set. Set it before deploying, or the sitemap will point at localhost.",
      )
    }
    return "http://localhost:3000"
  }
  return url.replace(/\/$/, "")
}

/**
 * The sitemap, built from the database rather than kept by hand.
 *
 * This matters more here than on most sites. The materials are photographs of
 * printed pages, so without the OCR text and a crawlable URL per material,
 * 651 documents are invisible to search engines — the whole archive would be
 * reachable only by people who already have the link. ARCHITECTURE.md §9.
 */

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()

  const [materials, topics] = await Promise.all([allPublishedSlugs(), topicList()])

  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/library`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "yearly", priority: 0.4 },
    // Only when it is open. Listing a page that says "not just yet" invites a
    // crawler to index the refusal.
    ...(hasSubmissions
      ? [{ url: `${base}/submit`, changeFrequency: "yearly" as const, priority: 0.3 }]
      : []),

    ...topics.map((topic) => ({
      url: `${base}/topics/${topic.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),

    ...materials.map((material) => ({
      url: `${base}/m/${material.slug}`,
      lastModified: material.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.8,
    })),
  ]
}
