import { ImageResponse } from "next/og"
import { ogFonts, Wordmark } from "../server/og/brand"

/**
 * The icon iOS uses when someone adds the archive to their home screen.
 *
 * The same lockup as everywhere else, on forest — a home-screen icon that does
 * not look like the site it opens is a small broken promise. At 180px the word
 * is the smallest it is ever set, which is exactly where a wrong face shows.
 */
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default async function AppleIcon() {
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
      }}
    >
      <Wordmark size={30} />
    </div>,
    { ...size, fonts: await ogFonts() },
  )
}
