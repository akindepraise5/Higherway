import Link from "next/link"
import { pageItems, pageRange } from "../../lib/pagination"

/**
 * Pagination for the library and topic shelves.
 *
 * v1 had an infinite-scrolling grid with a "Show more" button: no addressable
 * pages, no sense of how much was left, and nothing a search engine could
 * follow. Numbered pages fix all three — every page has a shareable URL, the
 * reader can see where they are in 651 materials, and the last page is always
 * one click away.
 *
 * Server-rendered links, so it works with JavaScript switched off.
 */

type Props = {
  page: number
  pages: number
  total: number
  pageSize: number
  /** Builds the URL for a page, so each route keeps its own query string. */
  hrefFor: (page: number) => string
}

const cell =
  "grid h-11 min-w-11 place-items-center rounded-full px-3 text-[13.5px] transition-colors"

export function Pagination({ page, pages, total, pageSize, hrefFor }: Props) {
  if (pages <= 1) return null

  const items = pageItems(page, pages)
  const range = pageRange(page, pageSize, total)

  return (
    <nav
      aria-label="Pagination"
      className="mt-[clamp(32px,4vw,56px)] flex flex-col items-center gap-4 border-t border-line-soft pt-8"
    >
      <p className="text-[12.5px] text-taupe">
        Showing{" "}
        <span className="font-medium text-ink">
          {range.from}–{range.to}
        </span>{" "}
        of {range.total}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            rel="prev"
            className={`${cell} border border-line text-ink-2 hover:border-ink hover:text-ink`}
            aria-label="Previous page"
          >
            <Chevron direction="left" />
          </Link>
        ) : (
          <span className={`${cell} border border-line-soft text-ink-3/40`} aria-hidden="true">
            <Chevron direction="left" />
          </span>
        )}

        {items.map((item, i) =>
          item === "gap" ? (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: gaps have no identity of their own
              key={`gap-${i}`}
              className="grid h-11 w-6 place-items-center text-taupe"
              aria-hidden="true"
            >
              …
            </span>
          ) : item === page ? (
            <span
              key={item}
              aria-current="page"
              className={`${cell} border border-ink bg-ink font-medium text-paper-2`}
            >
              {item}
            </span>
          ) : (
            <Link
              key={item}
              href={hrefFor(item)}
              className={`${cell} border border-line text-ink-2 hover:border-ink hover:text-ink`}
              aria-label={`Page ${item}`}
            >
              {item}
            </Link>
          ),
        )}

        {page < pages ? (
          <Link
            href={hrefFor(page + 1)}
            rel="next"
            className={`${cell} border border-line text-ink-2 hover:border-ink hover:text-ink`}
            aria-label="Next page"
          >
            <Chevron direction="right" />
          </Link>
        ) : (
          <span className={`${cell} border border-line-soft text-ink-3/40`} aria-hidden="true">
            <Chevron direction="right" />
          </span>
        )}
      </div>
    </nav>
  )
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "m9 5 7 7-7 7"} />
    </svg>
  )
}
