import { ImageResponse } from "next/og"
import { ogFonts, Wordmark } from "../server/og/brand"

/**
 * The default social image, for any page without its own.
 *
 * Materials have a dynamic one at m/[slug]/opengraph-image.tsx that draws their
 * cover. Everything else — the home page, the library, topic shelves, about —
 * had no og:image at all, so a shared link previewed as a bare URL or whatever
 * the platform chose to invent.
 *
 * The mark comes from `server/og/brand`, which is the logo's own geometry and
 * the site's own serif. This route used to draw a hand-written arc with a
 * different curve to the real one, set in the renderer's default sans.
 */
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Higherway — a free archive of inspired teachings"

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1A231E",
        padding: 80,
      }}
    >
      <Wordmark size={104} />

      <div
        style={{
          display: "flex",
          marginTop: 30,
          fontSize: 30,
          color: "rgba(251,248,243,.66)",
          textAlign: "center",
        }}
      >
        Wisdom for a more faithful life
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 44,
          fontSize: 22,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "rgba(251,248,243,.45)",
        }}
      >
        Free to read · Free to download
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  )
}
