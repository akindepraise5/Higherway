import type { Metadata } from "next"
import Link from "next/link"
import { AddMaterialDrawer } from "../../../components/admin/add-material-drawer"
import { Pagination } from "../../../components/public/pagination"
import { hasJobs } from "../../../lib/env"
import { requireSession } from "../../../lib/session"
import { exact, timeAgo, who } from "../../../lib/when"
import { describeChange } from "../../../server/activity"
import { adminCategories } from "../../../server/categories/queries"
import {
  ADMIN_PAGE_SIZE,
  adminCounts,
  adminMaterials,
  asAdminSort,
  asFilter,
  FILTERS,
} from "../../../server/materials/admin"
import { lastChanges } from "../../../server/materials/history"

/**
 * The materials list: a working surface, not a showcase.
 *
 * Rows are dense and scannable, and every filter is a link so the state of the
 * list is in the URL — an admin can send a colleague "the 367 uncategorised
 * ones" rather than describing how to get there.
 */
export const metadata: Metadata = {
  title: "Materials",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

type Search = { filter?: string; q?: string; sort?: string; page?: string }

const href = (params: Search) => {
  const qs = new URLSearchParams()
  if (params.filter && params.filter !== "all") qs.set("filter", params.filter)
  if (params.q) qs.set("q", params.q)
  if (params.sort && params.sort !== "recent") qs.set("sort", params.sort)
  if (params.page && params.page !== "1") qs.set("page", params.page)
  const s = qs.toString()
  return s ? `/admin/materials?${s}` : "/admin/materials"
}

const STATUS_STYLE: Record<string, string> = {
  published: "bg-forest/10 text-forest",
  staged: "bg-paper-3 text-taupe",
  processing: "bg-paper-3 text-taupe",
  review: "bg-gold-wash text-gold",
  archived: "bg-paper-3 text-ink-3",
  rejected: "bg-paper-3 text-ink-3",
}

export default async function AdminMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requireSession()
  const params = await searchParams

  const filter = asFilter(params.filter)
  const sort = asAdminSort(params.sort)
  const q = params.q?.trim() ?? ""
  const page = Number(params.page) || 1

  const [result, counts, topics] = await Promise.all([
    adminMaterials({ filter, q, sort, page }),
    adminCounts(),
    adminCategories(),
  ])

  // One query for the whole page, after the rows are known.
  const changes = await lastChanges(result.items.map((m) => m.id))

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Materials</p>
          <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
            {result.total} {result.total === 1 ? "material" : "materials"}
            {filter !== "all" ? (
              <span className="text-taupe">
                {" "}
                · {FILTERS.find((f) => f.value === filter)?.label}
              </span>
            ) : null}
          </h1>
        </div>

        <form action="/admin/materials" method="get" className="flex gap-2">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label htmlFor="q" className="sr-only">
            Search materials
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search titles or authors"
            className="w-56 rounded-full border border-line bg-paper-2 px-4 py-2.5 text-[14px] outline-none transition-colors focus:border-ink"
          />
          <button
            type="submit"
            className="rounded-full border border-line px-4 py-2.5 text-[13.5px] transition-colors hover:border-ink"
          >
            Search
          </button>
        </form>

        <AddMaterialDrawer jobsConfigured={hasJobs} topics={topics} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ filter: f.value, q })}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
              filter === f.value
                ? "border-ink bg-ink text-paper-2"
                : "border-line text-ink-2 hover:border-ink"
            }`}
          >
            {f.label} <span className="opacity-60">{counts[f.value]}</span>
          </Link>
        ))}
      </div>

      {result.items.length === 0 ? (
        <p className="mt-16 text-center text-ink-3">
          Nothing here.{" "}
          {q ? (
            <Link href={href({ filter })} className="border-b border-line hover:border-ink">
              Clear the search
            </Link>
          ) : (
            "This queue is empty."
          )}
        </p>
      ) : (
        <div className="mt-8 overflow-hidden rounded-[3px] border border-line-soft">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line-soft bg-paper-2 text-[11px] font-medium uppercase tracking-[.14em] text-taupe">
                <th className="px-4 py-3 font-medium">Material</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Topics</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Pages</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Text</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Last change</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((m) => (
                <tr key={m.id} className="border-b border-line-soft last:border-0 hover:bg-paper-2">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/materials/${m.id}`}
                      className="font-serif text-[16px] leading-snug hover:text-gold"
                    >
                      {m.title}
                    </Link>
                    {m.author ? (
                      <span className="mt-0.5 block text-[12.5px] text-taupe">{m.author}</span>
                    ) : null}
                  </td>

                  <td className="hidden px-4 py-3 md:table-cell">
                    {m.topics.length === 0 ? (
                      <span className="text-[12.5px] text-gold">Uncategorised</span>
                    ) : (
                      <span className="text-[12.5px] text-ink-3">
                        {m.topics.map((t) => t.name).join(", ")}
                      </span>
                    )}
                  </td>

                  <td className="hidden px-4 py-3 text-[13px] text-ink-3 sm:table-cell">
                    {m.pageCount ?? "—"}
                  </td>

                  <td className="hidden px-4 py-3 lg:table-cell">
                    {m.ocrEngine === "none" ? (
                      <span className="text-[12.5px] text-taupe">awaiting</span>
                    ) : (
                      <span className="text-[12.5px] text-ink-3">
                        {m.ocrEngine === "text_layer" ? "embedded" : m.ocrEngine}
                        {m.ocrQuality !== null ? ` · ${Math.round(m.ocrQuality * 100)}%` : ""}
                      </span>
                    )}
                  </td>

                  <td className="hidden px-4 py-3 lg:table-cell">
                    {(() => {
                      const c = changes.get(m.id)
                      if (!c) return <span className="text-[12.5px] text-taupe">—</span>
                      return (
                        <span className="text-[12.5px] text-ink-3" title={exact(c.at)}>
                          {timeAgo(c.at)}
                          <span className="block text-taupe">
                            {describeChange(c.action, c.before, c.after)} ·{" "}
                            {who(c.byName, c.byEmail)}
                          </span>
                        </span>
                      )
                    })()}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[.1em] ${
                        STATUS_STYLE[m.status] ?? "bg-paper-3 text-ink-3"
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        pageSize={ADMIN_PAGE_SIZE}
        hrefFor={(p) => href({ filter, q, sort, page: String(p) })}
      />
    </>
  )
}
