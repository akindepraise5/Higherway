import Link from "next/link"
import { Wordmark } from "./mark"

/**
 * The masthead. A plain server component: no sticky-scroll JavaScript, no menu
 * state, no hydration. The mobile menu is a details/summary element, which the
 * browser opens and closes on its own.
 */

const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/about", label: "About" },
]

export function Masthead() {
  return (
    <header className="sticky top-0 z-50 border-b border-transparent bg-[rgba(245,241,234,.86)] backdrop-blur-[14px] backdrop-saturate-150">
      <div className="mx-auto flex h-(--header-h) max-w-(--measure) items-center gap-7 px-(--gutter)">
        <Link href="/" className="mr-auto" aria-label="Higherway — home">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 sm:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative py-1.5 text-[14.5px] text-ink-2 transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/library"
          className="hidden items-center gap-2.5 rounded-full border border-ink bg-ink px-5 py-3 text-sm font-medium text-paper-2 transition-colors hover:bg-forest-2 sm:inline-flex"
        >
          Explore Library
          <Arrow />
        </Link>

        {/* Mobile: the browser owns the open/closed state, so nothing hydrates. */}
        <details className="relative sm:hidden">
          <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Menu</span>
            <span aria-hidden className="flex flex-col gap-[5px]">
              <span className="block h-[1.5px] w-[18px] rounded bg-ink" />
              <span className="block h-[1.5px] w-[18px] rounded bg-ink" />
              <span className="block h-[1.5px] w-[18px] rounded bg-ink" />
            </span>
          </summary>
          <div className="absolute right-0 top-full mt-2 w-48 rounded-md border border-line-soft bg-paper-2 p-2 shadow-lg">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded px-3 py-2.5 font-serif text-lg hover:bg-paper-3"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </header>
  )
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 flex-none ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  )
}
