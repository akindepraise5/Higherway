import { Caveat } from "next/font/google"
import Link from "next/link"
import { titleCase } from "../../lib/text/title-case"
import { Sprig } from "./hero/sprig"
import { Logo } from "./logo"

/**
 * The home page's "Latest addition": the newest published material, set as a
 * book on the right, with the archive's size on the left.
 *
 * Nothing here is written by hand. The title, summary and topic are the newest
 * material's own, and both counts come from `archiveStats()` — the same
 * published records the library lists — so adding or archiving a material
 * changes them. The services that do either revalidate this page on the spot,
 * and the page's own five-minute revalidation catches anything else.
 *
 * The book is markup, not a picture: its title is the material's real title,
 * so it is correct for whatever was added last and reads at any size.
 */

/** Only the handwritten note uses it. */
const script = Caveat({ subsets: ["latin"], weight: ["400"], display: "swap" })

const DEFAULT_SUMMARY =
  "The most recent material added to the Higherway collection. Open it to read every page, or take the file with you."

const number = new Intl.NumberFormat("en")

type Props = {
  material: { slug: string; title: string; summary: string | null; topic?: string }
  stats: { materials: number; topics: number }
}

export function LatestAddition({ material, stats }: Props) {
  const href = `/m/${material.slug}`
  const figures = [
    { value: number.format(stats.materials), label: "Materials" },
    { value: number.format(stats.topics), label: "Topics" },
    { value: "Free", label: "To download" },
  ]

  return (
    <section className="overflow-hidden bg-paper-2 py-[clamp(64px,9vw,140px)]">
      <div className="mx-auto grid max-w-(--measure) items-center gap-x-[clamp(32px,5vw,80px)] gap-y-[clamp(48px,7vw,72px)] px-(--gutter) lg:grid-cols-2">
        <div>
          <p className="sr-only">Latest addition</p>
          <h2 className="max-w-[14ch] text-pretty text-[clamp(40px,5.4vw,84px)] leading-[1.02] tracking-[-0.02em] text-ink">
            <Link
              href={href}
              className="rounded-sm outline-offset-4 transition-colors hover:text-forest-2 focus-visible:outline-2 focus-visible:outline-gold"
            >
              {material.title}
            </Link>
          </h2>
          <p className="mt-[clamp(24px,2.6vw,36px)] max-w-[44ch] text-[clamp(16px,1.25vw,19px)] leading-relaxed text-ink-3">
            {material.summary ?? DEFAULT_SUMMARY}
          </p>

          <dl className="mt-[clamp(32px,3.6vw,48px)] flex max-w-[600px] border-t border-line pt-[clamp(24px,2.6vw,36px)]">
            {figures.map((f, i) => (
              // The value is shown first, but the label stays first in the
              // markup, where a screen reader expects a <dt>.
              <div
                key={f.label}
                className={`flex flex-col-reverse pr-[clamp(20px,3.4vw,56px)] ${i ? "border-l border-line pl-[clamp(20px,3.4vw,44px)]" : ""}`}
              >
                <dt className="mt-[clamp(12px,1.2vw,18px)] text-[11px] font-medium uppercase tracking-[.22em] text-taupe">
                  {f.label}
                </dt>
                <dd className="font-serif text-[clamp(34px,3.4vw,48px)] font-normal leading-none text-ink">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="@container relative mx-auto aspect-square w-full max-w-[600px]">
          <span className="absolute left-[7%] top-[5%] aspect-square w-[86%] rounded-full bg-[radial-gradient(circle_at_42%_40%,#f1ebe0_0%,#ebe4d6_62%,#e6dece_100%)]" />

          <Sprig tone="sage" className="left-[3%] top-[52%] w-[23%] -rotate-[58deg]" />
          <Sprig tone="sage" className="left-[78%] top-[32%] w-[19%] rotate-[40deg]" />

          <Link
            href={href}
            aria-label={`Read ${material.title}`}
            className="group absolute left-[17%] top-[5%] block aspect-[3/4.15] w-[61%] -rotate-[5deg] outline-offset-8 transition-[rotate,translate] duration-700 ease-hw-out hover:-translate-y-[1.5%] hover:-rotate-[3deg] focus-visible:outline-2 focus-visible:outline-gold"
          >
            {/* The block of pages behind the cover, which is what gives it depth. */}
            <span className="absolute inset-0 translate-x-[1.8%] translate-y-[1.2%] rounded-[3px] bg-[linear-gradient(90deg,#e6dfd0,#f8f3e8)] shadow-[0_50px_80px_-34px_rgba(20,26,23,.5),0_18px_30px_-18px_rgba(20,26,23,.35)] transition-shadow duration-700 group-hover:shadow-[0_64px_90px_-34px_rgba(20,26,23,.55),0_22px_34px_-18px_rgba(20,26,23,.4)]" />

            <span className="@container absolute inset-0 overflow-hidden rounded-[3px] bg-[linear-gradient(180deg,#c8cbbc_0%,#dad5c1_26%,#ead8b5_48%,#efcf9f_60%)]">
              <BookScene />

              {/* Spine: a shadowed band with a line of light where it turns. */}
              <span className="absolute inset-y-0 left-0 w-[4%] bg-[linear-gradient(90deg,rgba(20,26,23,.28),rgba(20,26,23,.08))]" />
              <span className="absolute inset-y-0 left-[4%] w-px bg-[rgba(255,255,255,.3)]" />

              <span className="relative flex flex-col items-center px-[8cqw] pt-[9cqw] text-center">
                <Logo decorative className="h-[10cqw] w-[27cqw] text-ink" />
                <span className="mt-[7cqw] text-pretty font-serif text-[10.5cqw] font-normal leading-[1.02] tracking-[-0.02em] text-ink">
                  {titleCase(material.title)}
                </span>
                <span className="mt-[5cqw] h-px w-[12cqw] bg-gold" />
                {material.topic ? (
                  <span className="mt-[4.5cqw] text-[2.9cqw] font-medium uppercase tracking-[.32em] text-ink-2">
                    {material.topic}
                  </span>
                ) : null}
              </span>

              <span className="absolute inset-x-0 bottom-[6.5cqw] text-center text-[2.3cqw] font-medium uppercase tracking-[.26em] text-[rgba(251,248,243,.85)]">
                Faith. Guidance. A brighter tomorrow.
              </span>

              {/* A band of light across the cover when it is pointed at. */}
              <span className="pointer-events-none absolute inset-0 -translate-x-[120%] bg-[linear-gradient(105deg,transparent_36%,rgba(255,255,255,.3)_50%,transparent_64%)] transition-transform duration-[1100ms] ease-hw-out group-hover:translate-x-[120%] group-focus-visible:translate-x-[120%]" />
            </span>
          </Link>

          <div aria-hidden="true" className={script.className}>
            <p className="absolute right-[1%] top-[1%] -rotate-[10deg] text-[5.2cqw] leading-[.95] text-ink-2">
              Latest
              <br />
              Addition
            </p>
            <svg
              aria-hidden="true"
              viewBox="0 0 50 60"
              className="absolute right-[7%] top-[13%] w-[7%] text-ink-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M40 4 C 46 24, 36 42, 8 52" />
              <path d="M18 44 L7 52 L19 56" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}

/** A valley at sundown with a river running through it — the cover's lower half. */
function BookScene() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 240"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-x-0 bottom-0 h-[52%] w-full"
      focusable="false"
    >
      <defs>
        <linearGradient id="latestSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EFCF9F" stopOpacity="0" />
          <stop offset=".45" stopColor="#F1D19F" />
          <stop offset="1" stopColor="#E9C58F" />
        </linearGradient>
        <radialGradient id="latestSun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#FFF3D8" stopOpacity=".9" />
          <stop offset="1" stopColor="#FFF3D8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="latestGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2E3A2D" />
          <stop offset="1" stopColor="#1B2419" />
        </linearGradient>
      </defs>
      <rect width="300" height="240" fill="url(#latestSky)" />
      <circle cx="236" cy="66" r="34" fill="url(#latestSun)" />
      <circle cx="236" cy="66" r="12" fill="#FBEBC8" />
      <path
        d="M0 92 C50 70 90 84 140 76 C190 68 240 90 300 74 V240 H0Z"
        fill="#AAA68F"
        opacity=".85"
      />
      <path d="M110 112 C165 88 230 100 300 90 V240 H110Z" fill="#8B8D77" />
      <path d="M0 106 C45 94 95 102 150 120 C120 132 60 136 0 142Z" fill="#767B65" />
      <path
        d="M300 118 C262 121 238 126 216 133 C196 140 176 147 158 156 C144 163 132 170 120 178 C138 176 156 169 172 162 C194 152 218 142 240 135 C262 128 282 125 300 124Z"
        fill="#F6E4BA"
        opacity=".9"
      />
      <path d="M0 148 C42 130 92 148 132 168 C152 180 170 202 178 240 H0Z" fill="#3E4B3B" />
      <path d="M300 146 C262 146 232 160 206 180 C192 196 186 216 184 240 H300Z" fill="#313D30" />
      <path d="M0 198 C80 186 200 198 300 192 V240 H0Z" fill="url(#latestGround)" />
    </svg>
  )
}
