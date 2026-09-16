import { ImageResponse } from "next/og"

/**
 * The icon iOS uses when someone adds the archive to their home screen.
 *
 * The logo's arc over the word, on forest — a home-screen icon that does not
 * look like the site it opens is a small broken promise.
 */
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
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
      <svg width="62" height="20" viewBox="0 0 60 20" fill="none" aria-hidden="true">
        <path
          d="M3 16C7 6 16 2 30 2s23 4 27 14"
          stroke="#D8B25F"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          display: "flex",
          marginTop: 2,
          fontSize: 30,
          color: "#F5F1EA",
          letterSpacing: "-0.01em",
        }}
      >
        Higherway
      </div>
    </div>,
    size,
  )
}
