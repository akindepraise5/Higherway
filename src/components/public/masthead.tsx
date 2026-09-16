"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logo } from "./logo"

/**
 * The masthead.
 *
 * A client component for exactly one reason: `usePathname` is what decides
 * which section carries the underline. Everything else stays off the main
 * thread — no sticky-scroll JavaScript, no menu state — and the mobile menu is
 * a details/summary element the browser opens and closes on its own.
 */

const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/about", label: "About" },
]

export function Masthead() {
  const pathname = usePathname()
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-50 border-b border-transparent bg-[rgba(245,241,234,.86)] backdrop-blur-[14px] backdrop-saturate-150">
      <div className="mx-auto flex h-(--header-h) max-w-(--measure) items-center gap-7 px-(--gutter)">
        <Link href="/" className="mr-auto" aria-label="Higherway — home">
          <Logo className="h-[38px] w-[122px] text-ink" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 sm:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group relative py-1.5 text-[14.5px] text-ink-2 transition-colors hover:text-ink aria-[current=page]:text-ink"
              aria-current={active(link.href) ? "page" : undefined}
            >
              {link.label}
              {/* v1 drew a gold rule under the section you were in, and a
                  hairline that grew in on hover. Both are worth keeping. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-px origin-left transition-transform duration-500 ${
                  active(link.href)
                    ? "scale-x-100 bg-gold"
                    : "scale-x-0 bg-ink group-hover:scale-x-100"
                }`}
              />
            </Link>
          ))}
        </nav>

        {/* Search on every page, not only once you have reached the library.
            A plain GET form to /library, the same contract the library's own
            box uses — so it needs no JavaScript, no new route, and the result
            has a shareable URL. It searches titles, summaries, authors, topic
            names and the read text of every page. */}
        <form action="/library" method="get" className="relative hidden sm:block">
          <label htmlFor="site-search" className="sr-only">
            Search materials, topics and authors
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            placeholder="Search"
            className="w-36 rounded-full border border-line-soft bg-paper-2 py-2.5 pl-10 pr-4 text-[14px] transition-[width,border-color] duration-300 focus:w-56 focus:border-ink focus:bg-white focus:outline-none"
          />
          <SearchIcon />
        </form>

        <Link
          href="/library"
          className="hidden items-center gap-2.5 rounded-full border border-ink bg-ink px-5 py-3 text-sm font-medium text-paper-2 transition-colors hover:bg-forest-2 lg:inline-flex"
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
          <div className="absolute right-0 top-full mt-2 w-60 rounded-md border border-line-soft bg-paper-2 p-2 shadow-lg">
            {/* The phone has no room for a permanent search box, so it lives in
                the menu rather than being dropped on small screens. */}
            <form action="/library" method="get" className="relative p-1">
              <label htmlFor="menu-search" className="sr-only">
                Search materials, topics and authors
              </label>
              <input
                id="menu-search"
                name="q"
                type="search"
                placeholder="Search"
                className="w-full rounded-full border border-line-soft bg-paper py-2.5 pl-9 pr-3 text-[14px] focus:border-ink focus:outline-none"
              />
              <SearchIcon className="left-3.5" />
            </form>

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

/** Sits inside the search field, so it is decoration — the label does the work. */
function SearchIcon({ className = "left-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`pointer-events-none absolute ${className} top-1/2 h-4 w-4 -translate-y-1/2 text-taupe`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
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
