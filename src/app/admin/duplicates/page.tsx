import type { Metadata } from "next"
import Link from "next/link"
import { DuplicateReview } from "../../../components/admin/duplicate-review"
import { Pagination } from "../../../components/public/pagination"
import { requireRole } from "../../../lib/session"
import { pendingCount, pendingPairs } from "../../../server/duplicates/queries"

/**
 * Possible duplicates, for a person to decide on.
 *
 * The archive arrived with 66 groups of materials sharing a title once case and
 * punctuation are ignored — "God offers hope" twice, "Are we ready for a
 * revival" beside "Are we ready for a Revival". Nothing is resolved
 * automatically: a pair is raised with its reasons and a person chooses.
 *
 * Strongest first, because working down from the obvious cases is quicker and
 * less tiring than starting with the ambiguous ones.
 *
 * Paginated, and the count comes from the table rather than from the page. It
 * previously fetched fifty and printed that as the total, so 83 pending pairs
 * showed as "50 pairs to look at" with 33 of them unreachable.
 */
export const metadata: Metadata = {
  title: "Duplicates",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

/** Deciding a pair means reading two documents, so a screenful is plenty. */
const PER_PAGE = 10

export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  await requireRole("admin")

  const { page: raw } = await searchParams
  const page = Math.max(1, Number(raw) || 1)

  const [total, pairs] = await Promise.all([
    pendingCount(),
    pendingPairs(PER_PAGE, (page - 1) * PER_PAGE),
  ])

  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Duplicates</p>
      <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
        {total === 0 ? "Nothing waiting" : `${total} ${total === 1 ? "pair" : "pairs"} to look at`}
      </h1>
      <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
        Nothing here is decided for you. Keeping one archives the other — it stays in the database,
        marked as a copy of the one kept, and can be restored. Saying they are different is
        remembered, so the pair never comes back.
      </p>

      {total === 0 ? (
        <div className="mt-10 rounded-[3px] border border-line-soft bg-paper-2 px-5 py-6">
          <p className="text-[14px] leading-relaxed text-ink-2">
            No pairs have been raised yet. Run{" "}
            <code className="text-ink">pnpm scan:duplicates</code> to compare every material against
            every other.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-taupe">
            It is worth waiting until the pages have been read. Titles alone find real duplicates,
            but they also flag things like <i>Exploring the word</i> against{" "}
            <i>Exploring the word Sacrifice</i> — two articles in a series, not a copy. Comparing
            the text tells those apart.{" "}
            <Link
              href="/admin/materials?filter=needs-ocr"
              className="border-b border-line transition-colors hover:border-ink"
            >
              See what is still awaiting text
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <DuplicateReview pairs={pairs} />
          <Pagination
            page={page}
            pages={pages}
            total={total}
            pageSize={PER_PAGE}
            hrefFor={(p) => (p === 1 ? "/admin/duplicates" : `/admin/duplicates?page=${p}`)}
          />
        </>
      )}
    </>
  )
}
