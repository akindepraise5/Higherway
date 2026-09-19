import { Caveat } from "next/font/google"
import Link from "next/link"
import { titleCase } from "../../../lib/text/title-case"
import styles from "./book-stack.module.css"
import { Sprig } from "./sprig"

/**
 * The fan of three books beside the home page headline.
 *
 * Built from markup rather than a picture, so every title is real text — it
 * scales, it can be edited here, and each book is a link to the shelf it
 * stands for. Sizes inside a book are in container units, so a book set small
 * on a phone is the same book, not a cropped one.
 *
 * It moves in three states, all in book-stack.module.css: at rest the books
 * drift and the leaves sway; when the pointer or keyboard focus reaches the
 * stack the fan gathers into a squared-up pile with light rising behind it;
 * and the one book pointed at comes forward while the others step back.
 *
 * To change a book, edit BOOKS. `href` should be a topic that exists; a topic
 * that is later merged keeps its old URL working (ARCHITECTURE.md §5).
 */

/** Only the handwritten notes use it, so it is loaded here and nowhere else. */
const script = Caveat({ subsets: ["latin"], weight: ["400"], display: "swap" })

/**
 * A pose, as CSS custom properties: where it rests (`--r`) and where it goes
 * when the stack gathers (`--gx`, `--gy`, `--gr`, `--gs`). Translations are a
 * share of the element's own size.
 */
type Pose = Record<`--${string}`, string>

type Book = {
  title: string
  tagline?: string
  href: string
  tone: "dark" | "light"
  scene: "dusk" | "valley" | "peak"
  /** Title size, as a share of the book's own width. */
  titleSize: string
  pose: Pose
}

/** In reading order, left to right — which is also the order the keyboard takes. */
const BOOKS: Book[] = [
  {
    title: "A Life of Prayer",
    tagline: "A closer walk with God",
    href: "/topics/prayer",
    tone: "dark",
    scene: "dusk",
    titleSize: "text-[13.5cqw]",
    pose: {
      "--left": "0%",
      "--top": "15%",
      "--w": "36%",
      "--z": "10",
      "--r": "-9deg",
      "--gx": "30%",
      "--gy": "-3%",
      "--gr": "-5deg",
      "--gs": "1",
      "--delay": "60ms",
      "--drift-delay": "-1.5s",
    },
  },
  {
    title: "Walking in Faith",
    tagline: "Trust · Obey · Grow",
    href: "/topics/faith",
    tone: "light",
    scene: "valley",
    titleSize: "text-[16cqw]",
    pose: {
      "--left": "30%",
      "--top": "4%",
      "--w": "42%",
      "--z": "20",
      "--r": "4deg",
      "--gx": "0%",
      "--gy": "-5%",
      "--gr": "0deg",
      "--gs": "1.05",
      "--delay": "0ms",
      "--drift-delay": "-4.5s",
    },
  },
  {
    title: "Purpose in Everyday Life",
    href: "/topics/purpose",
    tone: "light",
    scene: "peak",
    titleSize: "text-[13cqw]",
    pose: {
      "--left": "66%",
      "--top": "16%",
      "--w": "34%",
      "--z": "10",
      "--r": "14deg",
      "--gx": "-32%",
      "--gy": "-2%",
      "--gr": "6deg",
      "--gs": "1",
      "--delay": "120ms",
      "--drift-delay": "-7s",
    },
  },
]

/** Where each sprig sits, and how it draws in when the books gather. */
const SPRIGS: { className: string; pose: Pose }[] = [
  {
    className: "left-[15%] top-[-3%] w-[16%]",
    pose: { "--r": "-14deg", "--gr": "-4deg", "--gx": "40%", "--gy": "6%" },
  },
  {
    className: "left-[62%] top-[-1%] w-[16%]",
    pose: { "--r": "34deg", "--gr": "20deg", "--gx": "-20%", "--gy": "4%" },
  },
  {
    className: "left-[81%] top-[9%] w-[12%]",
    pose: { "--r": "52deg", "--gr": "38deg", "--gx": "-60%", "--gy": "4%" },
  },
  {
    className: "left-[1%] top-[50%] w-[13%]",
    pose: { "--r": "-116deg", "--gr": "-104deg", "--gx": "45%", "--gy": "-8%" },
  },
  {
    className: "right-[-2%] top-[50%] w-[13%]",
    pose: { "--r": "118deg", "--gr": "104deg", "--gx": "-50%", "--gy": "-6%" },
  },
]

export function BookStack() {
  return (
    <div
      className={`@container relative mx-auto aspect-[16/12.5] w-full max-w-[560px] lg:max-w-[720px] ${styles.stage}`}
    >
      <span className={styles.glow} />

      {SPRIGS.map((sprig, i) => {
        // Staggered, so the leaves settle one after another rather than as one.
        const pose: Pose = {
          ...sprig.pose,
          "--delay": `${i * 40}ms`,
          "--drift-delay": `${-2 - i * 1.7}s`,
        }
        return (
          <Sprig
            key={sprig.className}
            className={`${sprig.className} ${styles.sprig}`}
            style={pose}
          />
        )
      })}

      {BOOKS.map((book) => (
        <BookCover key={book.href} book={book} />
      ))}

      {/* Decoration, so hidden from assistive technology: the books' own
          titles already say everything these notes do. */}
      <div aria-hidden="true" className={script.className}>
        <div className={styles.note}>
          <p className="absolute left-[-2%] top-[-2%] -rotate-[14deg] text-[4.4cqw] leading-[.95] text-ink-2">
            Practical
            <br />
            teachings
          </p>
          <svg
            aria-hidden="true"
            viewBox="0 0 60 30"
            className="absolute left-[7%] top-[8%] w-[7%] text-ink-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M3 5 C 14 22, 34 26, 54 20" />
            <path d="M46 14 L55 20 L45 25" />
          </svg>
        </div>

        <div className={styles.note}>
          <svg
            aria-hidden="true"
            viewBox="0 0 40 40"
            className="absolute bottom-[14%] right-[4%] w-[5.5%] text-paper-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M34 36 C 30 22, 20 12, 6 6" />
            <path d="M6 16 L5 6 L15 4" />
          </svg>
          <p className="absolute bottom-[1%] right-[-3%] -rotate-[12deg] text-center text-[4.4cqw] leading-[.95] text-paper-2">
            For everyday
            <br />
            life
          </p>
        </div>
      </div>
    </div>
  )
}

function BookCover({ book }: { book: Book }) {
  const dark = book.tone === "dark"
  return (
    <Link
      href={book.href}
      aria-label={`${book.title} — browse the topic`}
      style={book.pose}
      className={`@container block aspect-[3/4.25] overflow-hidden rounded-[3px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-gold ${styles.book} ${
        dark
          ? "bg-[linear-gradient(160deg,#27352c_0%,#1b261f_70%)] text-paper-2"
          : "bg-[linear-gradient(170deg,#f6f0e3_0%,#ece3d0_100%)] text-ink"
      }`}
    >
      <Scene kind={book.scene} />

      {/* The spine's shadow, and a hairline of light along the fore-edge. */}
      <span className="absolute inset-y-0 left-0 w-[5%] bg-[linear-gradient(90deg,rgba(0,0,0,.22),rgba(0,0,0,0))]" />
      <span className="absolute inset-y-0 right-0 w-px bg-[rgba(255,255,255,.35)]" />

      <span className="relative flex flex-col items-center px-[9cqw] pt-[9cqw] text-center">
        <span
          className={`text-[3cqw] font-medium uppercase tracking-[.32em] ${dark ? "text-[rgba(251,248,243,.72)]" : "text-ink-2"}`}
        >
          Higherway
        </span>
        <span
          className={`mt-[7cqw] text-balance font-serif font-normal leading-[.98] tracking-[-0.02em] ${book.titleSize}`}
        >
          {titleCase(book.title)}
        </span>
        <span className={`mt-[6cqw] h-px bg-gold ${styles.rule}`} />
        {book.tagline ? (
          <span
            className={`mt-[5cqw] text-[3.2cqw] font-medium uppercase tracking-[.26em] ${dark ? "text-[rgba(251,248,243,.72)]" : "text-ink-2"}`}
          >
            {book.tagline}
          </span>
        ) : null}
      </span>

      <span className={styles.sheen} />
    </Link>
  )
}

/** The small landscape printed at the foot of each cover. */
function Scene({ kind }: { kind: Book["scene"] }) {
  const common = {
    viewBox: "0 0 300 220",
    preserveAspectRatio: "xMidYMax slice",
    className: "absolute inset-x-0 bottom-0 h-[46%] w-full",
    focusable: false,
  } as const

  if (kind === "dusk") {
    return (
      <svg aria-hidden="true" {...common}>
        <defs>
          <radialGradient id="bookDuskGlow" cx=".62" cy=".5" r=".5">
            <stop offset="0" stopColor="#E9C98A" stopOpacity=".45" />
            <stop offset="1" stopColor="#E9C98A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="300" height="220" fill="url(#bookDuskGlow)" />
        <circle cx="190" cy="118" r="13" fill="#F4E2B4" />
        <path d="M0 150 C60 120 110 132 160 140 C210 148 250 124 300 132 V220 H0Z" fill="#2E3E31" />
        <path d="M0 182 C70 160 150 172 210 178 C250 182 280 170 300 172 V220 H0Z" fill="#1A251E" />
      </svg>
    )
  }

  if (kind === "peak") {
    return (
      <svg aria-hidden="true" {...common}>
        <defs>
          <linearGradient id="bookPeakSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#EDE3CE" stopOpacity="0" />
            <stop offset="1" stopColor="#DCCFB2" />
          </linearGradient>
        </defs>
        <rect width="300" height="220" fill="url(#bookPeakSky)" />
        <path d="M0 150 L90 108 L140 124 L200 52 L300 132 V220 H0Z" fill="#8A937F" />
        <path d="M200 52 L222 70 L208 74 L196 92 L186 80Z" fill="#B7BCA9" />
        <path d="M0 176 C80 150 150 164 220 158 C260 154 285 160 300 164 V220 H0Z" fill="#56624F" />
        <path d="M0 200 C90 186 190 194 300 188 V220 H0Z" fill="#37432F" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" {...common}>
      <defs>
        <linearGradient id="bookValleySky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EFE4CD" stopOpacity="0" />
          <stop offset=".5" stopColor="#EBD6AE" />
          <stop offset="1" stopColor="#E3C995" />
        </linearGradient>
        <linearGradient id="bookValleyField" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8C7A45" />
          <stop offset="1" stopColor="#5E5431" />
        </linearGradient>
      </defs>
      <rect width="300" height="220" fill="url(#bookValleySky)" />
      <circle cx="212" cy="70" r="20" fill="#F7E8C4" opacity=".9" />
      <path
        d="M0 96 C60 76 120 92 170 84 C220 76 260 90 300 82 V220 H0Z"
        fill="#B8B69C"
        opacity=".85"
      />
      <path d="M0 122 C50 104 110 118 160 110 C210 102 250 116 300 108 V220 H0Z" fill="#8D937C" />
      <path d="M0 148 C70 128 130 144 190 134 C240 126 270 138 300 134 V220 H0Z" fill="#5E6B57" />
      <path d="M0 172 C80 156 160 168 230 160 C265 156 285 162 300 162 V220 H0Z" fill="#3F4C3F" />
      <path d="M0 196 C90 182 200 190 300 184 V220 H0Z" fill="url(#bookValleyField)" />
    </svg>
  )
}
