import type { MetadataRoute } from "next"

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
 * Everything public is open to crawlers — the point of the archive is that
 * people can find it. The admin panel is not, and never should be.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
