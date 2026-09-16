import { ImageResponse } from "next/og"

/**
 * The default social image, for any page without its own.
 *
 * Materials have a dynamic one at m/[slug]/opengraph-image.tsx that draws their
 * cover. Everything else — the home page, the library, topic shelves, about —
 * had no og:image at all, so a shared link previewed as a bare URL or whatever
 * the platform chose to invent.
 *
 * The mark is the logo's: a small arc above the word, not beside it.
 */
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Higherway — a free archive of inspired teachings"

export default function Image() {
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
      <svg width="160" height="52" viewBox="0 0 60 20" fill="none" aria-hidden="true">
        <path
          d="M3 16C7 6 16 2 30 2s23 4 27 14"
          stroke="#D8B25F"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>

      <div
        style={{
          display: "flex",
          marginTop: 2,
          fontSize: 96,
          color: "#FCFAF5",
          letterSpacing: "-0.02em",
        }}
      >
        Higherway
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 28,
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
    size,
  )
}
