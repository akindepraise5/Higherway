import type { Metadata } from "next"
import Link from "next/link"
import { CategoryManager } from "../../../components/admin/category-manager"
import { requireSession } from "../../../lib/session"
import { adminCategories } from "../../../server/categories/queries"

/**
 * Managing categories.
 *
 * The archive arrived with 69 topics taken from the v1 spreadsheet, 19 of them
 * used exactly once — "Pain" sitting beside "Suffering". So the page leads with
 * the ones holding almost nothing: those are usually a near-duplicate of a
 * bigger shelf, and merging them is the work that actually needs doing here.
 */
export const metadata: Metadata = {
  title: "Categories",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminCategoriesPage() {
  const session = await requireSession()
  const role = ((session.user as { role?: string }).role ?? "editor") as
    | "owner"
    | "admin"
    | "editor"

  const all = await adminCategories()
  const thin = all.filter((c) => c.total <= 1)
  const filed = all.reduce((n, c) => n + c.total, 0)

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Categories</p>
          <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
            {all.length} topics
          </h1>
          <p className="mt-2 text-[14px] text-ink-2">
            {filed} filings across the archive.{" "}
            <Link
              href="/admin/materials?filter=uncategorised"
              className="border-b border-line transition-colors hover:border-ink"
            >
              See what is still uncategorised
            </Link>
            .
          </p>
        </div>
      </div>

      {thin.length > 0 ? (
        <p className="mt-6 rounded-[3px] border-l-2 border-gold bg-paper-2 px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
          <b className="font-medium text-ink">{thin.length}</b> topics hold one material or none. A
          rare topic is fine, but most of these are a near-duplicate of a larger one — merging them
          keeps the library legible.
        </p>
      ) : null}

      <CategoryManager categories={all} role={role} />
    </>
  )
}
