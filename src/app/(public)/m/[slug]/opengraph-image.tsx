import { ImageResponse } from "next/og"
import { coverArt } from "../../../../lib/art/cover"
import { materialBySlug } from "../../../../server/materials/queries"

/**
 * The picture that appears when a material is shared — in a message, on social,
 * in a search result preview.
 *
 * It reuses the same generated artwork as the material's cover, so a shared
 * link looks like the thing it points at rather than a generic banner. The
 * artwork is an SVG string, embedded as a data URI because Satori (which
 * renders this) draws images, not arbitrary inline SVG markup.
 */

export const alt = "A material from the Higherway archive"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const material = await materialBySlug(slug)

  const title = material?.title ?? "Higherway"
  const topic = material?.topics[0]?.name
  const look = material?.look ?? {
    motif: "sun" as const,
    palette: {
      sky: ["hsl(200,20%,30%)", "hsl(30,44%,54%)", "hsl(40,74%,80%)"] as [string, string, string],
      sun: "hsl(42,96%,88%)",
      sunY: 0.6,
      sunR: 40,
      ridges: [
        "hsl(200,10%,55%)",
        "hsl(200,10%,42%)",
        "hsl(200,11%,29%)",
        "hsl(200,12%,18%)",
        "hsl(200,13%,10%)",
      ] as [string, string, string, string, string],
    },
  }

  const art = coverArt({ motif: look.motif, palette: look.palette, seed: slug })
  const background = `data:image/svg+xml;base64,${Buffer.from(art).toString("base64")}`

  /** Long titles need to be smaller, or they overflow the card. */
  const fontSize = title.length > 60 ? 54 : title.length > 36 ? 68 : 84

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: "#1A231E",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: Satori renders to an image; next/image does not apply */}
      <img
        src={background}
        alt=""
        width={size.width}
        height={size.height}
        style={{ position: "absolute", inset: 0, objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(120deg, rgba(12,16,14,.88) 0%, rgba(12,16,14,.62) 45%, rgba(12,16,14,.25) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          width: "100%",
          color: "#F7F4EE",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#D8B25F",
              display: "flex",
            }}
          />
          <div style={{ fontSize: 26, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Higherway
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {topic ? (
            <div
              style={{
                fontSize: 24,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "rgba(247,244,238,.72)",
                marginBottom: 20,
              }}
            >
              {topic}
            </div>
          ) : null}
          <div style={{ fontSize, lineHeight: 1.05, maxWidth: 940, display: "flex" }}>{title}</div>
          <div
            style={{
              marginTop: 28,
              fontSize: 22,
              color: "rgba(247,244,238,.7)",
              display: "flex",
            }}
          >
            Free to read · Free to download
          </div>
        </div>
      </div>
    </div>,
    size,
  )
}
