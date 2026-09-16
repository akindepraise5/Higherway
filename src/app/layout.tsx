import type { Metadata } from "next"
import { Instrument_Sans, Newsreader } from "next/font/google"
import "./globals.css"

/**
 * The two faces from the v1 site. Newsreader sets every heading; Instrument Sans
 * does the work. Both are wired to the CSS variables declared in globals.css,
 * so components reference --font-serif / --font-sans and never the font names.
 *
 * `shadcn init` added Geist here bound to --font-sans, which silently replaced
 * Instrument Sans. Removed deliberately — the typography is a design decision,
 * recorded in ARCHITECTURE.md. Do not reintroduce it by re-running init.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
})

const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Higherway — Wisdom for a more faithful life",
    template: "%s · Higherway",
  },
  description:
    "A free archive of inspired teachings, practical insights and biblical perspectives. Read every material in full, or download it.",
  openGraph: { type: "website", siteName: "Higherway", locale: "en" },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  )
}
