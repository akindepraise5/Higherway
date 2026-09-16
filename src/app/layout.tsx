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
  openGraph: {
    type: "website",
    siteName: "Higherway",
    locale: "en",
    title: "Higherway — Wisdom for a more faithful life",
    description:
      "A free archive of inspired teachings, practical insights and biblical perspectives.",
  },
  /**
   * Without this, a link shared on X previews as a small square thumbnail
   * rather than the wide card the OG image is drawn for.
   */
  twitter: {
    card: "summary_large_image",
    title: "Higherway — Wisdom for a more faithful life",
    description:
      "A free archive of inspired teachings, practical insights and biblical perspectives.",
  },
  /**
   * Search Console and Bing ownership tags. Set the env vars to the content
   * values each console gives you, deploy, then verify there.
   */
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${instrument.variable}`}>
      <body>
        {children}
        {/*
          One of only two pieces of client JavaScript on the public site — the
          other is the masthead, which reads the current path to underline the
          section you are in. This one earns its place: v1 addressed everything
          with hash routes (#/library?cat=faith), and a hash is never sent to
          the server, so no redirect rule, middleware or rewrite can see it.
          Old links people saved or shared would land on the home page with
          their destination silently dropped.

          It runs before paint, so a visitor following an old link sees the page
          they asked for rather than the home page first.
        */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string, no interpolation
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var h=location.hash;if(!h||h.charAt(1)!=="/")return;
var raw=h.slice(2),cut=raw.indexOf("?");
var path=cut<0?raw:raw.slice(0,cut);
var q=new URLSearchParams(cut<0?"":raw.slice(cut+1));
var to="/";
if(path===""){to="/";}
else if(path==="about"){to="/about";}
else if(path.indexOf("library")===0){
var p=new URLSearchParams();
var cat=q.get("cat");if(cat&&cat!=="all")p.set("topic",cat);
var term=q.get("q");if(term)p.set("q",term);
var sort=q.get("sort");if(sort&&sort!=="recent")p.set("sort",sort);
var s=p.toString();to="/library"+(s?"?"+s:"");}
else{to="/library";}
location.replace(to);}catch(e){}})();`,
          }}
        />
      </body>
    </html>
  )
}
