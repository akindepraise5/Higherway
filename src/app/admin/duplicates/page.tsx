import type { Metadata } from "next"
import Link from "next/link"
import { DuplicateReview } from "../../../components/admin/duplicate-review"
import { requireRole } from "../../../lib/session"
import { pendingPairs } from "../../../server/duplicates/queries"

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
 */
export const metadata: Metadata = {
  title: "Duplicates",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function DuplicatesPage() {
  await requireRole("admin")
  const pairs = await pendingPairs(50)

  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Duplicates</p>
      <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
        {pairs.length === 0
          ? "Nothing waiting"
          : `${pairs.length} ${pairs.length === 1 ? "pair" : "pairs"} to look at`}
      </h1>
      <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
        Nothing here is decided for you. Keeping one archives the other — it stays in the database,
        marked as a copy of the one kept, and can be restored. Saying they are different is
        remembered, so the pair never comes back.
      </p>

      {pairs.length === 0 ? (
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
        <DuplicateReview pairs={pairs} />
      )}
    </>
  )
}
