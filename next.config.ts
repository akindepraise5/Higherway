import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  /**
   * The social images read their two font files off disk at render time
   * (`src/server/og/brand.tsx`). That path is built at runtime, so Next's
   * tracer cannot see it by reading the source and would ship a function
   * without the fonts — which fails only in production, only on a share, and
   * only once someone looks at a preview card.
   */
  outputFileTracingIncludes: {
    "/**": ["./assets/*.ttf"],
  },
}

export default nextConfig
